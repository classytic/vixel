/**
 * Chapter Generator Types
 * ========================
 * Re-exports from central type definitions for easy imports.
 */

export type {
  ChapterConfig,
  ChapterResult,
  ChapterMode,
  Chapter,
  DetectedScene,
  VideoSource,
  BaseGeneratorConfig,
} from '../../types/generators.js';

// Legacy compatibility
export type { ChaptersInfo, Chapter as LegacyChapter } from '../../types/index.js';
