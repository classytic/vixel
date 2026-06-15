/**
 * Sprite Generator Constants
 * ===========================
 * Default values and configuration for sprite sheet generation.
 */

// Re-export from main constants for consistency
export {
  DEFAULT_SPRITE_INTERVAL,
  DEFAULT_SPRITE_WIDTH,
  DEFAULT_SPRITE_COLUMNS,
  SPRITE_ASPECT_RATIO,
  SPRITE_THUMBNAIL_QUALITY,
  SPRITE_SHEET_QUALITY,
} from '../../constants.js';

// =============================================================================
// Additional Sprite-Specific Constants
// =============================================================================

/** Default sprite sheet format */
export const DEFAULT_SPRITE_FORMAT = 'jpg' as const;

/** Maximum thumbnails per sprite sheet */
export const MAX_THUMBNAILS_PER_SHEET = 100;

/** Minimum interval between thumbnails in seconds */
export const MIN_SPRITE_INTERVAL = 1;

// =============================================================================
// FFmpeg Filter Templates
// =============================================================================

/**
 * Thumbnail extraction filter
 *
 * @param interval - Seconds between frames
 * @param width - Thumbnail width
 * @param height - Thumbnail height
 */
export const SPRITE_EXTRACT_FILTER = (
  interval: number,
  width: number,
  height: number
): string =>
  `fps=1/${interval},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

/**
 * Tile filter for combining thumbnails
 *
 * @param columns - Thumbnails per row
 * @param rows - Number of rows
 */
export const SPRITE_TILE_FILTER = (columns: number, rows: number): string =>
  `tile=${columns}x${rows}`;
