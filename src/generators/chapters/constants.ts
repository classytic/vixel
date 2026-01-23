/**
 * Chapter Generator Constants
 * ============================
 * Default values for chapter generation.
 */

// =============================================================================
// Default Values
// =============================================================================

/** Default chapter interval in seconds (5 minutes) */
export const DEFAULT_CHAPTER_INTERVAL = 300;

/** Default language for WebVTT */
export const DEFAULT_CHAPTER_LANGUAGE = 'en';

/** Default chapter mode */
export const DEFAULT_CHAPTER_MODE = 'auto' as const;

/** Minimum chapter duration in seconds */
export const MIN_CHAPTER_DURATION = 10;

/** Maximum chapters for auto-generation */
export const MAX_AUTO_CHAPTERS = 50;

// =============================================================================
// WebVTT Template
// =============================================================================

/**
 * WebVTT header template
 */
export const WEBVTT_HEADER = (language: string = DEFAULT_CHAPTER_LANGUAGE): string =>
  `WEBVTT\nKind: chapters\nLanguage: ${language}\n\n`;

/**
 * WebVTT cue template
 *
 * @param index - Cue number
 * @param startTime - Start time string (HH:MM:SS.mmm)
 * @param endTime - End time string (HH:MM:SS.mmm)
 * @param title - Chapter title
 */
export const WEBVTT_CUE = (
  index: number,
  startTime: string,
  endTime: string,
  title: string
): string => `${index}\n${startTime} --> ${endTime}\n${title}\n\n`;
