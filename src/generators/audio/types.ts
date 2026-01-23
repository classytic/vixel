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

export interface AudioResult extends GeneratorResult {
  audioCodec?: string;
  bitrate?: string;
}
