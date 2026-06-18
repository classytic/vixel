/**
 * Audio mixdown for in-browser export — the Web Audio half of the common engine.
 * ============================================================================
 * Mirrors the engine's audio lane: every source with sound (base-track video
 * clips, PiP video overlays, and `AudioItem`s — music/voice/sfx) is decoded and
 * placed on an `OfflineAudioContext` at its timeline position, with gain, trim,
 * loop, and fades, then rendered to one `AudioBuffer` the exporter encodes to AAC.
 *
 * Honest scope: ducking (sidechain) is approximated as plain gain for now — a
 * compressor-graph follow-up; ffmpeg keeps the precise sidechain on the server.
 */
import type { VixelSpec, Keyframe } from '@classytic/vixel-schema';
import { sourceUrl, sampleChannel } from '@classytic/vixel-schema';
import { totalDurationSec, layoutLane } from '../shared/utils/spec.js';

const SAMPLE_RATE = 48_000;

/** dB → linear amplitude (0 dB = 1.0). `AudioItem.gain`/`gainKeyframes` are dB. */
const dbToLinear = (db: number): number => Math.pow(10, db / 20);

interface AudioJob {
  url: string;
  startSec: number; // timeline position
  inSec: number; // offset into the source
  durSec?: number; // shown length (undefined = to source end)
  gain: number; // LINEAR amplitude
  /** dB gain ENVELOPE (element-relative), if any — replaces static gain + fades. */
  gainEnv?: Keyframe[];
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
}

/** Collect every sounding source in the spec as a placement job. */
function collectAudioJobs(spec: VixelSpec): AudioJob[] {
  const jobs: AudioJob[] = [];
  for (const track of spec.tracks) {
    if (track.type === 'visual') {
      // Every video clip on any visual lane carries source audio at its timeline position.
      for (const l of layoutLane(track)) {
        const c = l.clip;
        if (c.media.kind !== 'video' || c.muted || c.hidden) continue;
        const url = sourceUrl(c.media.source);
        if (url) jobs.push({ url, startSec: l.startSec, inSec: c.media.trimStart ?? 0, durSec: l.durationSec, gain: c.volume ?? 1 });
      }
    } else {
      for (const it of track.items) {
        const url = sourceUrl(it.source);
        if (!url) continue;
        const inSec = it.in ?? 0;
        jobs.push({
          url,
          startSec: it.at ?? 0,
          inSec,
          durSec: it.out != null ? Math.max(0, it.out - inSec) : undefined,
          // AudioItem gain is dB (0 = unity) — convert, so voice (0) + music (-14)
          // aren't silenced by `Math.max(0, dB)` (the preview already does this).
          gain: dbToLinear(it.gain ?? 0),
          gainEnv: it.gainKeyframes,
          fadeIn: it.fadeIn,
          fadeOut: it.fadeOut,
          loop: it.loop,
        });
      }
    }
  }
  return jobs;
}

/**
 * Decode + mix the spec's audio into a single {@link AudioBuffer}, or `null` if
 * there's nothing audible (e.g. an all-image slideshow with no music).
 */
export async function renderAudioMix(spec: VixelSpec): Promise<AudioBuffer | null> {
  const total = totalDurationSec(spec);
  if (total <= 0) return null;
  const jobs = collectAudioJobs(spec);
  if (jobs.length === 0) return null;

  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);

  // Decode each unique source once (image/silent sources simply fail → skipped).
  const urls = [...new Set(jobs.map((j) => j.url))];
  const buffers = new Map<string, AudioBuffer | null>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const data = await fetch(url, { mode: 'cors' }).then((r) => r.arrayBuffer());
        buffers.set(url, await ctx.decodeAudioData(data));
      } catch {
        buffers.set(url, null);
      }
    }),
  );

  let placed = 0;
  for (const j of jobs) {
    const buf = buffers.get(j.url);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (j.loop) src.loop = true;
    const g = ctx.createGain();
    const vol = Math.max(0, j.gain);
    const end = j.durSec != null ? j.startSec + j.durSec : total;
    if (j.gainEnv && j.gainEnv.length) {
      // dB ENVELOPE (auto-duck OR a manual volume curve) — the envelope IS the volume,
      // scheduled as linear-amplitude ramps offset to the job's timeline start (the
      // static gain applies only when there's no envelope). Matches the preview's
      // `effectiveDb = sample(env)`, so what you hear == what exports.
      g.gain.setValueAtTime(dbToLinear(sampleChannel(j.gainEnv, 0) ?? 0), j.startSec);
      for (const kf of j.gainEnv) {
        if (kf.t > 0) g.gain.linearRampToValueAtTime(dbToLinear(kf.value), j.startSec + kf.t);
      }
    } else {
      g.gain.setValueAtTime(vol, j.startSec);
      if (j.fadeIn) {
        g.gain.setValueAtTime(0, j.startSec);
        g.gain.linearRampToValueAtTime(vol, j.startSec + j.fadeIn);
      }
      if (j.fadeOut) {
        g.gain.setValueAtTime(vol, Math.max(j.startSec, end - j.fadeOut));
        g.gain.linearRampToValueAtTime(0, end);
      }
    }
    src.connect(g).connect(ctx.destination);
    // start(when, offset, duration?) — duration omitted plays to source end.
    if (j.durSec != null) src.start(j.startSec, j.inSec, j.durSec);
    else src.start(j.startSec, j.inSec);
    if (j.loop) src.stop(total);
    placed++;
  }
  if (placed === 0) return null;

  return ctx.startRendering();
}

export const AUDIO_SAMPLE_RATE = SAMPLE_RATE;
