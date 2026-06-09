/**
 * Beat sync — the "auto-edit" primitive.
 * ======================================
 * Detect strong audio onsets (beats) and snap clip cuts to them, emitting an
 * intent-level {@link VixelSpec} a host passes straight to `compose()`.
 *
 * Zero-dependency: ffmpeg decodes the audio to mono PCM, the onset detection is
 * pure JS (energy-flux peak-picking). Honest scope — this is best-effort
 * *onset* detection (cuts land on transients / strong beats), not full tempo
 * tracking. The pure pieces (`pickOnsets`, `estimateBpm`, `beatSyncSpec`) are
 * exported for testing and for hosts that already have beat times.
 */

import { spawn } from 'node:child_process';
import type { VideoSource } from '../types/generators.js';
import type { VixelSpec, Clip } from './schema.js';
import { FFmpegError } from '../errors.js';

export interface DetectBeatsConfig {
  ffmpegPath?: string;
  /** Analysis sample rate (Hz). Default `22050`. */
  sampleRate?: number;
  /** Hop size in samples per energy frame. Default `512` (~23 ms @ 22050). */
  hopSize?: number;
  /** Minimum seconds between beats. Default `0.25` (caps at ~240 BPM). */
  minGapSec?: number;
  /** Peak sensitivity: threshold = mean + sensitivity·std. Lower = more beats. Default `1.3`. */
  sensitivity?: number;
  signal?: AbortSignal;
}

export interface BeatDetectionResult {
  /** Detected onset/beat times in seconds. */
  beats: number[];
  /** Estimated tempo from the median inter-beat interval (0 if too few beats). */
  bpm: number;
  /** Analyzed audio duration in seconds. */
  durationSec: number;
}

/**
 * Pure onset peak-picking over an energy envelope. Picks local maxima of the
 * positive energy flux that clear an adaptive threshold and a minimum gap.
 */
export function pickOnsets(
  energy: readonly number[],
  opts: { hopSec: number; minGapSec: number; sensitivity: number },
): number[] {
  const n = energy.length;
  if (n < 3) return [];

  // Onset detection function: positive frame-to-frame energy increase.
  const odf = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) odf[i] = Math.max(0, energy[i]! - energy[i - 1]!);

  const mean = odf.reduce((a, b) => a + b, 0) / n;
  const variance = odf.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const threshold = mean + opts.sensitivity * std;
  const minGapFrames = Math.max(1, Math.round(opts.minGapSec / opts.hopSec));

  const beats: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    const v = odf[i]!;
    if (v > threshold && v >= odf[i - 1]! && v >= odf[i + 1]! && i - last >= minGapFrames) {
      beats.push(Number((i * opts.hopSec).toFixed(3)));
      last = i;
    }
  }
  return beats;
}

/** Estimate BPM from the median inter-beat interval. */
export function estimateBpm(beats: readonly number[]): number {
  if (beats.length < 2) return 0;
  const iois: number[] = [];
  for (let i = 1; i < beats.length; i++) iois.push(beats[i]! - beats[i - 1]!);
  iois.sort((a, b) => a - b);
  const median = iois[Math.floor(iois.length / 2)]!;
  return median > 0 ? Math.round(60 / median) : 0;
}

/** Decode an input's first audio stream to mono s16le PCM (returns the raw buffer). */
function decodePcmMono(ffmpegPath: string, input: string, sampleRate: number, signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = ['-i', input, '-map', '0:a:0', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-'];
    const proc = spawn(ffmpegPath, args, signal ? { signal } : {});
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(FFmpegError.failed(code, stderr, { op: 'detectBeats', input }));
    });
  });
}

/**
 * Detect beats in a source's audio: decode → energy envelope → onset picking.
 */
export async function detectBeats(source: VideoSource, config: DetectBeatsConfig = {}): Promise<BeatDetectionResult> {
  const sampleRate = config.sampleRate ?? 22050;
  const hopSize = config.hopSize ?? 512;
  const hopSec = hopSize / sampleRate;

  const pcm = await decodePcmMono(config.ffmpegPath ?? 'ffmpeg', source.inputPath, sampleRate, config.signal);

  const totalSamples = Math.floor(pcm.length / 2); // 2 bytes / sample (s16le)
  const frames = Math.floor(totalSamples / hopSize);
  const energy = new Array<number>(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hopSize * 2;
    for (let s = 0; s < hopSize; s++) {
      const v = pcm.readInt16LE(base + s * 2) / 32768;
      sum += v * v;
    }
    energy[f] = Math.sqrt(sum / hopSize);
  }

  const beats = pickOnsets(energy, {
    hopSec,
    minGapSec: config.minGapSec ?? 0.25,
    sensitivity: config.sensitivity ?? 1.3,
  });
  return { beats, bpm: estimateBpm(beats), durationSec: Number((totalSamples / sampleRate).toFixed(3)) };
}

export interface BeatSyncOptions {
  /** Ordered clip sources to distribute across the beats. */
  sources: readonly string[];
  /** Beat times (seconds), e.g. from {@link detectBeats}. */
  beats: readonly number[];
  /** Output canvas. */
  output: { width: number; height: number; fps: number };
  /** Cut every Nth beat (default `1` — every beat). */
  everyNthBeat?: number;
  /** Ignore beats before this time (seconds). Default `0`. */
  startSec?: number;
  /** Reuse `sources` cyclically when there are more cuts than clips. Default `true`. */
  loopSources?: boolean;
  /** Drop intervals shorter than this (seconds). Default `0.2`. */
  minClipSec?: number;
  /** Add the analyzed track as a music bed (its path). */
  audioSource?: string;
}

/**
 * Build an intent-level {@link VixelSpec} whose clip cuts land on the beats —
 * pure (no I/O), so it's fully testable and a host can tweak before rendering.
 */
export function beatSyncSpec(opts: BeatSyncOptions): VixelSpec {
  const { sources, output } = opts;
  if (sources.length === 0) throw new Error('beatSyncSpec requires at least one source');

  const everyNth = Math.max(1, Math.round(opts.everyNthBeat ?? 1));
  const startSec = opts.startSec ?? 0;
  const minClip = opts.minClipSec ?? 0.2;
  const loop = opts.loopSources ?? true;

  // Cut boundaries: the kept beats at/after startSec, every Nth.
  const boundaries = opts.beats.filter((b) => b >= startSec).filter((_, i) => i % everyNth === 0);

  const clips: Clip[] = [];
  let srcIdx = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const duration = Number((boundaries[i + 1]! - boundaries[i]!).toFixed(3));
    if (duration < minClip) continue;
    const source = loop ? sources[srcIdx % sources.length]! : sources[srcIdx];
    if (source === undefined) break; // ran out of sources and not looping
    clips.push({ source, duration });
    srcIdx++;
  }

  const tracks: VixelSpec['tracks'] = [{ type: 'video', clips }];
  if (opts.audioSource) {
    tracks.push({ type: 'audio', items: [{ source: opts.audioSource, role: 'music' }] });
  }
  return { version: 1, output, tracks };
}
