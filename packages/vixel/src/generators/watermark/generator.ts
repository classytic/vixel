/**
 * Watermark Generator
 * Add image or text watermarks to videos
 */

import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type {
  VideoSource,
  WatermarkConfig,
  ImageWatermarkConfig,
  TextWatermarkConfig,
  WatermarkResult,
} from './types.js';
import {
  DEFAULT_WATERMARK_SCALE,
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_TEXT_COLOR,
  buildImageOverlayFilter,
  buildTextOverlayFilter,
  calculateFontSize,
} from './constants.js';
import { FFmpegError } from '../../types/index.js';

/**
 * Add watermark to video (image or text overlay)
 *
 * @param source - Video source information
 * @param outputPath - Path where watermarked video will be saved
 * @param config - Watermark configuration (image or text)
 * @returns Result with output path and metadata
 *
 * @example
 * // Image watermark
 * await addWatermark(
 *   { inputPath: 'input.mp4', duration: 30 },
 *   'output.mp4',
 *   {
 *     type: 'image',
 *     imagePath: 'logo.png',
 *     position: 'bottom-right',
 *     scale: 0.15,
 *     opacity: 0.8
 *   }
 * );
 *
 * // Text watermark
 * await addWatermark(
 *   { inputPath: 'input.mp4', duration: 30 },
 *   'output.mp4',
 *   {
 *     type: 'text',
 *     text: 'Copyright 2026',
 *     position: 'bottom-right'
 *   }
 * );
 */
export async function addWatermark(
  source: VideoSource,
  outputPath: string,
  config: WatermarkConfig
): Promise<WatermarkResult> {
  const { inputPath, duration } = source;
  const ffmpegPath = config.ffmpegPath || 'ffmpeg';

  // Validate inputs
  if (!inputPath || !outputPath) {
    throw new FFmpegError('Input path and output path are required');
  }

  // Check input file exists
  try {
    await fs.access(inputPath);
  } catch {
    throw new FFmpegError(`Input file not found: ${inputPath}`);
  }

  // Dispatch to appropriate handler
  if (config.type === 'image') {
    return addImageWatermark(source, outputPath, config, ffmpegPath);
  } else {
    return addTextWatermark(source, outputPath, config, ffmpegPath);
  }
}

async function addImageWatermark(
  source: VideoSource,
  outputPath: string,
  config: ImageWatermarkConfig,
  ffmpegPath: string
): Promise<WatermarkResult> {
  const { inputPath, duration } = source;
  const {
    imagePath,
    position = 'bottom-right',
    scale = DEFAULT_WATERMARK_SCALE,
    opacity = DEFAULT_WATERMARK_OPACITY,
  } = config;

  // Validate watermark image exists
  try {
    await fs.access(imagePath);
  } catch {
    throw new FFmpegError(`Watermark image not found: ${imagePath}`);
  }

  // Build filter
  const filter = buildImageOverlayFilter(position, scale, opacity);

  // Build FFmpeg args
  const args = [
    '-i', normalize(inputPath),
    '-i', normalize(imagePath),
    '-filter_complex', filter,
    '-c:a', 'copy',  // Copy audio without re-encoding
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  // Get output file stats
  const fileSize = await outputSize(outputPath, config.dryRun);

  return {
    outputPath,
    watermarkType: 'image',
    position,
    fileSize,
    duration,
  };
}

async function addTextWatermark(
  source: VideoSource,
  outputPath: string,
  config: TextWatermarkConfig,
  ffmpegPath: string
): Promise<WatermarkResult> {
  const { inputPath, duration, height = 1080 } = source;
  const {
    text,
    position = 'bottom-right',
    fontSize = calculateFontSize(height),
    fontColor = DEFAULT_TEXT_COLOR,
    opacity = DEFAULT_WATERMARK_OPACITY,
  } = config;

  // Build filter
  const filter = buildTextOverlayFilter(text, position, fontSize, fontColor, opacity);

  // Build FFmpeg args
  const args = [
    '-i', normalize(inputPath),
    '-vf', filter,
    '-c:a', 'copy',  // Copy audio without re-encoding
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  // Get output file stats
  const fileSize = await outputSize(outputPath, config.dryRun);

  return {
    outputPath,
    watermarkType: 'text',
    position,
    fileSize,
    duration,
  };
}
