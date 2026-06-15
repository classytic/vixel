/**
 * Building Blocks Types
 * =====================
 * Low-level utilities for advanced FFmpeg operations
 */

import type { BaseGeneratorConfig, VideoSource } from './generators.js';

// =============================================================================
// FFmpeg Filter Types
// =============================================================================

/**
 * Progress information during FFmpeg processing
 */
export interface FFmpegProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Current timestamp being processed */
  currentTime: number;
  /** Total duration */
  duration: number;
  /** Current processing FPS */
  fps: number;
  /** Processing speed multiplier (1.0 = realtime) */
  speed: number;
  /** Current frame being processed */
  frame: number;
  /** Bitrate */
  bitrate: string;
}

/**
 * Input configuration for multi-input operations
 */
export interface FFmpegInput {
  /** Input file path */
  path: string;
  /** Input format (optional) */
  format?: string;
  /** Input options */
  options?: string[];
}

/**
 * Generic FFmpeg filter configuration
 */
export interface FFmpegFilterConfig extends BaseGeneratorConfig {
  /** Video filter string (e.g., 'scale=1920:1080,eq=contrast=1.2') */
  videoFilter?: string;

  /** Audio filter string (e.g., 'volume=2.0,highpass=200') */
  audioFilter?: string;

  /** Complex filter graph (for multiple inputs/outputs) */
  complexFilter?: string;

  /** Additional inputs for multi-input operations */
  inputs?: FFmpegInput[];

  /** Output stream mapping (e.g., ['0:v:0', '1:a:0']) */
  maps?: string[];

  /** Custom FFmpeg arguments (escape hatch) */
  customArgs?: string[];

  /** Global options (before inputs) */
  globalOptions?: string[];

  /** Video codec (default: libx264) */
  videoCodec?: string;

  /** Audio codec (default: aac) */
  audioCodec?: string;

  /** CRF quality (default: 23) */
  crf?: number;

  /** Encoding preset */
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';

  /** Progress callback */
  onProgress?: (progress: FFmpegProgress) => void;
}

/**
 * Result from FFmpeg filter operation
 */
export interface FFmpegFilterResult {
  /** Output file path */
  outputPath: string;
  /** Output file size in bytes */
  fileSize: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Video codec used */
  videoCodec?: string;
  /** Audio codec used */
  audioCodec?: string;
  /** FFmpeg command that was executed */
  command: string;
}

// =============================================================================
// GIF Optimization Types
// =============================================================================

/**
 * Platform-specific GIF size limits
 */
export type GifPlatform = 'twitter' | 'discord' | 'slack' | 'github' | 'tenor' | 'giphy' | 'custom';

/**
 * GIF size estimation parameters
 */
export interface GifSizeEstimate {
  /** Estimated file size in bytes */
  estimatedSize: number;
  /** Width used for estimation */
  width: number;
  /** FPS used for estimation */
  fps: number;
  /** Duration in seconds */
  duration: number;
  /** Number of frames */
  frameCount: number;
  /** Estimated size per frame */
  bytesPerFrame: number;
}

/**
 * Optimized GIF configuration
 */
export interface OptimizedGifConfig {
  /** Optimized width */
  width: number;
  /** Optimized FPS */
  fps: number;
  /** Estimated file size with optimizations */
  estimatedSize: number;
  /** Adjustments made */
  adjustments: {
    widthReduced?: boolean;
    fpsReduced?: boolean;
    qualityReduced?: boolean;
  };
  /** Original requested config */
  original: {
    width: number;
    fps: number;
  };
}

// =============================================================================
// Command Builder Types
// =============================================================================

/**
 * FFmpeg command configuration
 */
export interface FFmpegCommandConfig {
  /** Input files */
  inputs: Array<string | FFmpegInput>;
  /** Output file path */
  output: string;
  /** Filter complex string */
  filterComplex?: string;
  /** Video filters */
  videoFilters?: string[];
  /** Audio filters */
  audioFilters?: string[];
  /** Stream maps */
  maps?: string[];
  /** Video codec */
  videoCodec?: string;
  /** Audio codec */
  audioCodec?: string;
  /** Additional options */
  options?: Record<string, string | number | boolean>;
  /** Global options (before inputs) */
  globalOptions?: string[];
}

/**
 * Command validation result
 */
export interface CommandValidationResult {
  /** Whether command is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Validated command arguments */
  args?: string[];
}
