/**
 * Smart Reframe Generator
 * =======================
 * Reframe a landscape clip to vertical (or any aspect) while keeping the subject
 * in frame — the keystone of podcast/video → shorts. Feed it a subject `track`
 * (from prism-gpu's RVM matte); vixel renders the panning crop.
 *
 * @example
 * ```typescript
 * const src = await Source.fromFile('podcast-16x9.mp4');
 * await smartReframe(src, 'short-9x16.mp4', { track }); // track = [{ t, cx }, …]
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { SmartReframeConfig, SmartReframeResult } from './types.js';
import {
  DEFAULT_ASPECT,
  DEFAULT_SMOOTHING,
  DEFAULT_SAMPLE,
  DEFAULT_DEADZONE,
  buildSmartReframeFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode, ConfigError } from '../../errors.js';

export async function smartReframe(
  source: VideoSource,
  outputPath: string,
  config: SmartReframeConfig,
): Promise<SmartReframeResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const srcW = source.width ?? 0;
  const srcH = source.height ?? 0;
  if (srcW <= 0 || srcH <= 0) {
    throw new ConfigError('smartReframe needs the source width/height (probe the source first)');
  }

  const aspect = config.aspect ?? DEFAULT_ASPECT;
  const outW = config.width ?? 1080;
  const outH = Math.round((outW * aspect.h) / aspect.w / 2) * 2;

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const filter = buildSmartReframeFilter({
    srcW,
    srcH,
    track: config.track ?? [],
    aspect,
    outW,
    outH,
    smoothing: config.smoothing ?? DEFAULT_SMOOTHING,
    sampleInterval: config.sampleInterval ?? DEFAULT_SAMPLE,
    deadzone: config.deadzone ?? DEFAULT_DEADZONE,
  });

  const args = [
    '-i', normalize(source.inputPath),
    '-vf', filter,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, width: outW, height: outH };
}
