/**
 * Format Conversion Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi';

export interface ConvertConfig extends BaseGeneratorConfig {
  format: VideoFormat;
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  onProgress?: GeneratorProgressCallback;
}

export interface ConvertResult extends GeneratorResult {
  format: VideoFormat;
  videoCodec: string;
  audioCodec: string;
}
