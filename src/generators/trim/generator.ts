/**
 * Trim/Clip Generator
 * ===================
 * Fast and accurate video trimming
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { VideoSource } from '../../types/generators.js';
import type { TrimConfig, TrimResult } from './types.js';
import { DEFAULT_TRIM_CONFIG, validateTrimConfig } from './constants.js';
import { TRIM_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';
import { probeVideo } from '../../core/probe.js';

/**
 * Trim video to specified time range
 */
export async function trimVideo(
  source: VideoSource,
  outputPath: string,
  config: TrimConfig
): Promise<TrimResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_TRIM_CONFIG, ...config };

  logger.info(`Starting trim operation: ${source.inputPath}`);

  // Probe video if duration not provided
  const duration = source.duration || (await probeVideo(source.inputPath)).duration || 0;

  // Validate configuration
  validateTrimConfig(config.start, config.end, duration);

  // Calculate trim duration
  const trimDuration = config.end ? config.end - config.start : duration - config.start;

  // Validation warnings
  const warnings: any[] = [];

  // File size warning
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'trim'));
  } catch {}

  // Duration warning
  warnings.push(...OperationValidator.validateDuration(duration, 'trim'));

  OperationValidator.logWarnings(warnings);

  // Determine method
  const method: 'fast' | 'accurate' = mergedConfig.accurate ? 'accurate' : 'fast';
  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';

  logger.info(`Trim method: ${method}, start: ${config.start}s, duration: ${trimDuration}s`);

  // Build FFmpeg arguments
  let args: string[];
  if (method === 'fast') {
    args = TRIM_COMMANDS.fastTrim(source.inputPath, outputPath, config.start, trimDuration);
  } else {
    const codec = mergedConfig.videoCodec === 'copy' ? 'libx264' : mergedConfig.videoCodec;
    args = TRIM_COMMANDS.accurateTrim(
      source.inputPath,
      outputPath,
      config.start,
      trimDuration,
      codec,
      mergedConfig.crf
    );
  }

  logFFmpegCommand(ffmpegPath, args, 'trim');

  // Execute FFmpeg
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
        logger.error(`FFmpeg trim failed with code ${code}`);
        logger.debug(`FFmpeg stderr: ${stderr}`);
        reject(new Error(`FFmpeg trim failed with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error(`FFmpeg process error: ${err.message}`);
      reject(err);
    });
  });

  // Get output file size
  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Trim completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
    start: config.start,
    duration: trimDuration,
    method,
  };
}
