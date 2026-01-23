/**
 * Sprite Generator Module
 * ========================
 * YouTube-style thumbnail sprite sheets for video scrubbing.
 *
 * @example
 * ```typescript
 * import { generateSprites } from '@classytic/hls-processor';
 *
 * const result = await generateSprites(
 *   { inputPath: './video.mp4', duration: 120 },
 *   './sprites',
 *   { interval: 10, width: 160, columns: 5 }
 * );
 *
 * console.log(result.imagePath);  // './sprites/sprites.jpg'
 * console.log(result.vttPath);    // './sprites/sprites.vtt'
 * ```
 *
 * @module generators/sprites
 */

export { generateSprites } from './generator.js';

export type { SpriteConfig, SpriteResult, VideoSource } from './types.js';

export {
  DEFAULT_SPRITE_INTERVAL,
  DEFAULT_SPRITE_WIDTH,
  DEFAULT_SPRITE_COLUMNS,
  SPRITE_ASPECT_RATIO,
  MAX_THUMBNAILS_PER_SHEET,
  MIN_SPRITE_INTERVAL,
} from './constants.js';
