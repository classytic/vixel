/**
 * Audio Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export type AudioFormat = 'mp3' | 'aac' | 'wav' | 'opus' | 'flac';

export interface AudioExtractConfig extends BaseGeneratorConfig {
  format?: AudioFormat;
  bitrate?: string;  // e.g., '128k', '192k', '320k'
}

export interface VolumeConfig extends BaseGeneratorConfig {
  volume: number;  // 0.5 = 50%, 1.0 = 100%, 2.0 = 200%
}

/** Platform loudness presets (integrated LUFS). */
export type LoudnessPreset = 'youtube' | 'spotify' | 'broadcast' | 'tiktok';

export interface LoudnessConfig extends BaseGeneratorConfig {
  /** Target integrated loudness in LUFS (default: -14, YouTube/streaming). */
  targetLufs?: number;
  /** Maximum true peak in dBTP (default: -1). */
  truePeak?: number;
  /** Loudness range in LU (default: 11). */
  lra?: number;
  /** Two-pass analysis for accurate normalization (slower, default: true). */
  twoPass?: boolean;
  /** Convenience: a platform preset that sets targetLufs (overridden by explicit values). */
  preset?: LoudnessPreset;
  /** Output audio codec (default: 'aac'). */
  audioCodec?: string;
}

export interface AudioResult extends GeneratorResult {
  audioCodec?: string;
  bitrate?: string;
}
