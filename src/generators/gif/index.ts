/**
 * GIF Generator Module
 * =====================
 * High-quality GIF/WebP generation with two-pass palette optimization.
 *
 * @example
 * ```typescript
 * import { generateGif, estimateGifSize } from '@classytic/vixel/generators/gif';
 *
 * // Generate high-quality GIF
 * const result = await generateGif(
 *   { inputPath: './video.mp4', duration: 120 },
 *   { start: 10, end: 15 },
 *   './output',
 *   { format: 'gif', width: 480, optimization: 'quality' }
 * );
 *
 * // Estimate file size before generation
 * const estimatedSize = estimateGifSize(480, 15, 5); // 480px, 15fps, 5 seconds
 * ```
 *
 * @module generators/gif
 */

// Generator function
export { generateGif, estimateGifSize } from './generator.js';

// Types
export type {
  GifConfig,
  GifResult,
  GifOutputFormat,
  GifOptimizationStrategy,
  TimeRange,
  VideoSource,
} from './types.js';

// Constants (for advanced users)
export {
  DEFAULT_GIF_WIDTH,
  DEFAULT_GIF_FPS,
  DEFAULT_GIF_OPTIMIZATION,
  MAX_GIF_DURATION,
  DEFAULT_WEBP_QUALITY,
} from './constants.js';

// Size optimization utilities
export {
  estimateGifSize as estimateGifSizeAdvanced,
  optimizeGifForSize,
  getRecommendedGifConfig,
  validateGifDuration,
  PLATFORM_LIMITS,
} from './size-optimizer.js';
