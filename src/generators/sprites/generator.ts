/**
 * Sprite Generator
 * =================
 * Generates thumbnail sprite sheets for video scrubbing (YouTube-style).
 *
 * Features:
 * - Extracts thumbnails at regular intervals
 * - Combines into sprite sheet (grid layout)
 * - Generates WebVTT file with thumbnail coordinates
 * - Optimized for fast seeking preview
 *
 * @module generators/sprites
 */

import { promises as fs } from 'node:fs';
import { join, normalize } from 'node:path';
import { FFmpegError } from '../../types/index.js';
import { spawnFFmpeg, type SpawnFFmpegOptions, type FFmpegCommand } from '../../core/ffmpeg-spawn.js';
import { formatWebVTTTime } from '../../utils/logger.js';
import type { SpriteConfig, SpriteResult, VideoSource } from './types.js';
import {
  DEFAULT_SPRITE_INTERVAL,
  DEFAULT_SPRITE_WIDTH,
  DEFAULT_SPRITE_COLUMNS,
  SPRITE_ASPECT_RATIO,
  SPRITE_THUMBNAIL_QUALITY,
  SPRITE_EXTRACT_FILTER,
  SPRITE_TILE_FILTER,
} from './constants.js';

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate thumbnail sprite sheet for video scrubbing
 *
 * @param source - Video source information
 * @param outputDir - Output directory for sprites
 * @param config - Sprite generation configuration
 * @returns Generation result with sprite information
 *
 * @example
 * ```typescript
 * const result = await generateSprites(
 *   { inputPath: './video.mp4', duration: 120 },
 *   './sprites',
 *   { interval: 10, width: 160, columns: 5 }
 * );
 * ```
 */
export async function generateSprites(
  source: VideoSource,
  outputDir: string,
  config: SpriteConfig = {}
): Promise<SpriteResult> {
  const {
    interval = DEFAULT_SPRITE_INTERVAL,
    width = DEFAULT_SPRITE_WIDTH,
    height: heightOverride,
    aspectRatio,
    columns = DEFAULT_SPRITE_COLUMNS,
    format = 'jpg',
    quality = 85,
    ffmpegPath = 'ffmpeg',
    debug = false,
    timeout,
    onProgress,
    signal,
    dryRun,
    onCommand,
  } = config;

  if (debug) {
    console.log('[Sprites] Generating thumbnail sprite sheet...');
    console.log(`[Sprites]   Interval: ${interval}s`);
    console.log(`[Sprites]   Size: ${width}px width`);
    console.log(`[Sprites]   Layout: ${columns} columns`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const thumbnailCount = Math.floor(source.duration / interval);
  const rows = Math.ceil(thumbnailCount / columns);
  // Cell height: explicit override → derived from aspectRatio → 16:9 default.
  // Lets callers match a vertical (9:16) source so frames fill the cell instead
  // of being letterboxed with black bars.
  const thumbnailHeight = heightOverride
    ? Math.round(heightOverride)
    : Math.round(width / (aspectRatio ?? SPRITE_ASPECT_RATIO));

  if (debug) {
    console.log(`[Sprites]   Total thumbnails: ${thumbnailCount} (${columns}x${rows} grid)`);
  }

  const thumbnailsDir = join(outputDir, 'temp-thumbnails');
  await fs.mkdir(thumbnailsDir, { recursive: true });

  try {
    // Step 1: Extract individual thumbnails
    await extractThumbnails({
      inputPath: source.inputPath,
      outputDir: thumbnailsDir,
      interval,
      width,
      height: thumbnailHeight,
      ffmpegPath,
      timeout,
      signal,
      dryRun,
      onCommand,
      onProgress: onProgress ? (p) => onProgress({ ...p, percentage: p.percentage * 0.8 }) : undefined,
      duration: source.duration,
    });

    // Dry-run: phase 2 reads phase-1 outputs which don't exist — return the plan.
    if (dryRun) {
      await fs.rm(thumbnailsDir, { recursive: true, force: true }).catch(() => {});
      return {
        imagePath: join(outputDir, `sprites.${format === 'png' ? 'png' : 'jpg'}`),
        vttPath: join(outputDir, 'sprites.vtt'),
        thumbnailCount,
        grid: { columns, rows },
        dimensions: { width: width * columns, height: thumbnailHeight * rows },
        thumbnailSize: { width, height: thumbnailHeight },
      };
    }

    // Step 2: Combine into sprite sheet
    const extension = format === 'png' ? 'png' : 'jpg';
    const spriteSheetPath = join(outputDir, `sprites.${extension}`);
    await createSpriteSheet({
      thumbnailsDir,
      outputPath: spriteSheetPath,
      columns,
      rows,
      thumbnailCount,
      ffmpegPath,
      quality,
      timeout,
      signal,
      onCommand,
    });

    // Step 3: Generate WebVTT file with coordinates
    const vttPath = join(outputDir, 'sprites.vtt');
    await generateWebVTT({
      outputPath: vttPath,
      spriteSheetPath: `sprites.${extension}`,
      interval,
      columns,
      width,
      height: thumbnailHeight,
      thumbnailCount,
    });

    // Step 4: Cleanup temp thumbnails
    await fs.rm(thumbnailsDir, { recursive: true, force: true });

    if (debug) {
      console.log('[Sprites] ✓ Sprite sheet generated');
      console.log(`[Sprites]   Sprite: ${spriteSheetPath}`);
      console.log(`[Sprites]   WebVTT: ${vttPath}`);
    }

    return {
      imagePath: spriteSheetPath,
      vttPath,
      thumbnailCount,
      grid: { columns, rows },
      dimensions: {
        width: width * columns,
        height: thumbnailHeight * rows,
      },
      thumbnailSize: {
        width,
        height: thumbnailHeight,
      },
    };
  } catch (error) {
    await fs.rm(thumbnailsDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

// =============================================================================
// Internal Helper Functions
// =============================================================================

interface ThumbnailExtractionOptions {
  inputPath: string;
  outputDir: string;
  interval: number;
  width: number;
  height: number;
  ffmpegPath: string;
  timeout?: number | undefined;
  signal?: AbortSignal | undefined;
  dryRun?: boolean | undefined;
  onCommand?: ((cmd: FFmpegCommand) => void) | undefined;
  onProgress?: ((p: { percentage: number; currentSec: number; totalSec: number }) => void) | undefined;
  duration?: number | undefined;
}

async function extractThumbnails(options: ThumbnailExtractionOptions): Promise<void> {
  const { inputPath, outputDir, interval, width, height, ffmpegPath, timeout, signal, dryRun, onCommand, onProgress, duration } = options;

  const args = [
    '-i', normalize(inputPath),
    '-vf', SPRITE_EXTRACT_FILTER(interval, width, height),
    '-q:v', String(SPRITE_THUMBNAIL_QUALITY),
    normalize(join(outputDir, 'thumb_%04d.jpg')),
  ];

  await executeFFmpeg(ffmpegPath, args, { timeout, signal, dryRun, onCommand, onProgress, duration });
}

interface SpriteSheetOptions {
  thumbnailsDir: string;
  outputPath: string;
  columns: number;
  rows: number;
  thumbnailCount: number;
  ffmpegPath: string;
  quality: number;
  timeout?: number | undefined;
  signal?: AbortSignal | undefined;
  onCommand?: ((cmd: FFmpegCommand) => void) | undefined;
}

async function createSpriteSheet(options: SpriteSheetOptions): Promise<void> {
  const { thumbnailsDir, outputPath, columns, rows, thumbnailCount, ffmpegPath, quality, timeout, signal, onCommand } = options;

  const files = await fs.readdir(thumbnailsDir);
  const thumbnailFiles = files
    .filter((f) => f.startsWith('thumb_') && f.endsWith('.jpg'))
    .sort()
    .slice(0, thumbnailCount);

  if (thumbnailFiles.length === 0) {
    throw new FFmpegError('No thumbnails found for sprite sheet creation', { thumbnailsDir });
  }

  const concatFile = join(thumbnailsDir, 'concat.txt');
  const concatContent = thumbnailFiles.map((f) => `file '${f}'`).join('\n');
  await fs.writeFile(concatFile, concatContent);

  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', normalize(concatFile),
    '-vf', SPRITE_TILE_FILTER(columns, rows),
    '-q:v', String(Math.round(31 - (quality / 100) * 29)),
    '-y',
    normalize(outputPath),
  ];

  await executeFFmpeg(ffmpegPath, args, { timeout, signal, onCommand });
}

interface WebVTTOptions {
  outputPath: string;
  spriteSheetPath: string;
  interval: number;
  columns: number;
  width: number;
  height: number;
  thumbnailCount: number;
}

async function generateWebVTT(options: WebVTTOptions): Promise<void> {
  const { outputPath, spriteSheetPath, interval, columns, width, height, thumbnailCount } = options;

  let vttContent = 'WEBVTT\n\n';

  for (let i = 0; i < thumbnailCount; i++) {
    const startTime = i * interval;
    const endTime = (i + 1) * interval;

    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = col * width;
    const y = row * height;

    const startTimeStr = formatWebVTTTime(startTime);
    const endTimeStr = formatWebVTTTime(endTime);

    vttContent += `${i + 1}\n`;
    vttContent += `${startTimeStr} --> ${endTimeStr}\n`;
    vttContent += `${spriteSheetPath}#xywh=${x},${y},${width},${height}\n\n`;
  }

  await fs.writeFile(outputPath, vttContent, 'utf8');
}

function executeFFmpeg(ffmpegPath: string, args: string[], opts: SpawnFFmpegOptions = {}): Promise<void> {
  return spawnFFmpeg(ffmpegPath, args, opts);
}
