/**
 * Vixel by Classytic (@classytic/vixel)
 * ======================================
 * A clean, composable FFmpeg primitive engine for AI/agentic video — typed,
 * dry-runnable, and tree-shakeable. Bring a `Source`, compose a video.
 *
 * Surfaces (import from the subpath you need — the package stays lean):
 *   - `@classytic/vixel`            Source, ingest, dimensions, errors, primitives
 *   - `@classytic/vixel/profiles`   editorProxy · editorPackage · hlsLadder
 *   - `@classytic/vixel/captions`   BYO-styled animated captions (CapCut modes)
 *   - `@classytic/vixel/compose`    declarative multi-track renderer (the MCP surface)
 *   - `@classytic/vixel/generators` 24 single-op transforms (trim, kenBurns, …)
 *
 * @example A whole video from one declarative spec
 * ```typescript
 * import { compose } from '@classytic/vixel/compose';
 * await compose({
 *   version: 1,
 *   output: { width: 1080, height: 1920, fps: 30 },
 *   tracks: [
 *     { type: 'video', clips: [
 *       { source: 'a.mp4', duration: 3, transition: { type: 'dissolve', duration: 0.5 },
 *         animation: { preset: 'kenBurns', direction: 'in' } },
 *       { source: 'b.mp4', duration: 3 },
 *     ]},
 *     { type: 'audio',   items: [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }] },
 *     { type: 'overlay', items: [{ kind: 'text', at: 0, duration: 3, text: 'hi there',
 *         style: { animation: 'highlight', highlightColor: '#39FF14' } }] },
 *   ],
 * }, 'out.mp4');
 * ```
 */

// =============================================================================
// Core Exports
// =============================================================================

// HLSProcessor is one primitive among many — a NAMED export, not the package
// default. Vixel is a primitive engine, not "an HLS processor". Use named
// imports / subpaths (`@classytic/vixel/profiles`, `/captions`, `/compose`).
export { HLSProcessor } from './processor.js';

// Primitives — the orthogonal nouns the engine composes (Source, …).
export { Source, type SourceKind, type SourceInit, type SourceJSON } from './primitives/index.js';

// Remote ingest — SSRF-guarded, byte-capped fetch to a local temp file.
export {
  fetchToFile,
  assertSafeUrl,
  isPrivateOrReservedIp,
  type FetchToFileOptions,
  type FetchResult,
} from './ingest/index.js';

// Profiles — named encode recipes (editor proxy, editor package, …).
export {
  editorProxy,
  buildEditorProxyArgs,
  editorPackage,
  defaultPosterSec,
  defaultSpriteIntervalSec,
  hlsLadder,
  ladderFor,
  type EditorProxyConfig,
  type EditorProxyResult,
  type EditorPackageConfig,
  type EditorPackageResult,
  type HlsLadderConfig,
  type HlsLadderResult,
} from './profiles/index.js';

// Dimension helpers (4K-cap downscale filter + math).
export {
  downscaleFilter,
  fitWithin,
  toEven,
  MAX_PROXY_WIDTH,
  MAX_PROXY_HEIGHT,
  type Dimensions,
} from './core/dimensions.js';

// Errors, codes, guards, tryCatch
export {
  ErrorCode,
  VixelError,
  FFmpegError,
  ProbeError,
  ConfigError,
  AbortError,
  HLSProcessorError,
  isVixelError,
  isFFmpegError,
  isProbeError,
  isConfigError,
  isAbortError,
  isHLSProcessorError,
  toVixelError,
  tryCatch,
  tryCatchSync,
  type VixelResult,
  type VixelErrorOptions,
  type ErrorContext,
  type SerializedVixelError,
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
  // Generator Source (synthetic source-arity primitive)
  generateSource,
  sourceDescriptor,
  // Speed Ramp Generator (variable speed + optical-flow slow-mo)
  speedRamp,
  buildSpeedRampFilter,
  validateSpeedRamp,
  // Motion Effects Generator (glitch / shake / rgb-split / zoom-punch)
  motionEffect,
  buildMotionEffectFilter,
  buildGlitchFilter,
  buildShakeFilter,
  buildRgbSplitFilter,
  buildZoomPunchFilter,
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
  // Generator Source types
  GenerateSourceConfig,
  GenerateSourceResult,
  // Speed Ramp types
  SpeedRampConfig,
  SpeedRampResult,
  SpeedRampSegment,
  SpeedRampPlanSegment,
  // Motion Effects types
  MotionEffect,
  MotionEffectConfig,
  MotionEffectResult,
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
// Frame-exact time (seconds at the edge, frames inside — see DESIGN.md)
// =============================================================================

export { toFrames, toSeconds, snapToFrame, formatTimecode, parseTimecode } from './core/time.js';
export { compileScalarKeyframes } from './core/keyframe.js';
export type { Keyframe, KeyframeEasing } from './core/keyframe.js';

// =============================================================================
// Schema durability — versioning + media references (see DESIGN.md)
// =============================================================================

export { CURRENT_SPEC_VERSION, migrateSpec, SPEC_UPGRADES } from './core/schema-version.js';
export type { SpecUpgrade } from './core/schema-version.js';
export {
  isMediaReference,
  resolveToPath,
  lavfiDescriptor,
  mediaInputArgs,
} from './core/media-reference.js';
export type {
  MediaReference,
  SourceRef,
  GeneratorKind,
  ExternalReference,
  GeneratorReference,
  MissingReference,
} from './core/media-reference.js';

// =============================================================================
// Primitive descriptor contract (machine-readable — see DESIGN.md)
// =============================================================================

export { clampParam } from './core/descriptor.js';
export type {
  ParamType,
  VixelParam,
  PrimitiveArity,
  PrimitiveInput,
  VixelPrimitiveDescriptor,
} from './core/descriptor.js';

// =============================================================================
// Compositing primitives (the mixer2 family — also at @classytic/vixel/compositing)
// =============================================================================

export {
  blend,
  buildBlendFilter,
  blendDescriptor,
  BLEND_MODES,
  chromaKey,
  buildChromaKeyGraph,
  chromaKeyDescriptor,
  mask,
  buildMaskFilter,
  maskDescriptor,
  COMPOSITING_DESCRIPTORS,
} from './compositing/index.js';
export type {
  BlendMode,
  BlendConfig,
  BlendResult,
  ChromaKeyConfig,
  ChromaKeyResult,
  MaskShape,
  MaskConfig,
  MaskResult,
} from './compositing/index.js';

// =============================================================================
// Utilities
// =============================================================================

export { formatWebVTTTime, Logger } from './utils/logger.js';
