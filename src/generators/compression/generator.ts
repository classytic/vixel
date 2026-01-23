/**
 * Compression Generator
 * Compress videos with quality control and hardware acceleration
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource, CompressionConfig, CompressionResult } from './types.js';
import {
  DEFAULT_VIDEO_CODEC,
  DEFAULT_CRF,
  DEFAULT_PRESET,
  DEFAULT_AUDIO_CODEC,
  DEFAULT_AUDIO_BITRATE,
  detectHardwareAccel,
  buildVideoEncoderArgs,
  buildAudioEncoderArgs,
} from './constants.js';
import { FFmpegError } from '../../types/index.js';

/**
 * Compress video with quality control and optional hardware acceleration
 *
 * @param source - Video source information
 * @param outputPath - Path where compressed video will be saved
 * @param config - Compression configuration
 * @returns Result with compression statistics
 *
 * @example
 * // Software compression (default)
 * await compressVideo(
 *   { inputPath: 'input.mp4', duration: 120 },
 *   'output.mp4',
 *   { crf: 23, preset: 'medium' }
 * );
 *
 * // Hardware-accelerated compression
 * await compressVideo(
 *   { inputPath: 'input.mp4', duration: 120 },
 *   'output.mp4',
 *   { hardwareAccel: 'nvenc', crf: 23 }
 * );
 */
export async function compressVideo(
  source: VideoSource,
  outputPath: string,
  config: CompressionConfig = {}
): Promise<CompressionResult> {
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

  // Get original file size
  const originalStats = await fs.stat(inputPath);
  const originalSize = originalStats.size;

  // Extract config with defaults
  let {
    videoCodec = DEFAULT_VIDEO_CODEC,
    crf = DEFAULT_CRF,
    preset = DEFAULT_PRESET,
    hardwareAccel = 'none',
    audioCodec = DEFAULT_AUDIO_CODEC,
    audioBitrate = DEFAULT_AUDIO_BITRATE,
  } = config;

  // Check if requested hardware acceleration is available
  if (hardwareAccel !== 'none') {
    const availableAccel = await detectHardwareAccel(ffmpegPath);
    if (!availableAccel.includes(hardwareAccel)) {
      console.warn(`[Compression] Hardware acceleration '${hardwareAccel}' not available, falling back to software encoding`);
      hardwareAccel = 'none';
    }
  }

  // Build encoder args
  const videoArgs = buildVideoEncoderArgs(videoCodec, hardwareAccel, crf, preset);
  const audioArgs = buildAudioEncoderArgs(audioCodec, audioBitrate);

  // Build FFmpeg command
  const args = [
    '-i', normalize(inputPath),
    ...videoArgs,
    ...audioArgs,
    '-y', normalize(outputPath),
  ];

  await executeFFmpeg(ffmpegPath, args);

  // Get compressed file size
  const compressedStats = await fs.stat(outputPath);
  const compressedSize = compressedStats.size;

  return {
    outputPath,
    originalSize,
    compressedSize,
    compressionRatio: compressedSize / originalSize,
    savedBytes: originalSize - compressedSize,
    videoCodec: hardwareAccel !== 'none' ? `${videoCodec} (${hardwareAccel})` : videoCodec,
    audioCodec,
    duration,
  };
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
        reject(new FFmpegError(`Compression failed (exit ${code})`, stderr.slice(-500)));
      }
    });

    proc.on('error', (err) => {
      reject(new FFmpegError(`FFmpeg spawn error: ${err.message}`, err));
    });
  });
}
