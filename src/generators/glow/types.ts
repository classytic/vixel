/**
 * Glow / Bloom Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface GlowConfig extends BaseGeneratorConfig {
  /** Blur radius for the bloom layer (default: 8). Higher = dreamier. */
  sigma?: number;
  /** Gaussian approximation steps, 1-6 (default: 4). Higher = smoother bloom. */
  steps?: number;
  /** Screen-blend opacity of the bloom, 0-1 (default: 0.4). */
  intensity?: number;
  /** Only bloom bright areas (default: false — whole-frame soft glow). */
  highlightsOnly?: boolean;
  /** Luma threshold 0-255 for `highlightsOnly` (default: 180). */
  threshold?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface GlowResult extends GeneratorResult {
  /** Whether only highlights were bloomed. */
  highlightsOnly: boolean;
}
