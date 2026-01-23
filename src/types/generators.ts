/**
 * Generator Types
 * ================
 * Type definitions for all video processing generators.
 * Designed for tree-shaking and type inference.
 */

// =============================================================================
// Shared Base Types
// =============================================================================

/**
 * Base configuration shared by all generators
 */
export interface BaseGeneratorConfig {
  /** Path to ffmpeg binary */
  ffmpegPath?: string;
  /** Path to ffprobe binary */
  ffprobePath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Video source metadata for generators
 */
export interface VideoSource {
  /** Input video path */
  inputPath: string;
  /** Video duration in seconds */
  duration: number;
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Frame rate */
  fps?: number;
}

// =============================================================================
// GIF Generator Types
// =============================================================================

/**
 * GIF output format options
 */
export type GifOutputFormat = 'gif' | 'webp' | 'apng';

/**
 * GIF optimization strategy
 * - `quality`: Two-pass palette for best quality (slower)
 * - `speed`: Single-pass for faster processing
 * - `balanced`: Good quality with reasonable speed
 */
export type GifOptimizationStrategy = 'quality' | 'speed' | 'balanced';

/**
 * Time range for clip extraction
 */
export interface TimeRange {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}

/**
 * GIF generation configuration
 */
export interface GifConfig extends BaseGeneratorConfig {
  /** Output format */
  format?: GifOutputFormat;
  /** Output width in pixels (height auto-calculated) */
  width?: number;
  /** Frame rate for output (lower = smaller file) */
  fps?: number;
  /** Optimization strategy */
  optimization?: GifOptimizationStrategy;
  /** Maximum file size in bytes (will reduce quality to fit) */
  maxSize?: number;
  /** Enable looping */
  loop?: boolean;
  /** Number of loops (0 = infinite) */
  loopCount?: number;
}

/**
 * GIF generation result
 */
export interface GifResult {
  /** Output file path */
  outputPath: string;
  /** Output format used */
  format: GifOutputFormat;
  /** File size in bytes */
  fileSize: number;
  /** Dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Duration in seconds */
  duration: number;
  /** Frame count */
  frameCount: number;
  /** Whether two-pass optimization was used */
  optimized: boolean;
}

// =============================================================================
// Thumbnail Generator Types
// =============================================================================

/**
 * Thumbnail output format
 */
export type ThumbnailFormat = 'jpg' | 'png' | 'webp' | 'avif';

/**
 * Thumbnail extraction strategy
 * - `time`: Extract at specific timestamp
 * - `smart`: Auto-detect best frame (scene detection)
 * - `interval`: Extract multiple at intervals
 */
export type ThumbnailStrategy = 'time' | 'smart' | 'interval';

/**
 * Single thumbnail configuration
 */
export interface ThumbnailConfig extends BaseGeneratorConfig {
  /** Output format */
  format?: ThumbnailFormat;
  /** Output width (height auto-calculated) */
  width?: number;
  /** Output height (width auto-calculated if not set) */
  height?: number;
  /** JPEG/WebP quality (1-100) */
  quality?: number;
  /** Extraction strategy */
  strategy?: ThumbnailStrategy;
}

/**
 * Thumbnail at specific timestamp
 */
export interface TimestampThumbnail {
  strategy: 'time';
  /** Timestamp in seconds */
  timestamp: number;
}

/**
 * Smart thumbnail (best frame detection)
 */
export interface SmartThumbnail {
  strategy: 'smart';
  /** Search range start (default: 10% of duration) */
  searchStart?: number;
  /** Search range end (default: 50% of duration) */
  searchEnd?: number;
}

/**
 * Multiple thumbnails at intervals
 */
export interface IntervalThumbnails {
  strategy: 'interval';
  /** Interval in seconds */
  interval: number;
  /** Maximum thumbnails to generate */
  maxCount?: number;
}

/**
 * Thumbnail extraction options (discriminated union)
 */
export type ThumbnailOptions = TimestampThumbnail | SmartThumbnail | IntervalThumbnails;

/**
 * Single thumbnail result
 */
export interface ThumbnailResult {
  /** Output file path */
  outputPath: string;
  /** Format used */
  format: ThumbnailFormat;
  /** Timestamp extracted from */
  timestamp: number;
  /** Dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** File size in bytes */
  fileSize: number;
}

/**
 * Multiple thumbnails result
 */
export interface ThumbnailsResult {
  /** All generated thumbnails */
  thumbnails: ThumbnailResult[];
  /** Best thumbnail (for smart strategy) */
  best?: ThumbnailResult;
}

// =============================================================================
// Sprite Generator Types
// =============================================================================

/**
 * Sprite sheet configuration
 */
export interface SpriteConfig extends BaseGeneratorConfig {
  /** Interval between thumbnails in seconds */
  interval?: number;
  /** Thumbnail width in pixels */
  width?: number;
  /** Thumbnails per row */
  columns?: number;
  /** Output format for sprite sheet */
  format?: 'jpg' | 'png' | 'webp';
  /** JPEG/WebP quality (1-100) */
  quality?: number;
}

/**
 * Sprite generation result
 */
export interface SpriteResult {
  /** Sprite sheet image path */
  imagePath: string;
  /** WebVTT file path */
  vttPath: string;
  /** Number of thumbnails */
  thumbnailCount: number;
  /** Grid layout */
  grid: {
    columns: number;
    rows: number;
  };
  /** Sprite sheet dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Individual thumbnail dimensions */
  thumbnailSize: {
    width: number;
    height: number;
  };
}

// =============================================================================
// Chapter Generator Types
// =============================================================================

/**
 * Chapter marker
 */
export interface Chapter {
  /** Unique chapter ID */
  id: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds (optional, auto-calculated) */
  endTime?: number;
  /** Chapter title */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional thumbnail timestamp */
  thumbnailTime?: number;
}

/**
 * Chapter generation mode
 * - `manual`: Use provided chapters
 * - `auto`: Auto-generate at intervals
 * - `smart`: AI-powered from transcript/scenes
 */
export type ChapterMode = 'manual' | 'auto' | 'smart';

/**
 * Chapter configuration
 */
export interface ChapterConfig extends BaseGeneratorConfig {
  /** Generation mode */
  mode?: ChapterMode;
  /** Auto-chapter interval in seconds (for auto mode) */
  interval?: number;
  /** Manual chapters (for manual mode) */
  chapters?: Chapter[];
  /** Language code for WebVTT */
  language?: string;
}

/**
 * Scene detection result (for smart chapters)
 */
export interface DetectedScene {
  /** Timestamp in seconds */
  timestamp: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Auto-generated title */
  title?: string;
}

/**
 * Chapter generation result
 */
export interface ChapterResult {
  /** WebVTT file path */
  vttPath: string;
  /** JSON chapters file path (optional) */
  jsonPath?: string;
  /** Generated chapters */
  chapters: Chapter[];
  /** Total chapter count */
  chapterCount: number;
  /** Generation mode used */
  mode: ChapterMode;
}

// =============================================================================
// Type Inference Utilities
// =============================================================================

/**
 * Infer result type from generator config
 * @example
 * type R = InferGeneratorResult<GifConfig>; // GifResult
 */
export type InferGeneratorResult<T> =
  T extends GifConfig ? GifResult :
  T extends ThumbnailConfig ? ThumbnailResult :
  T extends SpriteConfig ? SpriteResult :
  T extends ChapterConfig ? ChapterResult :
  never;

/**
 * Extract generator type from options
 */
export type ExtractGeneratorType<T extends BaseGeneratorConfig> =
  T extends GifConfig ? 'gif' :
  T extends ThumbnailConfig ? 'thumbnail' :
  T extends SpriteConfig ? 'sprite' :
  T extends ChapterConfig ? 'chapter' :
  'unknown';

/**
 * Generator factory function signature
 */
export type GeneratorFn<TConfig extends BaseGeneratorConfig, TResult> = (
  source: VideoSource,
  outputDir: string,
  config?: TConfig
) => Promise<TResult>;

/**
 * Common generator result interface
 */
export interface GeneratorResult {
  /** Output file path */
  outputPath: string;
  /** File size in bytes */
  fileSize: number;
  /** Processing time in milliseconds */
  processingTime: number;
}

// =============================================================================
// Watermark Generator Types
// =============================================================================

/**
 * Watermark position presets
 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/**
 * Watermark type
 */
export type WatermarkType = 'image' | 'text';

/**
 * Image watermark configuration
 */
export interface ImageWatermarkConfig extends BaseGeneratorConfig {
  type: 'image';
  /** Path to watermark image */
  imagePath: string;
  /** Position preset */
  position?: WatermarkPosition;
  /** Scale relative to video (0-1, default 0.1 = 10% of video height) */
  scale?: number;
  /** Opacity (0-1, default 1.0) */
  opacity?: number;
  /** Margin from edge in pixels (default 10) */
  margin?: number;
}

/**
 * Text watermark configuration
 */
export interface TextWatermarkConfig extends BaseGeneratorConfig {
  type: 'text';
  /** Text to display */
  text: string;
  /** Position preset */
  position?: WatermarkPosition;
  /** Font size (auto-calculated if not provided) */
  fontSize?: number;
  /** Font color (default 'white') */
  fontColor?: string;
  /** Opacity (0-1, default 1.0) */
  opacity?: number;
  /** Margin from edge in pixels (default 10) */
  margin?: number;
}

/**
 * Watermark configuration (image or text)
 */
export type WatermarkConfig = ImageWatermarkConfig | TextWatermarkConfig;

/**
 * Watermark generation result
 */
export interface WatermarkResult {
  outputPath: string;
  watermarkType: WatermarkType;
  position: WatermarkPosition;
  fileSize: number;
  duration: number;
}

// =============================================================================
// Crop/Resize Generator Types
// =============================================================================

/**
 * Aspect ratio presets
 */
export type AspectRatioPreset =
  | 'reels'              // 9:16 (1080x1920)
  | 'youtube'            // 16:9 (1920x1080)
  | 'square'             // 1:1 (1080x1080)
  | 'custom';

/**
 * Crop/resize configuration
 */
export interface CropResizeConfig extends BaseGeneratorConfig {
  /** Preset aspect ratio */
  preset?: AspectRatioPreset;
  /** Custom width (if preset='custom') */
  width?: number;
  /** Custom height (if preset='custom') */
  height?: number;
  /** Output video codec (default: libx264) */
  videoCodec?: 'copy' | 'libx264' | 'libx265';
  /** CRF quality (default 23) */
  crf?: number;
}

/**
 * Crop/resize result
 */
export interface CropResizeResult {
  outputPath: string;
  originalDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  fileSize: number;
  duration: number;
}

// =============================================================================
// Compression Generator Types
// =============================================================================

/**
 * Video codec
 */
export type VideoCodec = 'libx264' | 'libx265';

/**
 * Hardware acceleration type
 */
export type HardwareAccel = 'none' | 'nvenc' | 'qsv' | 'videotoolbox' | 'vaapi';

/**
 * Encoding preset
 */
export type EncodingPreset = 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';

/**
 * Audio codec
 */
export type AudioCodec = 'aac' | 'copy';

/**
 * Compression configuration
 */
export interface CompressionConfig extends BaseGeneratorConfig {
  /** Video codec (default: libx264) */
  videoCodec?: VideoCodec;
  /** CRF quality 0-51, lower=better (default 23) */
  crf?: number;
  /** Encoding preset (default: medium) */
  preset?: EncodingPreset;
  /** Hardware acceleration (default: none) */
  hardwareAccel?: HardwareAccel;
  /** Audio codec (default: aac) */
  audioCodec?: AudioCodec;
  /** Audio bitrate (default: 128k) */
  audioBitrate?: string;
}

/**
 * Compression result
 */
export interface CompressionResult {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  savedBytes: number;
  videoCodec: string;
  audioCodec: string;
  duration: number;
}

// =============================================================================
// Trim/Clip Generator Types
// =============================================================================

/**
 * Trim/clip configuration
 */
export interface TrimConfig extends BaseGeneratorConfig {
  /** Start time in seconds */
  start: number;
  /** End time in seconds (optional, uses duration if not provided) */
  end?: number;
  /** Accurate trim (re-encode) or fast (copy) */
  accurate?: boolean;
  /** Video codec */
  videoCodec?: 'copy' | 'libx264' | 'libx265';
  /** CRF quality if re-encoding (default: 23) */
  crf?: number;
}

/**
 * Trim result
 */
export interface TrimResult extends GeneratorResult {
  /** Start time used */
  start: number;
  /** Duration of trimmed video */
  duration: number;
  /** Method used (fast or accurate) */
  method: 'fast' | 'accurate';
}

// =============================================================================
// Audio Generator Types
// =============================================================================

/**
 * Audio format
 */
export type AudioFormat = 'mp3' | 'aac' | 'wav' | 'opus' | 'flac';

/**
 * Audio extraction configuration
 */
export interface AudioExtractConfig extends BaseGeneratorConfig {
  /** Output format */
  format?: AudioFormat;
  /** Bitrate (e.g., '128k', '192k', '320k') */
  bitrate?: string;
}

/**
 * Volume adjustment configuration
 */
export interface VolumeConfig extends BaseGeneratorConfig {
  /** Volume multiplier (0.5 = 50%, 1.0 = 100%, 2.0 = 200%) */
  volume: number;
}

/**
 * Audio operation result
 */
export interface AudioResult extends GeneratorResult {
  /** Audio codec used */
  audioCodec?: string;
  /** Bitrate used */
  bitrate?: string;
}

// =============================================================================
// Concatenation Generator Types
// =============================================================================

/**
 * Concatenation method
 */
export type ConcatMethod = 'auto' | 'fast' | 'reencode';

/**
 * Concatenation configuration
 */
export interface ConcatConfig extends BaseGeneratorConfig {
  /** Method (auto detects, fast requires same codec/resolution, reencode normalizes) */
  method?: ConcatMethod;
  /** Target width for reencode method */
  targetWidth?: number;
  /** Target height for reencode method */
  targetHeight?: number;
  /** Video codec for reencode */
  videoCodec?: 'libx264' | 'libx265';
  /** CRF quality for reencode (default: 23) */
  crf?: number;
}

/**
 * Concatenation result
 */
export interface ConcatResult extends GeneratorResult {
  /** Number of files concatenated */
  fileCount: number;
  /** Method used (fast or reencode) */
  method: 'fast' | 'reencode';
  /** Total duration of concatenated video */
  totalDuration?: number;
}

// =============================================================================
// Speed Adjustment Generator Types
// =============================================================================

/**
 * Speed adjustment configuration
 */
export interface SpeedConfig extends BaseGeneratorConfig {
  /** Speed multiplier (0.5 = half speed, 2.0 = double speed) */
  speed: number;
  /** Maintain audio pitch (default: false) */
  maintainPitch?: boolean;
  /** Video codec */
  videoCodec?: 'libx264' | 'libx265';
  /** CRF quality (default: 23) */
  crf?: number;
}

/**
 * Speed adjustment result
 */
export interface SpeedResult extends GeneratorResult {
  /** Speed multiplier used */
  speed: number;
  /** Original duration in seconds */
  originalDuration?: number;
  /** New duration in seconds */
  newDuration?: number;
}

// =============================================================================
// Format Conversion Generator Types
// =============================================================================

/**
 * Video format
 */
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi';

/**
 * Format conversion configuration
 */
export interface ConvertConfig extends BaseGeneratorConfig {
  /** Target format */
  format: VideoFormat;
  /** Video codec (auto-selected if not provided) */
  videoCodec?: string;
  /** Audio codec (auto-selected if not provided) */
  audioCodec?: string;
  /** CRF quality (default: 23) */
  crf?: number;
  /** Encoding preset */
  preset?: EncodingPreset;
}

/**
 * Format conversion result
 */
export interface ConvertResult extends GeneratorResult {
  /** Format converted to */
  format: VideoFormat;
  /** Video codec used */
  videoCodec: string;
  /** Audio codec used */
  audioCodec: string;
}
