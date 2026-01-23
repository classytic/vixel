/**
 * Vixel by Classytic (@classytic/vixel)
 * ======================================
 * AI-powered video processing engine. Minimal, extensible, future-proof.
 *
 * @example
 * ```typescript
 * import { HLSProcessor, selectVariant } from '@classytic/vixel';
 *
 * // HLS Streaming - Check source and select optimal variant
 * const { variant, strategy } = selectVariant({
 *   height: 720,
 *   videoCodec: 'vp9',
 *   audioCodec: 'opus',
 * });
 *
 * // Process video to HLS
 * const processor = new HLSProcessor({
 *   variants: [variant],
 *   features: { sprites: true, chapters: true },
 * });
 *
 * const result = await processor.process({
 *   inputPath: './video.webm',
 *   outputDir: './output/hls',
 * });
 * ```
 */

// =============================================================================
// Core Exports
// =============================================================================

export { HLSProcessor } from './processor.js';
export { HLSProcessor as default } from './processor.js';

// Types
export * from './types/index.js';

// =============================================================================
// Core Utilities (Codec Detection & Quality Selection)
// =============================================================================

export {
  HLS_VIDEO_CODECS,
  HLS_AUDIO_CODECS,
  WEBM_VIDEO_CODECS,
  WEBM_AUDIO_CODECS,
  isHLSVideoCodec,
  isHLSAudioCodec,
  checkHLSCompatibility,
  type HLSCompatibility,
} from './core/codecs.js';

export {
  QUALITY_PRESETS,
  type QualityPreset,
  selectVariant,
  selectQualityLadder,
  getPreset,
  variantToPreset,
  createCopyVariant,
  type VideoSource,
  type SelectionOptions,
  type SelectionResult,
} from './core/quality.js';

export {
  probeVideo,
  formatDuration,
  type VideoMetadata,
} from './core/probe.js';

// =============================================================================
// Building Blocks (Low-Level Utilities)
// =============================================================================

export {
  applyFFmpegFilter,
} from './core/ffmpeg-filter.js';

export {
  estimateGifSize,
  optimizeGifForSize,
  getRecommendedGifConfig,
  validateGifDuration,
  PLATFORM_LIMITS,
} from './generators/gif/size-optimizer.js';

export type {
  FFmpegFilterConfig,
  FFmpegFilterResult,
  FFmpegProgress,
  FFmpegInput,
  GifPlatform,
  GifSizeEstimate,
  OptimizedGifConfig,
  FFmpegCommandConfig,
  CommandValidationResult,
} from './types/building-blocks.js';

// =============================================================================
// Generators (GIF, Thumbnails, Sprites, Chapters)
// =============================================================================

export {
  // GIF Generator
  generateGif,
  // Thumbnail Generator
  extractThumbnail,
  extractThumbnails,
  estimateThumbnailSize,
  // Sprite Generator
  generateSprites,
  // Chapter Generator
  generateChapters,
  generateSmartChapters,
  generateChaptersFromTranscript,
  // Watermark Generator
  addWatermark,
  // Crop/Resize Generator
  cropResize,
  // Compression Generator
  compressVideo,
  detectHardwareAccel,
  // Trim/Clip Generator
  trimVideo,
  // Audio Generator
  extractAudio,
  replaceAudio,
  adjustVolume,
  normalizeAudio,
  // Concatenation Generator
  concatenateVideos,
  // Speed Adjustment Generator
  changeSpeed,
  // Format Conversion Generator
  convertFormat,
} from './generators/index.js';

export type {
  // GIF types
  GifConfig,
  GifResult,
  GifOutputFormat,
  GifOptimizationStrategy,
  TimeRange,
  // Thumbnail types
  ThumbnailConfig,
  ThumbnailResult,
  ThumbnailsResult,
  ThumbnailFormat,
  ThumbnailStrategy,
  ThumbnailOptions,
  TimestampThumbnail,
  SmartThumbnail,
  IntervalThumbnails,
  // Sprite types
  SpriteConfig,
  SpriteResult,
  // Chapter types
  ChapterConfig,
  ChapterResult,
  ChapterMode,
  Chapter,
  DetectedScene,
  // Watermark types
  WatermarkConfig,
  ImageWatermarkConfig,
  TextWatermarkConfig,
  WatermarkResult,
  WatermarkPosition,
  WatermarkType,
  // Crop/Resize types
  CropResizeConfig,
  CropResizeResult,
  AspectRatioPreset,
  // Compression types
  CompressionConfig,
  CompressionResult,
  VideoCodec,
  HardwareAccel,
  EncodingPreset,
  AudioCodec,
  // Trim/Clip types
  TrimConfig,
  TrimResult,
  // Audio types
  AudioExtractConfig,
  VolumeConfig,
  AudioResult,
  AudioFormat,
  // Concatenation types
  ConcatConfig,
  ConcatResult,
  ConcatMethod,
  // Speed Adjustment types
  SpeedConfig,
  SpeedResult,
  // Format Conversion types
  ConvertConfig,
  ConvertResult,
  VideoFormat,
  // Shared types
  VideoSource as GeneratorVideoSource,
  BaseGeneratorConfig,
  InferGeneratorResult,
  ExtractGeneratorType,
  GeneratorFn,
  GeneratorResult,
} from './generators/index.js';

// =============================================================================
// Encoding (Variant Encoder)
// =============================================================================

export {
  VariantEncoder,
  type EncodeOptions,
  type EncodeResult,
} from './encoding/variant-encoder.js';

// =============================================================================
// Utilities
// =============================================================================

export { formatWebVTTTime, Logger } from './utils/logger.js';
