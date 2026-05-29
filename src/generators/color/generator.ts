/**
 * Color Generator
 * ===============
 * Parametric color/quality knobs (`adjustColor`) and 3D LUT application
 * (`applyLut`). vixel ships the knob; the agent/host picks the values.
 *
 * @example
 * ```typescript
 * await adjustColor(source, './graded.mp4', { contrast: 1.1, saturation: 1.2, sharpen: 0.8 });
 * await applyLut(source, './look.mp4', { lutPath: './teal-orange.cube' });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { ColorAdjustConfig, ColorLutConfig, ColorResult } from './types.js';
import { buildColorAdjustFilter, buildLut3dFilter } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

async function runVideoFilter(
  source: VideoSource,
  outputPath: string,
  filter: string,
  config: ColorAdjustConfig | ColorLutConfig,
  mode: 'adjust' | 'lut',
): Promise<ColorResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const args = [
    '-i', normalize(source.inputPath),
    '-vf', filter,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));
  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, mode };
}

export async function adjustColor(
  source: VideoSource,
  outputPath: string,
  config: ColorAdjustConfig = {},
): Promise<ColorResult> {
  const filter = buildColorAdjustFilter(config);
  if (!filter) {
    throw new VixelError('adjustColor needs at least one of brightness/contrast/saturation/gamma/sharpen', ErrorCode.INVALID_CONFIG);
  }
  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, ErrorCode.INVALID_INPUT);
    }
  }
  return runVideoFilter(source, outputPath, filter, config, 'adjust');
}

export async function applyLut(
  source: VideoSource,
  outputPath: string,
  config: ColorLutConfig,
): Promise<ColorResult> {
  if (!config.lutPath) {
    throw new VixelError('applyLut requires `lutPath`', ErrorCode.INVALID_CONFIG);
  }
  if (!config.dryRun) {
    for (const p of [source.inputPath, config.lutPath]) {
      try {
        await fs.access(p);
      } catch {
        throw new VixelError(`Input not found: ${p}`, ErrorCode.INVALID_INPUT);
      }
    }
  }
  return runVideoFilter(source, outputPath, buildLut3dFilter(config.lutPath), config, 'lut');
}
