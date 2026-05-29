/**
 * Concatenation Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';
import type { VideoSource } from '../../types/generators.js';

export type ConcatMethod = 'auto' | 'fast' | 'reencode';

export interface ConcatConfig extends BaseGeneratorConfig {
  method?: ConcatMethod;
  targetWidth?: number;
  targetHeight?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  onProgress?: (progress: { percentage: number; currentSec: number; totalSec: number }) => void;
}

export interface ConcatResult extends GeneratorResult {
  fileCount: number;
  method: 'fast' | 'reencode';
  totalDuration?: number;
}
