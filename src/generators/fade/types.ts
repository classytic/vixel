/**
 * Fade Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface FadeConfig extends BaseGeneratorConfig {
  /** Fade-in duration in seconds (from the start). */
  fadeIn?: number;
  /** Fade-out duration in seconds (to the end). Needs the source duration. */
  fadeOut?: number;
  /** Fade color for video (default: 'black'). */
  color?: 'black' | 'white';
  /** Also fade the audio (default: true). */
  audio?: boolean;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface FadeResult extends GeneratorResult {
  fadeIn: number;
  fadeOut: number;
}
