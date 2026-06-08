/**
 * @classytic/vixel - Type Definitions
 * ===========================================
 * Modern TypeScript v5.7 types for HLS video processing
 */

// =============================================================================
// Core Configuration Types
// =============================================================================

/**
 * Encoding Strategy Mode
 *
 * @remarks
 * - `auto`: Automatically detect best mode based on source vs target resolution
 * - `reencode`: Always re-encode with specified quality settings (slower, controlled quality)
 * - `copy`: Use codec copy for fast segmentation without re-encoding (10-20x faster)
 *
 * @example
 * ```typescript
 * // Auto-detect (recommended)
 * { encodingMode: 'auto', height: 720, videoBitrate: 2800 }
 *
 * // Force re-encoding
 * { encodingMode: 'reencode', height: 720, videoBitrate: 2800 }
 *
 * // Force codec copy (only if resolution matches source)
 * { encodingMode: 'copy', height: 720, videoBitrate: 0 }
 * ```
 */
export type EncodingMode = 'auto' | 'reencode' | 'copy';

/**
 * HLS Quality Variant Configuration
 *
 * @remarks
 * Defines a single quality variant for adaptive bitrate streaming.
 *
 * **Codec Copy Mode:**
 * - Set `videoBitrate` and `audioBitrate` to 0 with `encodingMode: 'copy'`
 * - 10-20x faster than re-encoding
 * - Only works when source resolution matches target height
 * - Source codec must be HLS-compatible (H.264, HEVC)
 *
 * **Re-encoding Mode:**
 * - Specify positive bitrates for quality control
 * - Required when downscaling (e.g., 1080p → 720p)
 * - Allows precise quality/size optimization
 */
export interface QualityVariant {
  /** Variant name (e.g., "720p", "480p", "source") */
  name: string;

  /** Video height in pixels */
  height: number;

  /**
   * Video bitrate in kbps
   *
   * @remarks
   * - Positive value: Re-encode with specified bitrate
   * - Zero (0): Use codec copy mode (requires encodingMode: 'copy')
   *
   * @example
   * ```typescript
   * videoBitrate: 2800  // Re-encode at 2800 kbps
   * videoBitrate: 0     // Codec copy (with encodingMode: 'copy')
   * ```
   */
  videoBitrate: number;

  /**
   * Audio bitrate in kbps
   *
   * @remarks
   * - Positive value: Re-encode audio
   * - Zero (0): Copy audio codec (with encodingMode: 'copy')
   */
  audioBitrate: number;

  /** Target segment duration in seconds (default: 4) */
  segmentDuration?: number;

  /**
   * Encoding mode override
   *
   * @remarks
   * - `auto` (default): Auto-detect based on resolution match
   * - `reencode`: Force re-encoding even if resolution matches
   * - `copy`: Force codec copy (fails if resolution doesn't match)
   *
   * @since 1.1.0
   */
  encodingMode?: EncodingMode;
}

/**
 * HLS Processor Configuration
 */
export interface HLSProcessorConfig {
  /** Quality variants to generate */
  variants: QualityVariant[];
  /** Feature flags */
  features?: FeatureFlags;
  /** FFmpeg configuration */
  ffmpeg?: FFmpegConfig;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Feature Flags for Optional Features
 */
export interface FeatureFlags {
  /** Generate thumbnail sprites */
  sprites?: boolean;
  /** Generate WebVTT chapters */
  chapters?: boolean;
  /** Generate text tracks/subtitles */
  textTracks?: boolean;
}

/**
 * Codec Copy Optimization Options
 *
 * @remarks
 * Enables fast HLS segmentation without re-encoding when source
 * resolution matches target variant resolution.
 *
 * **Performance Impact:**
 * - Codec copy: ~5-10 seconds for 5-minute video
 * - Re-encoding: ~60-120 seconds for 5-minute video
 * - **10-20x speed improvement**
 *
 * **When to Use:**
 * - Source codec is HLS-compatible (H.264, HEVC, AAC)
 * - Source resolution matches target (e.g., 720p → 720p)
 * - No quality optimization needed
 *
 * @example
 * ```typescript
 * // Enable with auto-detection (recommended)
 * codecCopy: {
 *   enabled: true,
 *   autoDetect: true,
 *   resolutionTolerance: 10,
 * }
 *
 * // Disable (always re-encode)
 * codecCopy: {
 *   enabled: false,
 * }
 * ```
 *
 * @since 1.1.0
 */
export interface CodecCopyOptions {
  /**
   * Enable codec copy feature
   *
   * @default false
   */
  enabled?: boolean;

  /**
   * Auto-detect when to use codec copy based on resolution match
   *
   * @remarks
   * When true, automatically uses codec copy if source resolution
   * matches target variant within tolerance. Falls back to re-encoding
   * if resolutions don't match.
   *
   * @default true (when enabled is true)
   */
  autoDetect?: boolean;

  /**
   * Maximum resolution difference in pixels for auto-detection
   *
   * @remarks
   * If absolute height difference <= tolerance, codec copy is used.
   * Example: tolerance=10 means 720p source matches 710-730p target.
   *
   * @default 10
   */
  resolutionTolerance?: number;

  /**
   * Force codec copy even if conditions aren't ideal
   *
   * @remarks
   * **⚠️ USE WITH CAUTION**
   * - May cause quality issues if resolution doesn't match
   * - May fail if source codec is incompatible
   * - Only use for testing/debugging
   *
   * @default false
   */
  force?: boolean;

  /**
   * Fallback to re-encoding on codec copy failure
   *
   * @remarks
   * When true, automatically falls back to re-encoding if codec copy
   * fails (e.g., due to incompatible codec). Provides robustness.
   *
   * @default true
   */
  fallbackToReencode?: boolean;
}

/**
 * FFmpeg Configuration
 *
 * @remarks
 * Configuration for FFmpeg binary paths and codec copy optimization.
 */
export interface FFmpegConfig {
  /** FFmpeg binary path (default: 'ffmpeg') */
  ffmpegPath?: string;

  /** FFprobe binary path (default: 'ffprobe') */
  ffprobePath?: string;

  /** Custom FFmpeg options (advanced users only) */
  customOptions?: string[];

  /** FFmpeg process timeout in milliseconds (default: 10 minutes) */
  timeout?: number;

  /**
   * Codec copy optimization settings
   *
   * @remarks
   * Enable fast HLS segmentation without re-encoding.
   * See {@link CodecCopyOptions} for details.
   *
   * @since 1.1.0
   */
  codecCopy?: CodecCopyOptions;
}

// =============================================================================
// Processing Result Types
// =============================================================================

/**
 * HLS Processing Result
 */
export interface HLSProcessingResult {
  /** Success status */
  success: boolean;
  /** HLS output directory (local) */
  outputDir?: string;
  /** Generated variants */
  variants: VariantInfo[];
  /** Sprite information */
  sprites?: SpriteInfo;
  /** Chapters information */
  chapters?: ChaptersInfo;
  /** Processing metadata */
  metadata: ProcessingMetadata;
  /** Error if failed */
  error?: string;
}

/**
 * Variant Processing Information
 */
export interface VariantInfo {
  /** Variant name */
  name: string;
  /** Quality height */
  height: number;
  /** Playlist path/key */
  playlistPath: string;
  /** Number of segments */
  segmentCount: number;
  /** Total size in bytes */
  totalSize: number;
}

/**
 * Sprite Generation Information
 */
export interface SpriteInfo {
  /** Sprite sheet image path/key */
  imagePath: string;
  /** WebVTT file path/key */
  vttPath: string;
  /** Number of thumbnails generated */
  thumbnailCount: number;
  /** Sprite sheet dimensions */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Chapters Information
 */
export interface ChaptersInfo {
  /** WebVTT chapters file path/key */
  vttPath: string;
  /** Number of chapters */
  chapterCount: number;
  /** Chapters data */
  chapters: Chapter[];
}

/**
 * Video Chapter
 */
export interface Chapter {
  /** Chapter ID */
  id: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Chapter title */
  title: string;
}

/**
 * Processing Metadata
 */
export interface ProcessingMetadata {
  /** Input video duration in seconds */
  duration: number;
  /** Input video resolution */
  resolution: {
    width: number;
    height: number;
  };
  /** Processing start time */
  startedAt: Date;
  /** Processing end time */
  completedAt?: Date;
  /** Processing duration in ms */
  processingTime?: number;
}

// =============================================================================
// Generator-Specific Types
// =============================================================================
// Note: Generator-specific config types are defined in their respective modules
// and re-exported from types/generators.ts
// - GIF: generators/gif/
// - Thumbnails: generators/thumbnails/
// - Sprites: generators/sprites/
// - Chapters: generators/chapters/

// Re-export all generator types for convenient access
export * from './generators.js';

// =============================================================================
// Utility Types
// =============================================================================

/**
 * FFmpeg Progress Callback
 */
export type ProgressCallback = (progress: {
  percent: number;
  currentTime: number;
  targetDuration: number;
}) => void;

/**
 * Processing Status
 */
export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Features Configuration
 */
export interface FeaturesConfig {
  /** Custom chapters */
  chapters?: Chapter[];
}

/**
 * HLS Processor Options
 */
export interface ProcessorOptions {
  /** Input video path */
  inputPath: string;
  /** Output directory */
  outputDir: string;
  /** Configuration */
  config: HLSProcessorConfig;
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** Features configuration */
  featuresConfig?: FeaturesConfig;
}

// =============================================================================
// Error Types (canonical definitions live in src/errors.ts)
// =============================================================================

export {
  ErrorCode,
  VixelError,
  FFmpegError,
  HLSProcessorError,
  isVixelError,
  isFFmpegError,
  isHLSProcessorError,
  tryCatch,
  tryCatchSync,
  type ErrorCode as ErrorCodeType,
  type VixelResult,
} from '../errors.js';
