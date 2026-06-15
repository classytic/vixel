/**
 * Trim/Clip Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export interface TrimConfig extends BaseGeneratorConfig {
  start: number;
  end?: number;
  accurate?: boolean;
  videoCodec?: 'copy' | 'libx264' | 'libx265';
  crf?: number;
  onProgress?: (progress: { percentage: number; currentSec: number; totalSec: number }) => void;
}

export interface TrimResult extends GeneratorResult {
  start: number;
  duration: number;
  method: 'fast' | 'accurate';
}
