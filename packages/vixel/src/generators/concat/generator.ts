/**
 * Concatenation Generator
 * =======================
 * Concatenate multiple videos with automatic method detection
 */

import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VideoSource } from '../../types/generators.js';
import type { ConcatConfig, ConcatResult } from './types.js';
import { DEFAULT_CONCAT_CONFIG, validateConcatConfig } from './constants.js';
import { CONCAT_COMMANDS, logFFmpegCommand } from '../../core/ffmpeg-commands.js';
import { logger, OperationValidator } from '../../core/logger.js';
import { probeVideo } from '../../core/probe.js';

async function executeFFmpeg(ffmpegPath: string, args: string[], operation: string, opts: SpawnFFmpegOptions = {}): Promise<void> {
  logFFmpegCommand(ffmpegPath, args, operation);
  await spawnFFmpeg(ffmpegPath, args, opts);
}

/**
 * Check if all videos have same codec and resolution (for fast concat)
 */
async function canUseFastConcat(sources: VideoSource[], ffmpegPath: string): Promise<boolean> {
  try {
    const probes = await Promise.all(
      sources.map((source) => probeVideo(source.inputPath, ffmpegPath))
    );

    const firstVideo = probes[0];
    if (!firstVideo) return false;

    const firstCodec = firstVideo.codec;
    const firstWidth = firstVideo.width;
    const firstHeight = firstVideo.height;

    for (let i = 1; i < probes.length; i++) {
      const video = probes[i];
      if (
        !video ||
        video.codec !== firstCodec ||
        video.width !== firstWidth ||
        video.height !== firstHeight
      ) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.warn('Failed to probe videos for fast concat detection, using reencode method');
    return false;
  }
}

/**
 * Concatenate multiple videos
 */
export async function concatenateVideos(
  sources: VideoSource[],
  outputPath: string,
  config: ConcatConfig = {}
): Promise<ConcatResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONCAT_CONFIG, ...config };

  logger.info(`Concatenating ${sources.length} videos`);

  // Validate
  validateConcatConfig(sources.length);

  // Validation warnings
  const warnings = OperationValidator.validateConcatenation(sources.length);

  // Calculate total duration
  let totalDuration = 0;
  for (const source of sources) {
    totalDuration += source.duration || 0;
  }

  if (totalDuration > 0) {
    warnings.push(...OperationValidator.validateDuration(totalDuration, 'concatenation'));
  }

  OperationValidator.logWarnings(warnings);

  const ffmpegPath = mergedConfig.ffmpegPath || 'ffmpeg';

  // Determine method
  let method: 'fast' | 'reencode';
  if (mergedConfig.method === 'auto') {
    const canFast = await canUseFastConcat(sources, ffmpegPath);
    method = canFast ? 'fast' : 'reencode';
    logger.info(`Auto-detected concat method: ${method}`);
  } else {
    method = mergedConfig.method === 'fast' ? 'fast' : 'reencode';
  }

  let args: string[];
  let concatFilePath: string | null = null;

  if (method === 'fast') {
    // Create concat file
    concatFilePath = join(tmpdir(), `concat-${Date.now()}.txt`);
    const concatContent = sources
      .map((source) => `file '${source.inputPath.replace(/'/g, "'\\''")}'`)
      .join('\n');

    await writeFile(concatFilePath, concatContent, 'utf-8');
    logger.debug(`Created concat file: ${concatFilePath}`);

    args = CONCAT_COMMANDS.simpleConcat(concatFilePath, outputPath);
  } else {
    // Reencode method
    const inputPaths = sources.map((s) => s.inputPath);
    args = CONCAT_COMMANDS.complexConcat(
      inputPaths,
      outputPath,
      mergedConfig.targetWidth,
      mergedConfig.targetHeight
    );
  }

  try {
    await executeFFmpeg(ffmpegPath, args, 'concatenation', configToSpawnOptions(mergedConfig, totalDuration > 0 ? totalDuration : undefined));
  } finally {
    // Cleanup concat file
    if (concatFilePath) {
      try {
        await unlink(concatFilePath);
        logger.debug(`Deleted concat file: ${concatFilePath}`);
      } catch {}
    }
  }

  const fileSize = await outputSize(outputPath, mergedConfig.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Concatenation completed in ${(processingTime / 1000).toFixed(2)}s`);

  const result: ConcatResult = {
    outputPath,
    fileSize,
    processingTime,
    fileCount: sources.length,
    method,
  };

  if (totalDuration > 0) {
    result.totalDuration = totalDuration;
  }

  return result;
}
