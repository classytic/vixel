/**
 * Overlay Generator
 * =================
 * Composite an atmosphere overlay (light leak / particles / bokeh / lens flare)
 * over a video via screen/lighten/add blend. The overlay is looped to cover the
 * whole base and the output is cut to the base length.
 *
 * Pairs with the curated overlay asset library (assets/overlays/).
 *
 * @example
 * ```typescript
 * await overlay(source, './out.mp4', {
 *   overlayPath: 'assets/overlays/light-leaks/light-leak-123.mp4',
 *   blend: 'screen', opacity: 0.5,
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { OverlayConfig, OverlayResult, OverlayBlend } from './types.js';
import { DEFAULT_BLEND, DEFAULT_OPACITY, buildOverlayFilter } from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { probeVideo } from '../../core/probe.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function overlay(
  source: VideoSource,
  outputPath: string,
  config: OverlayConfig,
): Promise<OverlayResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const blend: OverlayBlend = config.blend ?? (DEFAULT_BLEND as OverlayBlend);

  if (!config.overlayPath) {
    throw new VixelError('overlay requires `overlayPath`', { code: ErrorCode.INVALID_CONFIG });
  }
  if (!config.dryRun) {
    for (const p of [source.inputPath, config.overlayPath]) {
      try {
        await fs.access(p);
      } catch {
        throw new VixelError(`Input not found: ${p}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  // Resolve base dimensions (config → source → probe; skip probe in dry-run).
  let width = config.width ?? source.width;
  let height = config.height ?? source.height;
  if ((!width || !height) && !config.dryRun) {
    const meta = await probeVideo(source.inputPath, config.ffprobePath);
    width = width ?? meta.width;
    height = height ?? meta.height;
  }
  width = width ?? 1080;
  height = height ?? 1920;

  const filter = buildOverlayFilter({ width, height, blend, opacity: config.opacity ?? DEFAULT_OPACITY });

  const args = [
    '-i', normalize(source.inputPath),
    '-stream_loop', '-1', '-i', normalize(config.overlayPath), // loop overlay to cover base
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-shortest', // cut to base length
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, blend };
}
