/**
 * Speed Adjustment Generator
 * ===========================
 * Change video speed with audio synchronization
 */

import { stat } from 'node:fs/promises';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import type { VideoSource } from '../../types/generators.js';
import type { SpeedConfig, SpeedResult } from './types.js';
import { DEFAULT_SPEED_CONFIG, validateSpeedConfig } from './constants.js';
import { SPEED_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';
import { probeVideo, type VideoMetadata } from '../../core/probe.js';

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

  const maintainPitch = mergedConfig.maintainPitch;

  // Probe when we need the duration and/or the audio sample rate (the
  // pitch-shift path needs the real rate). Skipped entirely in dry-run.
  let meta: VideoMetadata | undefined;
  if (!config.dryRun && (!source.duration || !maintainPitch)) {
    meta = await probeVideo(source.inputPath);
  }
  const duration = source.duration || meta?.duration || 0;
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
  const args = SPEED_COMMANDS.changeSpeed(source.inputPath, outputPath, config.speed, {
    videoCodec: mergedConfig.videoCodec,
    crf: mergedConfig.crf,
    maintainPitch,
    ...(meta?.audioSampleRate ? { sampleRate: meta.audioSampleRate } : {}),
  });

  logFFmpegCommand(ffmpegPath, args, 'speed adjustment');
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(mergedConfig, duration > 0 ? duration : undefined));

  const fileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Speed adjustment completed in ${(processingTime / 1000).toFixed(2)}s`);

  const result: SpeedResult = {
    outputPath,
    fileSize,
    processingTime,
    speed: config.speed,
  };

  if (duration > 0) {
    result.originalDuration = duration;
    result.newDuration = newDuration;
  }

  return result;
}
