/**
 * Chapter Generator Module
 * =========================
 * WebVTT chapter markers for video navigation.
 *
 * @example
 * ```typescript
 * import { generateChapters, generateSmartChapters } from '@classytic/hls-processor';
 *
 * // Auto-generate chapters
 * const result = await generateChapters(
 *   { inputPath: './video.mp4', duration: 3600 },
 *   './chapters',
 *   { mode: 'auto', interval: 300 }
 * );
 *
 * // Manual chapters
 * const result = await generateChapters(
 *   { inputPath: './video.mp4', duration: 3600 },
 *   './chapters',
 *   {
 *     mode: 'manual',
 *     chapters: [
 *       { id: '1', startTime: 0, title: 'Introduction' },
 *       { id: '2', startTime: 300, title: 'Main Topic' },
 *     ],
 *   }
 * );
 * ```
 *
 * @module generators/chapters
 */

export {
  generateChapters,
  generateSmartChapters,
  generateChaptersFromTranscript,
} from './generator.js';

export type {
  ChapterConfig,
  ChapterResult,
  ChapterMode,
  Chapter,
  DetectedScene,
  VideoSource,
} from './types.js';

export {
  DEFAULT_CHAPTER_INTERVAL,
  DEFAULT_CHAPTER_LANGUAGE,
  DEFAULT_CHAPTER_MODE,
  MIN_CHAPTER_DURATION,
  MAX_AUTO_CHAPTERS,
} from './constants.js';
