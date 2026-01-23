/**
 * Trim/Clip Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export interface TrimConfig extends BaseGeneratorConfig {
  start: number;        // Start time in seconds
  end?: number;         // End time (optional, uses duration if not provided)
  accurate?: boolean;   // Accurate trim (re-encode) or fast (copy)
  videoCodec?: 'copy' | 'libx264' | 'libx265';
  crf?: number;        // Quality if re-encoding (default: 23)
}

export interface TrimResult extends GeneratorResult {
  start: number;
  duration: number;
  method: 'fast' | 'accurate';
}
