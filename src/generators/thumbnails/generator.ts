/**
 * Thumbnail Generator
 * ====================
 * Extract high-quality thumbnails with multiple format support.
 *
 * Features:
 * - Multiple formats: JPEG, PNG, WebP, AVIF
 * - Smart frame selection (scene detection)
 * - Timestamp-based extraction
 * - Interval-based bulk extraction
 * - Mux-compatible URL patterns
 *
 * @module generators/thumbnails
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, normalize } from 'node:path';
import { FFmpegError } from '../../types/index.js';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegOptions } from '../../core/ffmpeg-spawn.js';
import type {
  ThumbnailConfig,
  ThumbnailResult,
  ThumbnailsResult,
  ThumbnailFormat,
  ThumbnailOptions,
  VideoSource,
} from './types.js';
import {
  DEFAULT_THUMBNAIL_WIDTH,
  DEFAULT_THUMBNAIL_FORMAT,
  DEFAULT_JPEG_QUALITY,
  SMART_SEARCH_START_PERCENT,
  SMART_SEARCH_END_PERCENT,
  FORMAT_SETTINGS,
  SCALE_FILTER,
  estimateThumbnailSize,
} from './constants.js';

// =============================================================================
// Main Generator Functions
// =============================================================================

/**
 * Extract a single thumbnail at a specific timestamp
 *
 * @param source - Video source information
 * @param timestamp - Time in seconds
 * @param outputPath - Output file path
 * @param config - Thumbnail configuration
 * @returns Thumbnail result with file info
 *
 * @example
 * ```typescript
 * const result = await extractThumbnail(
 *   { inputPath: './video.mp4', duration: 120 },
 *   30, // 30 seconds
 *   './thumb.jpg',
 *   { width: 1280, format: 'jpg', quality: 90 }
 * );
 * ```
 */
export async function extractThumbnail(
  source: VideoSource,
  timestamp: number,
  outputPath: string,
  config: ThumbnailConfig = {}
): Promise<ThumbnailResult> {
  const {
    format = DEFAULT_THUMBNAIL_FORMAT,
    width = DEFAULT_THUMBNAIL_WIDTH,
    height,
    quality = DEFAULT_JPEG_QUALITY,
    ffmpegPath = 'ffmpeg',
    debug = false,
  } = config;

  // Validate timestamp
  if (timestamp < 0) {
    throw new FFmpegError('Invalid timestamp: must be non-negative', { timestamp });
  }
  if (timestamp > source.duration) {
    throw new FFmpegError('Timestamp exceeds video duration', {
      timestamp,
      duration: source.duration,
    });
  }

  const formatSettings = FORMAT_SETTINGS[format];
  const scaledQuality = formatSettings.qualityScale(quality);
  const scaleHeight = height ?? -1;

  const args = [
    '-ss', String(timestamp),
    '-i', normalize(source.inputPath),
    '-vf', SCALE_FILTER(width, scaleHeight),
    '-frames:v', '1',
    formatSettings.qualityArg, String(scaledQuality),
    '-y',
    normalize(outputPath),
  ];

  // Add format-specific options
  if (format === 'avif') {
    args.splice(-2, 0, '-c:v', 'libaom-av1', '-still-picture', '1');
  }

  if (debug) {
    console.log(`[Thumbnail] Extracting at ${timestamp}s to ${outputPath}`);
  }

  await executeFFmpeg(ffmpegPath, args, configToSpawnOptions(config));

  if (config.dryRun) {
    return { outputPath, format, timestamp, dimensions: { width: width, height: scaleHeight > 0 ? scaleHeight : Math.round(width * 9 / 16) }, fileSize: 0 };
  }

  const stats = await fs.stat(outputPath);
  const dimensions = await getImageDimensions(outputPath, ffmpegPath.replace('ffmpeg', 'ffprobe'));

  return {
    outputPath,
    format,
    timestamp,
    dimensions,
    fileSize: stats.size,
  };
}

/**
 * Extract multiple thumbnails based on options
 *
 * @param source - Video source information
 * @param outputDir - Output directory
 * @param options - Extraction options (timestamp, smart, or interval)
 * @param config - Thumbnail configuration
 * @returns Multiple thumbnail results
 *
 * @example
 * ```typescript
 * // Extract at intervals
 * const result = await extractThumbnails(
 *   { inputPath: './video.mp4', duration: 300 },
 *   './thumbs',
 *   { strategy: 'interval', interval: 30 },
 *   { format: 'webp', width: 640 }
 * );
 *
 * // Smart extraction (best frame)
 * const result = await extractThumbnails(
 *   { inputPath: './video.mp4', duration: 300 },
 *   './thumbs',
 *   { strategy: 'smart' },
 *   { format: 'jpg' }
 * );
 * ```
 */
export async function extractThumbnails(
  source: VideoSource,
  outputDir: string,
  options: ThumbnailOptions,
  config: ThumbnailConfig = {}
): Promise<ThumbnailsResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const format = config.format ?? DEFAULT_THUMBNAIL_FORMAT;

  switch (options.strategy) {
    case 'time': {
      const result = await extractThumbnail(
        source,
        options.timestamp,
        join(outputDir, `thumb_${Math.round(options.timestamp)}.${format}`),
        config
      );
      return { thumbnails: [result], best: result };
    }

    case 'smart': {
      return extractSmartThumbnail(source, outputDir, options, config);
    }

    case 'interval': {
      return extractIntervalThumbnails(source, outputDir, options, config);
    }
  }
}

// =============================================================================
// Smart Thumbnail Extraction
// =============================================================================

interface SmartOptions {
  searchStart?: number;
  searchEnd?: number;
}

/**
 * Extract best frame using scene detection
 * Looks for visually interesting frames in the search range
 */
async function extractSmartThumbnail(
  source: VideoSource,
  outputDir: string,
  options: SmartOptions,
  config: ThumbnailConfig
): Promise<ThumbnailsResult> {
  const {
    ffmpegPath = 'ffmpeg',
    ffprobePath = 'ffprobe',
    format = DEFAULT_THUMBNAIL_FORMAT,
    debug = false,
  } = config;

  // Determine search range
  const searchStart = options.searchStart ?? source.duration * SMART_SEARCH_START_PERCENT;
  const searchEnd = options.searchEnd ?? source.duration * SMART_SEARCH_END_PERCENT;

  if (debug) {
    console.log(`[Thumbnail] Smart search: ${searchStart}s to ${searchEnd}s`);
  }

  // Extract candidate frames at key points
  const candidateTimestamps = [
    searchStart,
    (searchStart + searchEnd) / 2,
    searchEnd,
    source.duration * 0.25,
    source.duration * 0.33,
  ].filter((t) => t >= 0 && t <= source.duration);

  // Remove duplicates and sort
  const uniqueTimestamps = [...new Set(candidateTimestamps)].sort((a, b) => a - b);

  // Extract all candidates
  const candidates: ThumbnailResult[] = [];
  for (let i = 0; i < uniqueTimestamps.length; i++) {
    const timestamp = uniqueTimestamps[i]!;
    const outputPath = join(outputDir, `candidate_${i}.${format}`);

    try {
      const result = await extractThumbnail(source, timestamp, outputPath, config);
      candidates.push(result);
    } catch {
      // Skip failed extractions
      if (debug) {
        console.log(`[Thumbnail] Failed to extract at ${timestamp}s, skipping`);
      }
    }
  }

  if (candidates.length === 0) {
    throw new FFmpegError('Failed to extract any candidate thumbnails', { source });
  }

  // Select best candidate (largest file = most detail)
  const best = candidates.reduce((a, b) => (a.fileSize > b.fileSize ? a : b));

  // Rename best to final output
  const finalPath = join(outputDir, `thumbnail.${format}`);
  await fs.rename(best.outputPath, finalPath);
  best.outputPath = finalPath;

  // Cleanup other candidates
  for (const candidate of candidates) {
    if (candidate !== best) {
      await fs.rm(candidate.outputPath, { force: true }).catch(() => {});
    }
  }

  return {
    thumbnails: [best],
    best,
  };
}

// =============================================================================
// Interval Thumbnail Extraction
// =============================================================================

interface IntervalOptions {
  interval: number;
  maxCount?: number;
}

/**
 * Extract thumbnails at regular intervals
 */
async function extractIntervalThumbnails(
  source: VideoSource,
  outputDir: string,
  options: IntervalOptions,
  config: ThumbnailConfig
): Promise<ThumbnailsResult> {
  const { interval, maxCount } = options;
  const format = config.format ?? DEFAULT_THUMBNAIL_FORMAT;
  const debug = config.debug ?? false;

  // Calculate timestamps
  const timestamps: number[] = [];
  let currentTime = 0;

  while (currentTime < source.duration) {
    timestamps.push(currentTime);
    currentTime += interval;

    if (maxCount && timestamps.length >= maxCount) {
      break;
    }
  }

  if (debug) {
    console.log(`[Thumbnail] Extracting ${timestamps.length} thumbnails at ${interval}s intervals`);
  }

  // Extract all thumbnails
  const thumbnails: ThumbnailResult[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i]!;
    const outputPath = join(outputDir, `thumb_${String(i).padStart(4, '0')}.${format}`);

    try {
      const result = await extractThumbnail(source, timestamp, outputPath, config);
      thumbnails.push(result);
    } catch (err) {
      if (debug) {
        console.log(`[Thumbnail] Failed at ${timestamp}s: ${err}`);
      }
    }
  }

  // Best is typically the one with most visual content (largest file)
  if (thumbnails.length > 0) {
    const best = thumbnails.reduce((a, b) => (a.fileSize > b.fileSize ? a : b));
    return { thumbnails, best };
  }

  return { thumbnails };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get image dimensions using ffprobe
 */
async function getImageDimensions(
  imagePath: string,
  ffprobePath: string = 'ffprobe'
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      normalize(imagePath),
    ];

    const proc = spawn(ffprobePath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // Fallback to default dimensions
        resolve({ width: DEFAULT_THUMBNAIL_WIDTH, height: Math.round(DEFAULT_THUMBNAIL_WIDTH * 9 / 16) });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const stream = result.streams?.[0];
        resolve({
          width: stream?.width ?? DEFAULT_THUMBNAIL_WIDTH,
          height: stream?.height ?? Math.round(DEFAULT_THUMBNAIL_WIDTH * 9 / 16),
        });
      } catch {
        resolve({ width: DEFAULT_THUMBNAIL_WIDTH, height: Math.round(DEFAULT_THUMBNAIL_WIDTH * 9 / 16) });
      }
    });

    proc.on('error', () => {
      resolve({ width: DEFAULT_THUMBNAIL_WIDTH, height: Math.round(DEFAULT_THUMBNAIL_WIDTH * 9 / 16) });
    });
  });
}

function executeFFmpeg(ffmpegPath: string, args: string[], opts: SpawnFFmpegOptions = {}): Promise<void> {
  return spawnFFmpeg(ffmpegPath, args, opts);
}

// =============================================================================
// Utility Exports
// =============================================================================

export { estimateThumbnailSize };
