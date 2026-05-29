/**
 * Format Conversion Generator
 * ============================
 * Convert videos between different formats
 */

import { stat } from 'node:fs/promises';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import type { VideoSource } from '../../types/generators.js';
import type { ConvertConfig, ConvertResult } from './types.js';
import { DEFAULT_CONVERT_CONFIG, validateFormatConfig, getCodecsForFormat } from './constants.js';
import { FORMAT_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';

/**
 * Convert video to different format
 */
export async function convertFormat(
  source: VideoSource,
  outputPath: string,
  config: ConvertConfig
): Promise<ConvertResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONVERT_CONFIG, ...config };

  logger.info(`Converting to ${config.format.toUpperCase()}: ${source.inputPath}`);

  // Validate format
  validateFormatConfig(config.format);

  // Get default codecs for format
  const defaultCodecs = getCodecsForFormat(config.format);
  const videoCodec = mergedConfig.videoCodec || defaultCodecs.videoCodec;
  const audioCodec = mergedConfig.audioCodec || defaultCodecs.audioCodec;

  logger.info(`Using codecs: video=${videoCodec}, audio=${audioCodec}`);

  // Validation warnings
  const warnings: any[] = [];
  try {
    const stats = await stat(source.inputPath);
    warnings.push(...OperationValidator.validateFileSize(stats.size, 'format conversion'));
  } catch {}

  if (source.duration) {
    warnings.push(...OperationValidator.validateDuration(source.duration, 'format conversion'));
  }

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';

  // Build FFmpeg arguments based on format
  let args: string[];
  const crf = mergedConfig.crf;

  switch (config.format) {
    case 'webm':
      args = FORMAT_COMMANDS.toWebM(source.inputPath, outputPath, crf);
      break;
    case 'mp4':
      args = FORMAT_COMMANDS.toMP4(source.inputPath, outputPath, crf);
      break;
    case 'mov':
      args = FORMAT_COMMANDS.toMOV(source.inputPath, outputPath, crf);
      break;
    case 'avi':
      // AVI format (similar to MP4 but different container)
      args = [
        '-i', source.inputPath,
        '-c:v', videoCodec,
        '-crf', String(crf),
        '-preset', mergedConfig.preset,
        '-c:a', audioCodec,
        '-b:a', '192k',
        '-y', outputPath,
      ];
      break;
    default:
      throw new Error(`Unsupported format: ${config.format}`);
  }

  // Override codecs if custom ones provided
  if (config.videoCodec || config.audioCodec) {
    args = args.map((arg, i, arr) => {
      if (arg === '-c:v' && config.videoCodec) {
        arr[i + 1] = config.videoCodec;
      }
      if (arg === '-c:a' && config.audioCodec) {
        arr[i + 1] = config.audioCodec;
      }
      return arg;
    });
  }

  logFFmpegCommand(ffmpegPath, args, 'format conversion');
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(mergedConfig, source.duration));

  const fileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Format conversion completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize,
    processingTime,
    format: config.format,
    videoCodec,
    audioCodec,
  };
}
