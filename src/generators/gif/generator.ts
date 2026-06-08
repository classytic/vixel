/**
 * GIF Generator
 * ==============
 * High-quality GIF/WebP generation with two-pass palette optimization.
 *
 * Features:
 * - Two-pass palette generation for optimal colors (YouTube-quality)
 * - WebP output for 50-80% smaller files
 * - Configurable FPS and dimensions
 * - File size estimation and constraints
 *
 * @module generators/gif
 */

import { promises as fs } from 'node:fs';
import { join, normalize } from 'node:path';
import { FFmpegError } from '../../types/index.js';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import type {
  GifConfig,
  GifResult,
  GifOutputFormat,
  TimeRange,
  VideoSource,
} from './types.js';
import {
  DEFAULT_GIF_WIDTH,
  DEFAULT_GIF_FPS,
  DEFAULT_GIF_OPTIMIZATION,
  DEFAULT_WEBP_QUALITY,
  MAX_GIF_DURATION,
  PALETTE_FILTER,
  GIF_ENCODE_FILTER,
  GIF_FAST_FILTER,
  WEBP_FILTER,
  estimateGifSize,
} from './constants.js';

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate GIF or WebP from video clip
 *
 * @param source - Video source information
 * @param timeRange - Start and end timestamps
 * @param outputDir - Output directory
 * @param config - Generation configuration
 * @returns Generation result with file info
 *
 * @example
 * ```typescript
 * // Generate high-quality GIF
 * const result = await generateGif(
 *   { inputPath: './video.mp4', duration: 120 },
 *   { start: 10, end: 15 },
 *   './output',
 *   { format: 'gif', width: 480, optimization: 'quality' }
 * );
 *
 * // Generate WebP for smaller size
 * const result = await generateGif(
 *   { inputPath: './video.mp4', duration: 120 },
 *   { start: 10, end: 15 },
 *   './output',
 *   { format: 'webp', width: 320 }
 * );
 * ```
 */
export async function generateGif(
  source: VideoSource,
  timeRange: TimeRange,
  outputDir: string,
  config: GifConfig = {}
): Promise<GifResult> {
  const {
    format = 'gif',
    width = DEFAULT_GIF_WIDTH,
    fps = DEFAULT_GIF_FPS,
    optimization = DEFAULT_GIF_OPTIMIZATION,
    maxSize,
    loop = true,
    loopCount = 0,
    ffmpegPath = 'ffmpeg',
    debug = false,
  } = config;
  const clipDuration = timeRange.end - timeRange.start;

  // Validate time range
  const duration = timeRange.end - timeRange.start;
  if (duration <= 0) {
    throw new FFmpegError('Invalid time range: end must be greater than start', { context: { timeRange } });
  }
  if (duration > MAX_GIF_DURATION) {
    throw new FFmpegError(
      `GIF duration exceeds maximum (${MAX_GIF_DURATION}s). Consider using shorter clips.`,
      { context: { duration, max: MAX_GIF_DURATION } }
    );
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Determine output path
  const extension = format === 'apng' ? 'png' : format;
  const outputPath = join(outputDir, `clip_${Math.round(timeRange.start)}.${extension}`);

  if (debug) {
    console.log(`[GIF] Generating ${format.toUpperCase()} from ${timeRange.start}s to ${timeRange.end}s`);
    console.log(`[GIF]   Size: ${width}px @ ${fps}fps`);
    console.log(`[GIF]   Optimization: ${optimization}`);
  }

  let result: GifResult;

  const spawnOpts = configToSpawnOptions(config, clipDuration);

  if (format === 'webp') {
    result = await generateWebP(source, timeRange, outputPath, {
      width,
      fps,
      ffmpegPath,
      quality: DEFAULT_WEBP_QUALITY,
      spawnOpts,
    });
  } else if (optimization === 'quality') {
    result = await generateGifTwoPass(source, timeRange, outputPath, {
      width,
      fps,
      ffmpegPath,
      outputDir,
      spawnOpts,
    });
  } else {
    result = await generateGifSinglePass(source, timeRange, outputPath, {
      width,
      fps,
      ffmpegPath,
      loop,
      loopCount,
      spawnOpts,
    });
  }

  // Check file size constraint
  if (maxSize && result.fileSize > maxSize) {
    if (debug) {
      console.log(`[GIF] File size ${result.fileSize} exceeds max ${maxSize}, reducing quality...`);
    }
    // Retry with lower quality settings
    const reducedWidth = Math.round(width * 0.75);
    const reducedFps = Math.max(10, fps - 5);
    // Remove maxSize to prevent infinite recursion
    const { maxSize: _, ...configWithoutMaxSize } = config;
    return generateGif(source, timeRange, outputDir, {
      ...configWithoutMaxSize,
      width: reducedWidth,
      fps: reducedFps,
    });
  }

  if (debug) {
    console.log(`[GIF] ✓ Generated: ${outputPath} (${Math.round(result.fileSize / 1024)}KB)`);
  }

  return result;
}

// =============================================================================
// Two-Pass GIF Generation (High Quality)
// =============================================================================

type SpawnOpts = SpawnFFmpegOptions;

interface TwoPassOptions {
  width: number;
  fps: number;
  ffmpegPath: string;
  outputDir: string;
  spawnOpts: SpawnOpts | undefined;
}

/**
 * Generate GIF with two-pass palette optimization
 * Produces highest quality output with optimal color palette
 */
async function generateGifTwoPass(
  source: VideoSource,
  timeRange: TimeRange,
  outputPath: string,
  options: TwoPassOptions
): Promise<GifResult> {
  const { width, fps, ffmpegPath, outputDir, spawnOpts } = options;
  const palettePath = join(outputDir, 'palette.png');

  try {
    // Pass 1: Generate palette (no progress — very fast)
    await executePalettePass(source.inputPath, timeRange, palettePath, { width, fps, ffmpegPath, spawnOpts: { timeout: spawnOpts?.timeout, signal: spawnOpts?.signal, dryRun: spawnOpts?.dryRun, onCommand: spawnOpts?.onCommand } });

    // Pass 2: Encode GIF with palette
    await executeGifPass(source.inputPath, timeRange, outputPath, palettePath, { width, fps, ffmpegPath, spawnOpts });

    // Get file stats
    const fileSize = await outputSize(outputPath, spawnOpts?.dryRun);
    const frameCount = Math.ceil(fps * (timeRange.end - timeRange.start));

    return {
      outputPath,
      format: 'gif',
      fileSize,
      dimensions: { width, height: Math.round(width * 9 / 16) },
      duration: timeRange.end - timeRange.start,
      frameCount,
      optimized: true,
    };
  } finally {
    // Cleanup palette file
    await fs.rm(palettePath, { force: true }).catch(() => {});
  }
}

/**
 * Execute palette generation pass
 */
async function executePalettePass(
  inputPath: string,
  timeRange: TimeRange,
  palettePath: string,
  options: { width: number; fps: number; ffmpegPath: string; spawnOpts?: SpawnOpts | undefined }
): Promise<void> {
  const { width, fps, ffmpegPath, spawnOpts } = options;
  const args = [
    '-ss', String(timeRange.start),
    '-t', String(timeRange.end - timeRange.start),
    '-i', normalize(inputPath),
    '-vf', PALETTE_FILTER(width, fps),
    '-y',
    normalize(palettePath),
  ];
  await executeFFmpeg(ffmpegPath, args, spawnOpts);
}

/**
 * Execute GIF encoding pass with palette
 */
async function executeGifPass(
  inputPath: string,
  timeRange: TimeRange,
  outputPath: string,
  palettePath: string,
  options: { width: number; fps: number; ffmpegPath: string; spawnOpts?: SpawnOpts | undefined }
): Promise<void> {
  const { width, fps, ffmpegPath, spawnOpts } = options;
  const args = [
    '-ss', String(timeRange.start),
    '-t', String(timeRange.end - timeRange.start),
    '-i', normalize(inputPath),
    '-i', normalize(palettePath),
    '-lavfi', GIF_ENCODE_FILTER(width, fps),
    '-loop', '0',
    '-y',
    normalize(outputPath),
  ];
  await executeFFmpeg(ffmpegPath, args, spawnOpts);
}

// =============================================================================
// Single-Pass GIF Generation (Fast)
// =============================================================================

interface SinglePassOptions {
  width: number;
  fps: number;
  ffmpegPath: string;
  loop: boolean;
  loopCount: number;
  spawnOpts?: SpawnOpts | undefined;
}

/**
 * Generate GIF with single-pass filter (faster but lower quality)
 */
async function generateGifSinglePass(
  source: VideoSource,
  timeRange: TimeRange,
  outputPath: string,
  options: SinglePassOptions
): Promise<GifResult> {
  const { width, fps, ffmpegPath, loop, loopCount, spawnOpts } = options;

  const args = [
    '-ss', String(timeRange.start),
    '-t', String(timeRange.end - timeRange.start),
    '-i', normalize(source.inputPath),
    '-vf', GIF_FAST_FILTER(width, fps),
    '-loop', loop ? String(loopCount) : '-1',
    '-y',
    normalize(outputPath),
  ];

  await executeFFmpeg(ffmpegPath, args, spawnOpts);

  const fileSize = await outputSize(outputPath, spawnOpts?.dryRun);
  const frameCount = Math.ceil(fps * (timeRange.end - timeRange.start));

  return {
    outputPath,
    format: 'gif',
    fileSize,
    dimensions: { width, height: Math.round(width * 9 / 16) },
    duration: timeRange.end - timeRange.start,
    frameCount,
    optimized: false,
  };
}

// =============================================================================
// WebP Generation
// =============================================================================

interface WebPOptions {
  width: number;
  fps: number;
  ffmpegPath: string;
  quality: number;
  spawnOpts?: SpawnOpts | undefined;
}

/**
 * Generate animated WebP (50-80% smaller than GIF)
 */
async function generateWebP(
  source: VideoSource,
  timeRange: TimeRange,
  outputPath: string,
  options: WebPOptions
): Promise<GifResult> {
  const { width, fps, ffmpegPath, quality, spawnOpts } = options;

  const args = [
    '-ss', String(timeRange.start),
    '-t', String(timeRange.end - timeRange.start),
    '-i', normalize(source.inputPath),
    '-vf', WEBP_FILTER(width, fps),
    '-c:v', 'libwebp_anim',
    '-lossless', '0',
    '-q:v', String(quality),
    '-loop', '0',
    '-preset', 'drawing',
    '-an', // No audio
    '-y',
    normalize(outputPath),
  ];

  await executeFFmpeg(ffmpegPath, args, spawnOpts);

  const fileSize = await outputSize(outputPath, spawnOpts?.dryRun);
  const frameCount = Math.ceil(fps * (timeRange.end - timeRange.start));

  return {
    outputPath,
    format: 'webp',
    fileSize,
    dimensions: { width, height: Math.round(width * 9 / 16) },
    duration: timeRange.end - timeRange.start,
    frameCount,
    optimized: true,
  };
}

// =============================================================================
// FFmpeg Execution Helper
// =============================================================================

function executeFFmpeg(
  ffmpegPath: string,
  args: string[],
  options?: SpawnOpts,
): Promise<void> {
  return spawnFFmpeg(ffmpegPath, args, options ?? {});
}

// =============================================================================
// Utility Exports
// =============================================================================

export { estimateGifSize };
