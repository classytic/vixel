/**
 * Speed Ramp Generator
 * ====================
 * Variable playback speed across a clip, with optical-flow slow-motion. The
 * CapCut "speed curve": e.g. real-time → 0.3x slow-mo on the action → 2x out.
 *
 * Video-only by design — speed-ramped footage is a visual element; bring audio
 * from a separate track (compose's audio track / a music bed), not from the
 * pitch-warped source. That keeps the primitive honest and the API small.
 *
 * @example
 * ```typescript
 * const src = await Source.fromFile('jump.mp4'); // 6s
 * await speedRamp(src, 'ramped.mp4', {
 *   segments: [
 *     { throughSec: 2, speed: 1 },     // normal run-up
 *     { throughSec: 3, speed: 0.3 },   // buttery slow-mo on the jump
 *     { throughSec: 6, speed: 2 },     // fast landing
 *   ],
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { SpeedRampConfig, SpeedRampResult } from './types.js';
import {
  DEFAULT_FPS,
  DEFAULT_SMOOTH,
  DEFAULT_CRF,
  DEFAULT_PRESET,
  DEFAULT_VIDEO_CODEC,
  buildSpeedRampFilter,
  validateSpeedRamp,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode, ConfigError } from '../../errors.js';

export async function speedRamp(
  source: VideoSource,
  outputPath: string,
  config: SpeedRampConfig,
): Promise<SpeedRampResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const sourceDuration = source.duration ?? 0;

  try {
    validateSpeedRamp(config.segments, sourceDuration);
  } catch (err) {
    throw new ConfigError((err as Error).message);
  }

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const fps = config.fps ?? DEFAULT_FPS;
  const { filter, plan } = buildSpeedRampFilter({
    segments: config.segments,
    sourceDuration,
    smooth: config.smooth ?? DEFAULT_SMOOTH,
    fps,
  });
  const newDuration = plan.reduce((sum, s) => sum + s.outDuration, 0);

  const args = [
    '-i', normalize(source.inputPath),
    '-filter_complex', filter,
    '-map', '[vout]',
    '-an', // video-only — see the module note above
    '-c:v', config.videoCodec ?? DEFAULT_VIDEO_CODEC,
    '-crf', String(config.crf ?? DEFAULT_CRF),
    '-preset', config.preset ?? DEFAULT_PRESET,
    '-r', String(fps),
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, newDuration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, segments: plan, newDuration };
}
