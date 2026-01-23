/**
 * Format Conversion Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi';

export interface ConvertConfig extends BaseGeneratorConfig {
  format: VideoFormat;
  videoCodec?: string;  // Auto-selected based on format if not provided
  audioCodec?: string;  // Auto-selected based on format if not provided
  crf?: number;         // Quality (default: 23)
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
}

export interface ConvertResult extends GeneratorResult {
  format: VideoFormat;
  videoCodec: string;
  audioCodec: string;
}
