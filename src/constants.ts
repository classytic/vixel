/**
 * Vixel Constants
 * ========================
 * Centralized configuration constants for the HLS processor.
 */

// =============================================================================
// Encoding Defaults
// =============================================================================

/** Default segment duration in seconds (HLS standard) */
export const DEFAULT_SEGMENT_DURATION = 4;

/** Default GOP size multiplier (2 seconds is industry standard) */
export const GOP_DURATION_SECONDS = 2;

/** Default FFmpeg preset for encoding speed/quality tradeoff */
export const DEFAULT_FFMPEG_PRESET = 'fast';

// =============================================================================
// Sprite Generation Defaults
// =============================================================================

/** Default interval between sprite thumbnails in seconds */
export const DEFAULT_SPRITE_INTERVAL = 10;

/** Default sprite thumbnail width in pixels */
export const DEFAULT_SPRITE_WIDTH = 160;

/** Default number of thumbnails per row in sprite sheet */
export const DEFAULT_SPRITE_COLUMNS = 5;

/** Sprite thumbnail aspect ratio (16:9) */
export const SPRITE_ASPECT_RATIO = 16 / 9;

/** JPEG quality for sprite thumbnails (1-31, lower is better) */
export const SPRITE_THUMBNAIL_QUALITY = 3;

/** JPEG quality for final sprite sheet (1-31, lower is better) */
export const SPRITE_SHEET_QUALITY = 2;

// =============================================================================
// Codec Copy Defaults
// =============================================================================

/** Default resolution tolerance in pixels for codec copy detection */
export const DEFAULT_RESOLUTION_TOLERANCE = 10;

/** Fallback bandwidth estimation (bits per second) based on resolution */
export const FALLBACK_BANDWIDTH_BY_RESOLUTION: Record<number, number> = {
  360: 800_000,   // 800 kbps
  480: 1_400_000, // 1.4 Mbps
  720: 2_800_000, // 2.8 Mbps
  1080: 5_000_000, // 5 Mbps
  1440: 8_000_000, // 8 Mbps
  2160: 16_000_000, // 16 Mbps (4K)
};

/** Default fallback bandwidth (bits per second) */
export const DEFAULT_FALLBACK_BANDWIDTH = 2_800_000; // 2.8 Mbps (720p)

// =============================================================================
// FFmpeg Process Management
// =============================================================================

/** Default FFmpeg process timeout in milliseconds (10 minutes) */
export const DEFAULT_FFMPEG_TIMEOUT = 10 * 60 * 1000;

/** Maximum FFmpeg stderr buffer size (for error reporting) */
export const MAX_STDERR_BUFFER = 500;

// =============================================================================
// Validation Limits
// =============================================================================

/** Minimum valid video height in pixels */
export const MIN_VIDEO_HEIGHT = 144;

/** Maximum valid video height in pixels (8K) */
export const MAX_VIDEO_HEIGHT = 4320;

/** Minimum valid bitrate in kbps */
export const MIN_BITRATE = 100;

/** Maximum valid bitrate in kbps (for sanity checking) */
export const MAX_BITRATE = 50_000;

/** Minimum segment duration in seconds */
export const MIN_SEGMENT_DURATION = 1;

/** Maximum segment duration in seconds */
export const MAX_SEGMENT_DURATION = 30;
