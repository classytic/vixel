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
  normalizeLoudness,
  buildLoudnormFilter,
  LOUDNESS_PRESETS,
} from './audio/index.js';

export type {
  AudioExtractConfig,
  VolumeConfig,
  AudioResult,
  AudioFormat,
  LoudnessConfig,
  LoudnessPreset,
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
// Audio Mix Generator (voiceover + music ducking)
// =============================================================================

export { mixAudio, buildAudioMixFilter } from './audio-mix/index.js';

export type { AudioMixConfig, AudioMixResult } from './audio-mix/index.js';

// =============================================================================
// Caption Burn-in Generator
// =============================================================================

export {
  burnCaptions,
  buildSubtitlesFilter,
  buildDrawtextFilter,
  escapeSubtitlePath,
  escapeDrawtext,
} from './captions/index.js';

export type { CaptionConfig, CaptionResult, CaptionPosition } from './captions/index.js';

// =============================================================================
// Transition Concat Generator (xfade / acrossfade)
// =============================================================================

export { concatWithTransitions, buildXfadeGraph } from './transitions/index.js';

export type { TransitionConfig, TransitionResult, XfadeTransition } from './transitions/index.js';

// =============================================================================
// Reframe Generator (aspect ratio adaptation)
// =============================================================================

export { reframe, buildReframeFilter, ASPECT_DIMENSIONS } from './reframe/index.js';

export type { ReframeConfig, ReframeResult, ReframeAspect, ReframeMode } from './reframe/index.js';

// =============================================================================
// Fade Generator
// =============================================================================

export { fade, buildFadeFilters } from './fade/index.js';

export type { FadeConfig, FadeResult } from './fade/index.js';

// =============================================================================
// Frame Extraction Generator
// =============================================================================

export { extractFrameAt } from './frame/index.js';

export type { FrameConfig, FrameResult, FrameFormat } from './frame/index.js';

// =============================================================================
// Ken Burns Generator (image → moving clip)
// =============================================================================

export { kenBurns, buildKenBurnsFilter } from './ken-burns/index.js';

export type { KenBurnsConfig, KenBurnsResult, KenBurnsDirection } from './ken-burns/index.js';

// =============================================================================
// Slideshow Generator (images → video)
// =============================================================================

export { slideshow } from './slideshow/index.js';

export type { SlideshowConfig, SlideshowResult, Slide } from './slideshow/index.js';

// =============================================================================
// Color Generator (adjust knobs + LUT)
// =============================================================================

export { adjustColor, applyLut, buildColorAdjustFilter, buildLut3dFilter } from './color/index.js';

export type { ColorAdjustConfig, ColorLutConfig, ColorResult } from './color/index.js';

// =============================================================================
// Glow / Bloom Generator
// =============================================================================

export { glow, buildGlowFilter } from './glow/index.js';

export type { GlowConfig, GlowResult } from './glow/index.js';

// =============================================================================
// Parallax (2.5D) Generator
// =============================================================================

export { parallax3d, buildParallaxFilter } from './parallax/index.js';

export type { ParallaxConfig, ParallaxResult, ParallaxMode } from './parallax/index.js';

// =============================================================================
// Overlay Generator (atmosphere overlays: light leaks / particles / bokeh)
// =============================================================================

export { overlay, buildOverlayFilter } from './overlay/index.js';

export type { OverlayConfig, OverlayResult, OverlayBlend } from './overlay/index.js';

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
