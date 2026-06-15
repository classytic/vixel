/**
 * Color Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface ColorAdjustConfig extends BaseGeneratorConfig {
  /** Brightness, -1..1 (default: 0). */
  brightness?: number;
  /** Contrast, -2..2 (default: 1 = unchanged). */
  contrast?: number;
  /** Saturation, 0..3 (default: 1 = unchanged). */
  saturation?: number;
  /** Gamma, 0.1..10 (default: 1 = unchanged). */
  gamma?: number;
  /** Sharpen amount, 0..2+ (default: 0 = off). Applies `unsharp`. */
  sharpen?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface ColorLutConfig extends BaseGeneratorConfig {
  /** Path to a .cube 3D LUT file. */
  lutPath: string;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface ColorResult extends GeneratorResult {
  /** 'adjust' (eq/unsharp) or 'lut' (lut3d). */
  mode: 'adjust' | 'lut';
}
