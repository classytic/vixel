/**
 * Speed Adjustment Generator
 * ===========================
 * Change video speed with audio synchronization
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { VideoSource } from '../../types/generators.js';
import type { SpeedConfig, SpeedResult } from './types.js';
import { DEFAULT_SPEED_CONFIG, validateSpeedConfig } from './constants.js';
import { SPEED_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';
import { probeVideo } from '../../core/probe.js';

/**
 * Change video playback speed
 */
export async function changeSpeed(
  source: VideoSource,
  outputPath: string,
  config: SpeedConfig
): Promise<SpeedResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_SPEED_CONFIG, ...config };

  logger.info(`Changing speed to ${config.speed}x for: ${source.inputPath}`);

  // Validate speed
  validateSpeedConfig(config.speed);

  if (config.speed < 0.5 || config.speed > 2.0) {
    logger.warn(`Extreme speed change (${config.speed}x) may result in quality loss`);
  }

  // Get duration
  const duration = source.duration || (await probeVideo(source.inputPath)).duration || 0;
  const newDuration = duration / config.speed;

  // Validation warnings
  const warnings: any[] = [];
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'speed adjustment'));
  } catch {}

  if (duration > 0) {
    warnings.push(...OperationValidator.validateDuration(duration, 'speed adjustment'));
  }

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';
  const args = SPEED_COMMANDS.changeSpeed(source.inputPath, outputPath, config.speed);

  logFFmpegCommand(ffmpegPath, args, 'speed adjustment');

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
        logger.error(`FFmpeg speed adjustment failed with code ${code}`);
        logger.debug(`FFmpeg stderr: ${stderr}`);
        reject(new Error(`FFmpeg speed adjustment failed with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error(`FFmpeg process error: ${err.message}`);
      reject(err);
    });
  });

  const outputStats = await stat(outputPath);
  const processingTime = Date.now() - startTime;

  logger.info(`Speed adjustment completed in ${(processingTime / 1000).toFixed(2)}s`);

  const result: SpeedResult = {
    outputPath,
    fileSize: outputStats.size,
    processingTime,
    speed: config.speed,
  };

  if (duration > 0) {
    result.originalDuration = duration;
    result.newDuration = newDuration;
  }

  return result;
}
