/**
 * Chapter Generator
 * ==================
 * Generates WebVTT chapter markers for video navigation.
 *
 * Features:
 * - Manual chapters with custom markers
 * - Auto-generate chapters at regular intervals
 * - Smart chapters from transcript/scenes (AI-powered)
 * - WebVTT format compatible with all modern browsers
 *
 * @module generators/chapters
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { formatWebVTTTime } from '../../utils/logger.js';
import type { ChapterConfig, ChapterResult, Chapter, DetectedScene, VideoSource } from './types.js';
import {
  DEFAULT_CHAPTER_INTERVAL,
  DEFAULT_CHAPTER_LANGUAGE,
  DEFAULT_CHAPTER_MODE,
  MAX_AUTO_CHAPTERS,
  WEBVTT_HEADER,
  WEBVTT_CUE,
} from './constants.js';

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate WebVTT chapters file
 *
 * @param source - Video source information
 * @param outputDir - Output directory
 * @param config - Chapter generation configuration
 * @returns Generation result with chapter information
 *
 * @example
 * ```typescript
 * // Auto-generate chapters at 5-minute intervals
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
 */
export async function generateChapters(
  source: VideoSource,
  outputDir: string,
  config: ChapterConfig = {}
): Promise<ChapterResult> {
  const {
    mode = DEFAULT_CHAPTER_MODE,
    interval = DEFAULT_CHAPTER_INTERVAL,
    chapters: manualChapters,
    language = DEFAULT_CHAPTER_LANGUAGE,
    debug = false,
  } = config;

  await fs.mkdir(outputDir, { recursive: true });

  if (debug) {
    console.log(`[Chapters] Generating chapters (mode: ${mode})`);
  }

  let chapters: Chapter[];

  switch (mode) {
    case 'manual': {
      if (!manualChapters || manualChapters.length === 0) {
        throw new Error('Manual mode requires chapters array');
      }
      chapters = validateAndSortChapters(manualChapters, source.duration, debug);
      break;
    }

    case 'auto': {
      chapters = autoGenerateChapters(source.duration, interval);
      break;
    }

    case 'smart': {
      chapters = autoGenerateChapters(source.duration, interval);
      break;
    }
  }

  if (debug) {
    console.log(`[Chapters]   Total chapters: ${chapters.length}`);
  }

  const vttPath = join(outputDir, 'chapters.vtt');
  await writeChaptersVTT(vttPath, chapters, source.duration, language);

  const jsonPath = join(outputDir, 'chapters.json');
  await fs.writeFile(jsonPath, JSON.stringify(chapters, null, 2), 'utf8');

  if (debug) {
    console.log('[Chapters] ✓ Chapters file generated');
    console.log(`[Chapters]   VTT: ${vttPath}`);
    console.log(`[Chapters]   JSON: ${jsonPath}`);
  }

  return {
    vttPath,
    jsonPath,
    chapters,
    chapterCount: chapters.length,
    mode,
  };
}

// =============================================================================
// Smart Chapter Generation
// =============================================================================

/**
 * Generate chapters from detected scenes
 */
export async function generateSmartChapters(
  source: VideoSource,
  outputDir: string,
  scenes: DetectedScene[],
  config: ChapterConfig = {}
): Promise<ChapterResult> {
  const debug = config.debug ?? false;

  if (debug) {
    console.log(`[Chapters] Generating smart chapters from ${scenes.length} scenes`);
  }

  const chapters: Chapter[] = scenes
    .filter((scene) => scene.confidence > 0.5)
    .map((scene, index) => ({
      id: String(index + 1),
      startTime: scene.timestamp,
      title: scene.title ?? `Scene ${index + 1}`,
    }));

  return generateChapters(source, outputDir, {
    ...config,
    mode: 'manual',
    chapters,
  });
}

/**
 * Generate chapters from transcript with timestamps
 */
export async function generateChaptersFromTranscript(
  source: VideoSource,
  outputDir: string,
  transcript: Array<{ timestamp: number; text: string }>,
  config: ChapterConfig = {}
): Promise<ChapterResult> {
  const debug = config.debug ?? false;
  const interval = config.interval ?? DEFAULT_CHAPTER_INTERVAL;

  if (debug) {
    console.log(`[Chapters] Generating chapters from transcript (${transcript.length} entries)`);
  }

  const chapters: Chapter[] = [];
  let currentChapterStart = 0;
  let chapterIndex = 1;

  for (const entry of transcript) {
    if (entry.timestamp >= currentChapterStart + interval || chapters.length === 0) {
      const title = entry.text.substring(0, 50).trim() + (entry.text.length > 50 ? '...' : '');
      chapters.push({
        id: String(chapterIndex),
        startTime: entry.timestamp,
        title: title || `Chapter ${chapterIndex}`,
      });
      currentChapterStart = entry.timestamp;
      chapterIndex++;
    }
  }

  return generateChapters(source, outputDir, {
    ...config,
    mode: 'manual',
    chapters,
  });
}

// =============================================================================
// Internal Helper Functions
// =============================================================================

function validateAndSortChapters(
  chapters: Chapter[],
  duration: number,
  debug: boolean
): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime);

  for (const ch of sorted) {
    if (ch.startTime < 0) {
      throw new Error(`Invalid chapter timestamp: ${ch.title} has negative startTime (${ch.startTime})`);
    }
    if (ch.startTime > duration && debug) {
      console.warn(`[Chapters] Warning: Chapter "${ch.title}" starts after video ends (${ch.startTime}s > ${duration}s)`);
    }
  }

  return sorted;
}

function autoGenerateChapters(duration: number, interval: number): Chapter[] {
  const chapters: Chapter[] = [];
  let currentTime = 0;
  let chapterNumber = 1;

  while (currentTime < duration && chapters.length < MAX_AUTO_CHAPTERS) {
    chapters.push({
      id: String(chapterNumber),
      startTime: currentTime,
      title: `Chapter ${chapterNumber}`,
    });

    currentTime += interval;
    chapterNumber++;
  }

  return chapters;
}

async function writeChaptersVTT(
  outputPath: string,
  chapters: Chapter[],
  duration: number,
  language: string
): Promise<void> {
  let vttContent = WEBVTT_HEADER(language);

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const nextChapter = chapters[i + 1];

    const startTime = chapter.startTime;
    const endTime = nextChapter ? nextChapter.startTime : duration;

    const startTimeStr = formatWebVTTTime(startTime);
    const endTimeStr = formatWebVTTTime(endTime);

    vttContent += WEBVTT_CUE(i + 1, startTimeStr, endTimeStr, chapter.title);
  }

  await fs.writeFile(outputPath, vttContent, 'utf8');
}
