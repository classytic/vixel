/**
 * Audio Generator
 * ================
 * Extract, replace, adjust, and normalize audio
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { VideoSource } from '../../types/generators.js';
import type { AudioExtractConfig, VolumeConfig, AudioResult } from './types.js';
import { DEFAULT_AUDIO_CONFIG, validateAudioFormat, validateVolume, AUDIO_CODEC_MAP } from './constants.js';
import { AUDIO_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';

/**
 * Execute FFmpeg command helper
 */
async function executeFFmpeg(ffmpegPath: string, args: string[], operation: string): Promise<void> {
  logFFmpegCommand(ffmpegPath, args, operation);

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args);

    let stderr = '';
    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        logger.error(`FFmpeg ${operation} failed with code ${code}`);
        logger.debug(`FFmpeg stderr: ${stderr}`);
        reject(new Error(`FFmpeg ${operation} failed with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error(`FFmpeg process error: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Extract audio from video
 */
export async function extractAudio(
  source: VideoSource,
  outputPath: string,
  config: AudioExtractConfig = {}
): Promise<AudioResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_AUDIO_CONFIG, ...config };

  logger.info(`Extracting audio from: ${source.inputPath}`);

  // Validate format
  validateAudioFormat(mergedConfig.format);

  // Validation warnings
  const warnings: any[] = [];
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'audio extraction'));
  } catch {}

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';
  const args = AUDIO_COMMANDS.extractAudio(
    source.inputPath,
    outputPath,
    mergedConfig.format,
    mergedConfig.bitrate
  );

  await executeFFmpeg(ffmpegPath, args, 'audio extraction');

  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio extraction completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
    audioCodec: AUDIO_CODEC_MAP[mergedConfig.format],
    bitrate: mergedConfig.bitrate,
  };
}

/**
 * Replace audio in video
 */
export async function replaceAudio(
  videoSource: VideoSource,
  audioPath: string,
  outputPath: string,
  config: AudioExtractConfig = {}
): Promise<AudioResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_AUDIO_CONFIG, ...config };

  logger.info(`Replacing audio in: ${videoSource.inputPath}`);

  // Validation warnings
  const warnings: any[] = [];
  try {
    const videoStats = await stat(videoSource.inputPath);
    warnings.push(...OperationValidator.validateFileSize(videoStats.size, 'audio replacement'));
  } catch {}

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';
  const args = AUDIO_COMMANDS.replaceAudio(videoSource.inputPath, audioPath, outputPath);

  await executeFFmpeg(ffmpegPath, args, 'audio replacement');

  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio replacement completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
  };
}

/**
 * Adjust video volume
 */
export async function adjustVolume(
  source: VideoSource,
  outputPath: string,
  config: VolumeConfig
): Promise<AudioResult> {
  const startTime = Date.now();
  const mergedConfig = { ...config };

  logger.info(`Adjusting volume to ${config.volume * 100}%`);

  // Validate volume
  validateVolume(config.volume);

  if (config.volume > 2) {
    logger.warn(`High volume level (${config.volume * 100}%) may cause audio distortion`);
  }

  // Validation warnings
  const warnings: any[] = [];
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'volume adjustment'));
  } catch {}

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';
  const args = AUDIO_COMMANDS.adjustVolume(source.inputPath, outputPath, config.volume);

  await executeFFmpeg(ffmpegPath, args, 'volume adjustment');

  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Volume adjustment completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
  };
}

/**
 * Normalize audio levels
 */
export async function normalizeAudio(
  source: VideoSource,
  outputPath: string,
  config: AudioExtractConfig = {}
): Promise<AudioResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_AUDIO_CONFIG, ...config };

  logger.info(`Normalizing audio: ${source.inputPath}`);

  // Validation warnings
  const warnings: any[] = [];
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'audio normalization'));
  } catch {}

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';
  const args = AUDIO_COMMANDS.normalizeAudio(source.inputPath, outputPath);

  await executeFFmpeg(ffmpegPath, args, 'audio normalization');

  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio normalization completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
  };
}
