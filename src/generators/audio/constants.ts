/**
 * Audio Generator Constants
 */

import type { AudioFormat, LoudnessPreset } from './types.js';

export const DEFAULT_AUDIO_CONFIG = {
  format: 'mp3' as AudioFormat,
  bitrate: '192k',
};

export const VALID_AUDIO_FORMATS: AudioFormat[] = ['mp3', 'aac', 'wav', 'opus', 'flac'];

export const AUDIO_CODEC_MAP: Record<AudioFormat, string> = {
  'mp3': 'libmp3lame',
  'aac': 'aac',
  'wav': 'pcm_s16le',
  'opus': 'libopus',
  'flac': 'flac',
};

/**
 * Validates audio configuration
 */
export function validateAudioFormat(format: AudioFormat): void {
  if (!VALID_AUDIO_FORMATS.includes(format)) {
    throw new Error(`Invalid audio format: ${format}. Valid formats: ${VALID_AUDIO_FORMATS.join(', ')}`);
  }
}

export function validateVolume(volume: number): void {
  if (volume <= 0) {
    throw new Error('Volume must be greater than 0');
  }
  if (volume > 10) {
    throw new Error('Volume cannot exceed 10 (1000%)');
  }
}

/** Integrated-loudness targets (LUFS) per platform. */
export const LOUDNESS_PRESETS: Record<LoudnessPreset, number> = {
  youtube: -14,
  spotify: -14,
  tiktok: -14,
  broadcast: -23, // EBU R128
};

export interface LoudnormMeasurements {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/**
 * Build a `loudnorm` filter string. First pass (no measurements) measures and
 * prints JSON; second pass passes the measurements back for an accurate,
 * linear normalization.
 */
export function buildLoudnormFilter(opts: {
  targetLufs: number;
  truePeak: number;
  lra: number;
  printJson?: boolean | undefined;
  measured?: LoudnormMeasurements | undefined;
}): string {
  const parts = [`I=${opts.targetLufs}`, `TP=${opts.truePeak}`, `LRA=${opts.lra}`];
  if (opts.printJson) parts.push('print_format=json');
  if (opts.measured) {
    parts.push(
      `measured_I=${opts.measured.input_i}`,
      `measured_TP=${opts.measured.input_tp}`,
      `measured_LRA=${opts.measured.input_lra}`,
      `measured_thresh=${opts.measured.input_thresh}`,
      `offset=${opts.measured.target_offset}`,
      'linear=true',
    );
  }
  return `loudnorm=${parts.join(':')}`;
}

/** Extract the loudnorm JSON measurement block from pass-1 stderr. */
export function parseLoudnormJson(stderr: string): LoudnormMeasurements | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(stderr.slice(start, end + 1));
    if (parsed.input_i && parsed.target_offset) return parsed as LoudnormMeasurements;
    return null;
  } catch {
    return null;
  }
}
