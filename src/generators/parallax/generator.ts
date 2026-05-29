/**
 * Parallax (2.5D) Generator
 * =========================
 * Turn a still image + a depth map into a "3D photo" clip — near pixels move
 * more than far ones for a fake camera move. The depth map comes from a depth
 * model (Depth Anything / MiDaS); vixel does the mechanical displacement.
 *
 * @example
 * ```typescript
 * await parallax3d('./scene.png', './scene-3d.mp4', {
 *   duration: 5, depthMap: './scene-depth.png', mode: 'sway', amplitude: 12,
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { ParallaxConfig, ParallaxResult, ParallaxMode } from './types.js';
import {
  DEFAULT_AMPLITUDE,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_FPS,
  buildParallaxFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function parallax3d(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
): Promise<ParallaxResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';

  if (!config.duration || config.duration <= 0) {
    throw new VixelError('parallax3d requires a positive `duration`', ErrorCode.INVALID_CONFIG);
  }
  if (!config.depthMap) {
    throw new VixelError('parallax3d requires a `depthMap`', ErrorCode.INVALID_CONFIG);
  }

  if (!config.dryRun) {
    for (const p of [imagePath, config.depthMap]) {
      try {
        await fs.access(p);
      } catch {
        throw new VixelError(`Input not found: ${p}`, ErrorCode.INVALID_INPUT);
      }
    }
  }

  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const fps = config.fps ?? DEFAULT_FPS;
  const mode: ParallaxMode = config.mode ?? 'sway';
  const amplitude = config.amplitude ?? DEFAULT_AMPLITUDE;
  const period = config.period ?? config.duration;

  const filter = buildParallaxFilter({ width, height, amplitude, period, duration: config.duration, mode });

  const args = [
    '-loop', '1', '-i', normalize(imagePath),
    '-loop', '1', '-i', normalize(config.depthMap),
    '-t', String(config.duration),
    '-filter_complex', filter,
    '-map', '[vout]',
    '-r', String(fps),
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'medium',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, config.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return {
    outputPath,
    fileSize,
    processingTime: Date.now() - startTime,
    duration: config.duration,
    dimensions: { width, height },
    mode,
  };
}
