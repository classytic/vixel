/**
 * Reframe Generator
 * =================
 * Re-aspect a video for a different surface (vertical 9:16, square 1:1, …)
 * using a blurred-background pad, a crop-to-fill, or a solid pad.
 *
 * @example
 * ```typescript
 * // 16:9 → vertical 9:16 with a blurred background
 * await reframe({ inputPath: './landscape.mp4', duration: 30 }, './vertical.mp4', {
 *   aspect: '9:16',
 *   mode: 'blur-pad',
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { ReframeConfig, ReframeResult, ReframeMode } from './types.js';
import { ASPECT_DIMENSIONS, buildReframeFilter } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function reframe(
  source: VideoSource,
  outputPath: string,
  config: ReframeConfig = {},
): Promise<ReframeResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const mode: ReframeMode = config.mode ?? 'blur-pad';

  const preset = ASPECT_DIMENSIONS[config.aspect ?? '9:16'];
  const width = config.width ?? preset.width;
  const height = config.height ?? preset.height;
  if (width <= 0 || height <= 0) {
    throw new VixelError('reframe target width/height must be positive', ErrorCode.INVALID_CONFIG);
  }

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, ErrorCode.INVALID_INPUT);
    }
  }

  const built = buildReframeFilter(mode, width, height, {
    blur: config.blur,
    background: config.background,
  });

  const filterArgs = built.complex
    ? ['-filter_complex', built.filter, '-map', '[vout]', '-map', '0:a?']
    : ['-vf', built.filter];

  const args = [
    '-i', normalize(source.inputPath),
    ...filterArgs,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return {
    outputPath,
    fileSize,
    processingTime: Date.now() - startTime,
    dimensions: { width, height },
    mode,
  };
}
