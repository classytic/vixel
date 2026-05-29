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

// Errors, codes, guards, tryCatch
export {
  ErrorCode,
  VixelError,
  FFmpegError,
  HLSProcessorError,
  AbortError,
  isVixelError,
  isFFmpegError,
  isHLSProcessorError,
  isAbortError,
  tryCatch,
  tryCatchSync,
  type VixelResult,
} from './errors.js';

// =============================================================================
// Composition — Fluent Pipeline
// =============================================================================

export {
  pipeline,
  VideoPipeline,
  type PipelineOptions,
  type PipelineResult,
  type PipelineProgress,
} from './pipeline.js';

// =============================================================================
// Infrastructure — spawn, temp files, concurrency
// =============================================================================

export {
  spawnFFmpeg,
  buildCommandString,
  configToSpawnOptions,
  checkFFmpegVersion,
  type SpawnFFmpegOptions,
  type SpawnFFmpegProgress,
  type FFmpegCommand,
} from './core/ffmpeg-spawn.js';

export {
  TempFileManager,
  removeQuietly,
  outputSize,
} from './core/temp-manager.js';

export {
  createLimiter,
  mapWithConcurrency,
  mapSettled,
  type Task,
} from './core/concurrency.js';

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
  // Audio Mix Generator (voiceover + music ducking)
  mixAudio,
  buildAudioMixFilter,
  // Caption Burn-in Generator
  burnCaptions,
  buildSubtitlesFilter,
  buildDrawtextFilter,
  escapeSubtitlePath,
  escapeDrawtext,
  // Transition Concat Generator
  concatWithTransitions,
  buildXfadeGraph,
  // Reframe Generator
  reframe,
  buildReframeFilter,
  ASPECT_DIMENSIONS,
  // Fade Generator
  fade,
  buildFadeFilters,
  // Frame Extraction Generator
  extractFrameAt,
  // Audio loudness
  normalizeLoudness,
  buildLoudnormFilter,
  LOUDNESS_PRESETS,
  // Ken Burns Generator
  kenBurns,
  buildKenBurnsFilter,
  // Slideshow Generator
  slideshow,
  // Color Generator
  adjustColor,
  applyLut,
  buildColorAdjustFilter,
  buildLut3dFilter,
  // Glow / Bloom Generator
  glow,
  buildGlowFilter,
  // Parallax (2.5D) Generator
  parallax3d,
  buildParallaxFilter,
  // Overlay Generator (atmosphere overlays)
  overlay,
  buildOverlayFilter,
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
  // Audio Mix types
  AudioMixConfig,
  AudioMixResult,
  // Caption types
  CaptionConfig,
  CaptionResult,
  CaptionPosition,
  // Transition types
  TransitionConfig,
  TransitionResult,
  XfadeTransition,
  // Reframe types
  ReframeConfig,
  ReframeResult,
  ReframeAspect,
  ReframeMode,
  // Fade types
  FadeConfig,
  FadeResult,
  // Frame types
  FrameConfig,
  FrameResult,
  FrameFormat,
  // Audio loudness types
  LoudnessConfig,
  LoudnessPreset,
  // Ken Burns types
  KenBurnsConfig,
  KenBurnsResult,
  KenBurnsDirection,
  // Slideshow types
  Slide,
  SlideshowConfig,
  SlideshowResult,
  // Color types
  ColorAdjustConfig,
  ColorLutConfig,
  ColorResult,
  // Glow types
  GlowConfig,
  GlowResult,
  // Parallax types
  ParallaxConfig,
  ParallaxResult,
  ParallaxMode,
  // Overlay types
  OverlayConfig,
  OverlayResult,
  OverlayBlend,
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
