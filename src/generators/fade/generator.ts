/**
 * Fade Generator
 * ==============
 * Fade a clip in from / out to black (or white), optionally fading audio too.
 *
 * @example
 * ```typescript
 * await fade({ inputPath: './clip.mp4', duration: 12 }, './faded.mp4', {
 *   fadeIn: 0.5,
 *   fadeOut: 1,
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { FadeConfig, FadeResult } from './types.js';
import { buildFadeFilters } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function fade(
  source: VideoSource,
  outputPath: string,
  config: FadeConfig = {},
): Promise<FadeResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const fadeIn = config.fadeIn ?? 0;
  const fadeOut = config.fadeOut ?? 0;
  const audio = config.audio ?? true;

  if (fadeIn <= 0 && fadeOut <= 0) {
    throw new VixelError('fade requires `fadeIn` and/or `fadeOut` > 0', ErrorCode.INVALID_CONFIG);
  }
  if (fadeOut > 0 && (!source.duration || source.duration <= 0)) {
    throw new VixelError('fadeOut needs the source `duration` to place the fade', ErrorCode.INVALID_CONFIG);
  }

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, ErrorCode.INVALID_INPUT);
    }
  }

  const { videoFilter, audioFilter } = buildFadeFilters({
    duration: source.duration,
    fadeIn,
    fadeOut,
    color: config.color ?? 'black',
    audio,
  });

  const args = [
    '-i', normalize(source.inputPath),
    '-vf', videoFilter,
    ...(audioFilter ? ['-af', audioFilter] : []),
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    ...(audioFilter ? ['-c:a', 'aac'] : ['-c:a', 'copy']),
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, fadeIn, fadeOut };
}
