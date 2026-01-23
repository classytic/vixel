/**
 * Concatenation Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';
import type { VideoSource } from '../../types/generators.js';

export type ConcatMethod = 'auto' | 'fast' | 'reencode';

export interface ConcatConfig extends BaseGeneratorConfig {
  method?: ConcatMethod;  // 'auto' detects, 'fast' requires same codec/resolution, 'reencode' normalizes
  targetWidth?: number;   // For reencode method
  targetHeight?: number;  // For reencode method
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;          // Quality for reencode (default: 23)
}

export interface ConcatResult extends GeneratorResult {
  fileCount: number;
  method: 'fast' | 'reencode';
  totalDuration?: number;
}
