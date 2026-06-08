/**
 * Ken Burns Generator
 * ===================
 * Turn a still image into a moving clip with a slow zoom/pan — the staple
 * "faceless" visual technique. Mechanical primitive: you pick the motion and
 * duration, vixel renders it.
 *
 * @example
 * ```typescript
 * await kenBurns('./photo.jpg', './clip.mp4', { duration: 5, direction: 'in' });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { KenBurnsConfig, KenBurnsResult, KenBurnsDirection } from './types.js';
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_FPS,
  DEFAULT_ZOOM_IN_END,
  DEFAULT_ZOOM_OUT_START,
  DEFAULT_PAN_ZOOM,
  buildKenBurnsFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function kenBurns(
  imagePath: string,
  outputPath: string,
  config: KenBurnsConfig,
): Promise<KenBurnsResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';

  if (!config.duration || config.duration <= 0) {
    throw new VixelError('kenBurns requires a positive `duration`', { code: ErrorCode.INVALID_CONFIG });
  }

  if (!config.dryRun) {
    try {
      await fs.access(imagePath);
    } catch {
      throw new VixelError(`Input image not found: ${imagePath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const fps = config.fps ?? DEFAULT_FPS;
  const direction: KenBurnsDirection = config.direction ?? 'in';
  const frames = Math.max(1, Math.round(config.duration * fps));

  const startZoom = config.startZoom ?? (direction === 'out' ? DEFAULT_ZOOM_OUT_START : 1.0);
  const endZoom = config.endZoom ?? (direction === 'out' ? 1.0 : DEFAULT_ZOOM_IN_END);

  const filter = buildKenBurnsFilter({
    width,
    height,
    fps,
    frames,
    direction,
    startZoom,
    endZoom,
    panZoom: config.panZoom ?? DEFAULT_PAN_ZOOM,
  });

  const args = [
    '-loop', '1',
    '-i', normalize(imagePath),
    '-t', String(config.duration),
    '-vf', filter,
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
    direction,
  };
}
