/**
 * Audio Generator
 * ================
 * Extract, replace, adjust, and normalize audio
 */

import { stat } from 'node:fs/promises';
import { normalize } from 'node:path';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import type { VideoSource } from '../../types/generators.js';
import type { AudioExtractConfig, VolumeConfig, AudioResult, LoudnessConfig } from './types.js';
import {
  DEFAULT_AUDIO_CONFIG,
  validateAudioFormat,
  validateVolume,
  AUDIO_CODEC_MAP,
  LOUDNESS_PRESETS,
  buildLoudnormFilter,
  parseLoudnormJson,
  type LoudnormMeasurements,
} from './constants.js';
import { AUDIO_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';

async function executeFFmpeg(ffmpegPath: string, args: string[], operation: string, opts: SpawnFFmpegOptions = {}): Promise<void> {
  logFFmpegCommand(ffmpegPath, args, operation);
  await spawnFFmpeg(ffmpegPath, args, opts);
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

  await executeFFmpeg(ffmpegPath, args, 'audio extraction', configToSpawnOptions(mergedConfig));

  const outputFileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio extraction completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputFileSize,
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

  await executeFFmpeg(ffmpegPath, args, 'audio replacement', configToSpawnOptions(mergedConfig));

  const outputFileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio replacement completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputFileSize,
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

  await executeFFmpeg(ffmpegPath, args, 'volume adjustment', configToSpawnOptions(mergedConfig));

  const outputFileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Volume adjustment completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputFileSize,
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

  await executeFFmpeg(ffmpegPath, args, 'audio normalization', configToSpawnOptions(mergedConfig));

  const outputFileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Audio normalization completed in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize: outputFileSize,
    processingTime,
  };
}

/**
 * Normalize to a target integrated loudness (LUFS) using EBU R128 `loudnorm`.
 * Two-pass by default: pass 1 measures, pass 2 applies for an accurate, linear
 * result. Use a `preset` ('youtube' → -14 LUFS) or set `targetLufs` directly.
 *
 * @example
 * ```typescript
 * await normalizeLoudness(source, './out.mp4', { preset: 'youtube' }); // -14 LUFS
 * ```
 */
export async function normalizeLoudness(
  source: VideoSource,
  outputPath: string,
  config: LoudnessConfig = {},
): Promise<AudioResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const targetLufs = config.targetLufs ?? (config.preset ? LOUDNESS_PRESETS[config.preset] : -14);
  const truePeak = config.truePeak ?? -1;
  const lra = config.lra ?? 11;
  const twoPass = config.twoPass ?? true;
  const audioCodec = config.audioCodec ?? 'aac';

  let measured: LoudnormMeasurements | undefined;

  // Pass 1 — measure (skipped in dry-run; we still emit the pass-2 command).
  if (twoPass && !config.dryRun) {
    const measureFilter = buildLoudnormFilter({ targetLufs, truePeak, lra, printJson: true });
    let stderr = '';
    await spawnFFmpeg(
      ffmpegPath,
      ['-i', normalize(source.inputPath), '-af', measureFilter, '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
      { ...configToSpawnOptions(config, source.duration), onStderr: (c) => { stderr += c; } },
    );
    measured = parseLoudnormJson(stderr) ?? undefined;
  }

  const applyFilter = buildLoudnormFilter({ targetLufs, truePeak, lra, measured });
  const args = [
    '-i', normalize(source.inputPath),
    '-af', applyFilter,
    '-c:v', 'copy',
    '-c:a', audioCodec,
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const outputFileSize = await outputSize(outputPath, config.dryRun);
  return {
    outputPath,
    fileSize: outputFileSize,
    processingTime: Date.now() - startTime,
    audioCodec,
  };
}
