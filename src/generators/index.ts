/**
 * Feature Generators
 * ===================
 * Modular, tree-shakeable video processing generators.
 *
 * @example
 * ```typescript
 * import { gif, thumbnails, sprites, chapters } from '@classytic/hls-processor';
 *
 * // Generate GIF with two-pass optimization
 * const gifResult = await gif.generate(source, timeRange, outputDir, {
 *   format: 'webp',
 *   width: 480,
 *   optimization: 'quality',
 * });
 *
 * // Extract thumbnail
 * const thumb = await thumbnails.extract(source, 30, './thumb.jpg');
 *
 * // Generate sprite sheet
 * const spriteResult = await sprites.generate(source, outputDir, {
 *   interval: 10,
 *   columns: 5,
 * });
 *
 * // Generate chapters
 * const chaptersResult = await chapters.generate(source, outputDir, {
 *   mode: 'auto',
 *   interval: 300,
 * });
 * ```
 *
 * @module generators
 */

// =============================================================================
// GIF Generator
// =============================================================================

export { generateGif, estimateGifSize } from './gif/index.js';

export type {
  GifConfig,
  GifResult,
  GifOutputFormat,
  GifOptimizationStrategy,
  TimeRange,
} from './gif/index.js';

// =============================================================================
// Thumbnail Generator
// =============================================================================

export { extractThumbnail, extractThumbnails, estimateThumbnailSize } from './thumbnails/index.js';

export type {
  ThumbnailConfig,
  ThumbnailResult,
  ThumbnailsResult,
  ThumbnailFormat,
  ThumbnailStrategy,
  ThumbnailOptions,
  TimestampThumbnail,
  SmartThumbnail,
  IntervalThumbnails,
} from './thumbnails/index.js';

// =============================================================================
// Sprite Generator
// =============================================================================

export { generateSprites } from './sprites/index.js';

export type { SpriteConfig, SpriteResult } from './sprites/index.js';

// =============================================================================
// Chapter Generator
// =============================================================================

export {
  generateChapters,
  generateSmartChapters,
  generateChaptersFromTranscript,
} from './chapters/index.js';

export type {
  ChapterConfig,
  ChapterResult,
  ChapterMode,
  Chapter,
  DetectedScene,
} from './chapters/index.js';

// =============================================================================
// Watermark Generator
// =============================================================================

export { addWatermark } from './watermark/index.js';

export type {
  WatermarkConfig,
  ImageWatermarkConfig,
  TextWatermarkConfig,
  WatermarkResult,
  WatermarkPosition,
  WatermarkType,
} from './watermark/index.js';

// =============================================================================
// Crop/Resize Generator
// =============================================================================

export { cropResize } from './crop-resize/index.js';

export type {
  CropResizeConfig,
  CropResizeResult,
  AspectRatioPreset,
} from './crop-resize/index.js';

// =============================================================================
// Compression Generator
// =============================================================================

export { compressVideo, detectHardwareAccel } from './compression/index.js';

export type {
  CompressionConfig,
  CompressionResult,
  VideoCodec,
  HardwareAccel,
  EncodingPreset,
  AudioCodec,
} from './compression/index.js';

// =============================================================================
// Trim/Clip Generator
// =============================================================================

export { trimVideo } from './trim/index.js';

export type {
  TrimConfig,
  TrimResult,
} from './trim/index.js';

// =============================================================================
// Audio Generator
// =============================================================================

export {
  extractAudio,
  replaceAudio,
  adjustVolume,
  normalizeAudio,
} from './audio/index.js';

export type {
  AudioExtractConfig,
  VolumeConfig,
  AudioResult,
  AudioFormat,
} from './audio/index.js';

// =============================================================================
// Concatenation Generator
// =============================================================================

export { concatenateVideos } from './concat/index.js';

export type {
  ConcatConfig,
  ConcatResult,
  ConcatMethod,
} from './concat/index.js';

// =============================================================================
// Speed Adjustment Generator
// =============================================================================

export { changeSpeed } from './speed/index.js';

export type {
  SpeedConfig,
  SpeedResult,
} from './speed/index.js';

// =============================================================================
// Format Conversion Generator
// =============================================================================

export { convertFormat } from './convert/index.js';

export type {
  ConvertConfig,
  ConvertResult,
  VideoFormat,
} from './convert/index.js';

// =============================================================================
// Shared Types
// =============================================================================

export type {
  VideoSource,
  BaseGeneratorConfig,
  InferGeneratorResult,
  ExtractGeneratorType,
  GeneratorFn,
  GeneratorResult,
} from '../types/generators.js';
