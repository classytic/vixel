/**
 * Crop/Resize Generator
 * Convert videos to different aspect ratios
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import type { VideoSource, CropResizeConfig, CropResizeResult } from './types.js';
import { ASPECT_RATIO_PRESETS, DEFAULT_CRF, buildCropScaleFilter } from './constants.js';
import { FFmpegError } from '../../types/index.js';

const execAsync = promisify(exec);

/**
 * Crop and/or resize video to target dimensions or aspect ratio
 *
 * @param source - Video source information
 * @param outputPath - Path where processed video will be saved
 * @param config - Crop/resize configuration
 * @returns Result with output dimensions and metadata
 *
 * @example
 * // Convert to Instagram Reels (9:16)
 * await cropResize(
 *   { inputPath: 'input.mp4', duration: 30, width: 1920, height: 1080 },
 *   'output.mp4',
 *   { preset: 'reels' }
 * );
 *
 * // Custom dimensions
 * await cropResize(
 *   { inputPath: 'input.mp4', duration: 30 },
 *   'output.mp4',
 *   { preset: 'custom', width: 1280, height: 720 }
 * );
 */
export async function cropResize(
  source: VideoSource,
  outputPath: string,
  config: CropResizeConfig = {}
): Promise<CropResizeResult> {
  const { inputPath, duration, width: sourceWidth, height: sourceHeight } = source;
  const ffmpegPath = config.ffmpegPath || 'ffmpeg';
  const ffprobePath = config.ffprobePath || 'ffprobe';

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

  // Probe source dimensions if not provided
  let actualSourceWidth = sourceWidth;
  let actualSourceHeight = sourceHeight;

  if (!actualSourceWidth || !actualSourceHeight) {
    const probeResult = await probeVideoDimensions(inputPath, ffprobePath);
    actualSourceWidth = probeResult.width;
    actualSourceHeight = probeResult.height;
  }

  // Determine target dimensions
  let targetWidth: number;
  let targetHeight: number;

  const preset = config.preset || 'youtube';

  if (preset !== 'custom') {
    const presetDims = ASPECT_RATIO_PRESETS[preset];
    if (!presetDims) {
      throw new FFmpegError(`Invalid preset: ${preset}`);
    }
    targetWidth = presetDims.width;
    targetHeight = presetDims.height;
  } else if (config.width && config.height) {
    targetWidth = config.width;
    targetHeight = config.height;
  } else {
    throw new FFmpegError('Custom preset requires width and height');
  }

  // Build filter
  const filter = buildCropScaleFilter(targetWidth, targetHeight);

  // Build FFmpeg args
  const args = [
    '-i', normalize(inputPath),
    '-vf', filter,
  ];

  // Video codec
  const videoCodec = config.videoCodec || 'libx264';
  if (videoCodec === 'copy') {
    args.push('-c:v', 'copy');
  } else {
    args.push('-c:v', videoCodec, '-crf', String(config.crf || DEFAULT_CRF), '-preset', 'medium');
  }

  // Audio codec (always copy)
  args.push('-c:a', 'copy');

  // Output
  args.push('-y', normalize(outputPath));

  await executeFFmpeg(ffmpegPath, args);

  // Get output file stats
  const stats = await fs.stat(outputPath);

  return {
    outputPath,
    originalDimensions: { width: actualSourceWidth, height: actualSourceHeight },
    outputDimensions: { width: targetWidth, height: targetHeight },
    fileSize: stats.size,
    duration,
  };
}

async function probeVideoDimensions(
  inputPath: string,
  ffprobePath: string
): Promise<{ width: number; height: number }> {
  const { stdout } = await execAsync(
    `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of json "${inputPath}"`
  );

  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];

  if (!stream || !stream.width || !stream.height) {
    throw new FFmpegError('Failed to probe video dimensions');
  }

  return { width: stream.width, height: stream.height };
}

function executeFFmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(ffmpegPath, args);
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new FFmpegError(`Crop/resize failed (exit ${code})`, stderr.slice(-500)));
      }
    });

    proc.on('error', (err) => {
      reject(new FFmpegError(`FFmpeg spawn error: ${err.message}`, err));
    });
  });
}
