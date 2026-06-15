/**
 * Thumbnail Generator Constants
 * ==============================
 * Default values and FFmpeg command templates.
 */

// =============================================================================
// Default Values
// =============================================================================

/** Default thumbnail width in pixels */
export const DEFAULT_THUMBNAIL_WIDTH = 1280;

/** Default thumbnail format */
export const DEFAULT_THUMBNAIL_FORMAT = 'jpg' as const;

/** Default JPEG quality (1-100) */
export const DEFAULT_JPEG_QUALITY = 85;

/** Default WebP quality (1-100) */
export const DEFAULT_WEBP_QUALITY = 80;

/** Default PNG compression (0-9, higher = smaller) */
export const DEFAULT_PNG_COMPRESSION = 6;

/** Default search range for smart thumbnail (percentage of duration) */
export const SMART_SEARCH_START_PERCENT = 0.1;
export const SMART_SEARCH_END_PERCENT = 0.5;

/** Scene change detection threshold (0-1, lower = more sensitive) */
export const SCENE_CHANGE_THRESHOLD = 0.3;

// =============================================================================
// Format Quality Settings
// =============================================================================

/**
 * Quality settings per format
 */
export const FORMAT_SETTINGS = {
  jpg: {
    codec: 'mjpeg',
    qualityArg: '-q:v',
    /** JPEG quality scale (2-31, lower = better) */
    qualityScale: (q: number) => Math.round(31 - (q / 100) * 29),
  },
  png: {
    codec: 'png',
    qualityArg: '-compression_level',
    qualityScale: (q: number) => Math.round(9 - (q / 100) * 9),
  },
  webp: {
    codec: 'libwebp',
    qualityArg: '-q:v',
    qualityScale: (q: number) => q, // Direct 0-100 scale
  },
  avif: {
    codec: 'libaom-av1',
    qualityArg: '-crf',
    /** CRF scale (0-63, lower = better) */
    qualityScale: (q: number) => Math.round(63 - (q / 100) * 60),
  },
} as const;

// =============================================================================
// FFmpeg Filter Strings
// =============================================================================

/**
 * Scale filter maintaining aspect ratio
 *
 * @param width - Target width (-1 for auto)
 * @param height - Target height (-1 for auto)
 */
export const SCALE_FILTER = (width: number, height: number = -1): string =>
  `scale=${width}:${height}:force_original_aspect_ratio=decrease`;

/**
 * Scene change detection filter
 * Used for smart thumbnail selection
 *
 * @param threshold - Detection threshold (0-1)
 */
export const SCENE_DETECT_FILTER = (threshold: number = SCENE_CHANGE_THRESHOLD): string =>
  `select='gt(scene,${threshold})',showinfo`;

/**
 * Frame selection at specific timestamp
 *
 * @param timestamp - Time in seconds
 */
export const FRAME_SELECT_ARGS = (timestamp: number): string[] => [
  '-ss', String(timestamp),
  '-frames:v', '1',
];

// =============================================================================
// File Size Estimation
// =============================================================================

/**
 * Approximate bytes per megapixel by format
 */
export const BYTES_PER_MEGAPIXEL: Record<string, number> = {
  jpg: 150_000,  // ~150KB per megapixel
  png: 500_000,  // ~500KB per megapixel
  webp: 100_000, // ~100KB per megapixel
  avif: 80_000,  // ~80KB per megapixel
};

/**
 * Estimate thumbnail file size
 *
 * @param width - Image width
 * @param height - Image height
 * @param format - Output format
 * @returns Estimated size in bytes
 */
export function estimateThumbnailSize(
  width: number,
  height: number,
  format: keyof typeof BYTES_PER_MEGAPIXEL = 'jpg'
): number {
  const megapixels = (width * height) / 1_000_000;
  const bytesPerMp = BYTES_PER_MEGAPIXEL[format] ?? BYTES_PER_MEGAPIXEL['jpg']!;
  return Math.round(megapixels * bytesPerMp);
}
