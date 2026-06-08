/**
 * Glow / Bloom Generator
 * ======================
 * Soft luminance bloom — the dreamy "glow" look. Mechanical: you set the
 * radius + intensity, vixel renders it.
 *
 * @example
 * ```typescript
 * await glow({ inputPath: './scene.mp4', duration: 6 }, './dreamy.mp4', { sigma: 12, intensity: 0.5 });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { GlowConfig, GlowResult } from './types.js';
import { DEFAULT_SIGMA, DEFAULT_STEPS, DEFAULT_INTENSITY, DEFAULT_THRESHOLD, buildGlowFilter } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function glow(
  source: VideoSource,
  outputPath: string,
  config: GlowConfig = {},
): Promise<GlowResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const highlightsOnly = config.highlightsOnly ?? false;

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const filter = buildGlowFilter({
    sigma: config.sigma ?? DEFAULT_SIGMA,
    steps: config.steps ?? DEFAULT_STEPS,
    intensity: config.intensity ?? DEFAULT_INTENSITY,
    highlightsOnly,
    threshold: config.threshold ?? DEFAULT_THRESHOLD,
  });

  const args = [
    '-i', normalize(source.inputPath),
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, highlightsOnly };
}
