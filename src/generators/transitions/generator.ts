/**
 * Transition Concat Generator
 * ===========================
 * Concatenate multiple clips with crossfade/dissolve/wipe transitions
 * (xfade for video, acrossfade for audio) instead of hard cuts.
 *
 * @example
 * ```typescript
 * await concatWithTransitions(
 *   [shot1, shot2, shot3],  // each a VideoSource with a known duration
 *   './reel.mp4',
 *   { transition: 'dissolve', duration: 0.75, width: 1080, height: 1920 },
 * );
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize as normalizePath } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { TransitionConfig, TransitionResult, XfadeTransition } from './types.js';
import { DEFAULT_TRANSITION, DEFAULT_TRANSITION_DURATION, buildXfadeGraph } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function concatWithTransitions(
  sources: VideoSource[],
  outputPath: string,
  config: TransitionConfig = {},
): Promise<TransitionResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';

  if (sources.length < 2) {
    throw new VixelError('concatWithTransitions requires at least 2 clips', { code: ErrorCode.INVALID_CONFIG });
  }
  if (sources.some((s) => !s.duration || s.duration <= 0)) {
    throw new VixelError('every clip needs a positive `duration` to compute xfade offsets', { code: ErrorCode.INVALID_CONFIG });
  }

  if (!config.dryRun) {
    for (const s of sources) {
      try {
        await fs.access(s.inputPath);
      } catch {
        throw new VixelError(`Input not found: ${s.inputPath}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  const transition = (config.transition ?? DEFAULT_TRANSITION) as XfadeTransition;
  const transitionDuration = config.duration ?? DEFAULT_TRANSITION_DURATION;
  const audio = config.audio ?? true;
  const normalize =
    config.width && config.height
      ? { width: config.width, height: config.height, fps: config.fps }
      : undefined;

  const graph = buildXfadeGraph({
    durations: sources.map((s) => s.duration),
    transition,
    transitionDuration,
    audio,
    normalize,
  });

  const inputs = sources.flatMap((s) => ['-i', normalizePath(s.inputPath)]);
  const maps = ['-map', graph.videoLabel];
  if (graph.audioLabel) maps.push('-map', graph.audioLabel);

  const args = [
    ...inputs,
    '-filter_complex', graph.filterComplex,
    ...maps,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    ...(graph.audioLabel ? ['-c:a', config.audioCodec ?? 'aac'] : ['-an']),
    '-y',
    normalizePath(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, graph.totalDuration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return {
    outputPath,
    fileSize,
    processingTime: Date.now() - startTime,
    clipCount: sources.length,
    transition,
    totalDuration: graph.totalDuration,
  };
}
