/**
 * Thumbnail Generator Module
 * ===========================
 * Extract high-quality thumbnails with multiple format support.
 *
 * @example
 * ```typescript
 * import {
 *   extractThumbnail,
 *   extractThumbnails,
 *   estimateThumbnailSize
 * } from '@classytic/hls-processor/generators/thumbnails';
 *
 * // Extract single thumbnail
 * const result = await extractThumbnail(
 *   { inputPath: './video.mp4', duration: 120 },
 *   30, // timestamp
 *   './thumb.jpg',
 *   { width: 1280, quality: 90 }
 * );
 *
 * // Smart thumbnail (best frame detection)
 * const results = await extractThumbnails(
 *   { inputPath: './video.mp4', duration: 120 },
 *   './thumbs',
 *   { strategy: 'smart' },
 *   { format: 'webp' }
 * );
 *
 * // Interval-based extraction
 * const results = await extractThumbnails(
 *   { inputPath: './video.mp4', duration: 120 },
 *   './thumbs',
 *   { strategy: 'interval', interval: 10 },
 *   { format: 'jpg' }
 * );
 * ```
 *
 * @module generators/thumbnails
 */

// Generator functions
export { extractThumbnail, extractThumbnails, estimateThumbnailSize } from './generator.js';

// Types
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
  VideoSource,
} from './types.js';

// Constants (for advanced users)
export {
  DEFAULT_THUMBNAIL_WIDTH,
  DEFAULT_THUMBNAIL_FORMAT,
  DEFAULT_JPEG_QUALITY,
  DEFAULT_WEBP_QUALITY,
  FORMAT_SETTINGS,
} from './constants.js';
