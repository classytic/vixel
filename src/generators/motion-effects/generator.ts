/**
 * Motion Effects Generator
 * ========================
 * One dispatcher for the trending in-filter effects. Mechanical: pick the
 * effect + intensity, vixel renders it.
 *
 * @example
 * ```typescript
 * const src = await Source.fromFile('clip.mp4');
 * await motionEffect(src, 'glitched.mp4', { effect: 'glitch', intensity: 0.7 });
 * await motionEffect(src, 'punchy.mp4',  { effect: 'zoom-punch', intensity: 0.5 });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { MotionEffectConfig, MotionEffectResult } from './types.js';
import {
  DEFAULT_INTENSITY,
  DEFAULT_FPS,
  DEFAULT_CRF,
  DEFAULT_PRESET,
  DEFAULT_VIDEO_CODEC,
  buildMotionEffectFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode, ConfigError } from '../../errors.js';

const EFFECTS = new Set(['glitch', 'shake', 'rgb-split', 'zoom-punch']);

export async function motionEffect(
  source: VideoSource,
  outputPath: string,
  config: MotionEffectConfig,
): Promise<MotionEffectResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const { effect } = config;
  const intensity = config.intensity ?? DEFAULT_INTENSITY;

  if (!EFFECTS.has(effect)) {
    throw new ConfigError(`Unknown motion effect: ${effect}`, { context: { effect } });
  }

  // zoom-punch emits at an explicit frame size — it needs the source dimensions.
  const width = source.width ?? 0;
  const height = source.height ?? 0;
  if (effect === 'zoom-punch' && (width <= 0 || height <= 0)) {
    throw new ConfigError("zoom-punch needs the source width/height (probe the source first)");
  }

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const fps = config.fps ?? source.fps ?? DEFAULT_FPS;
  const filter = buildMotionEffectFilter(effect, { intensity, width, height, fps });

  const args = [
    '-i', normalize(source.inputPath),
    '-vf', filter,
    '-c:v', config.videoCodec ?? DEFAULT_VIDEO_CODEC,
    '-crf', String(config.crf ?? DEFAULT_CRF),
    '-preset', config.preset ?? DEFAULT_PRESET,
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, effect, intensity };
}
