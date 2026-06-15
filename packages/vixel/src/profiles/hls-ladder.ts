/**
 * HLS-ladder profile.
 * ==================
 * End-viewer adaptive HLS (VOD) — a clean recipe over the existing
 * {@link HLSProcessor}. Picks a sane bitrate ladder from the source resolution
 * (never upscaling), encodes keyframe-aligned renditions, and writes a master
 * playlist. This is for DELIVERY/playback; the editor scrub path is
 * `profiles/editorProxy` (progressive MP4 + sprites), not HLS.
 *
 * @example
 * ```ts
 * const src = await Source.fromFile('master.mp4');
 * const out = await hlsLadder(src, './hls');     // → ./hls/master.m3u8
 * ```
 */

import { join } from 'node:path';
import { HLSProcessor } from '../processor.js';
import { QUALITY_PRESETS } from '../core/quality.js';
import type { QualityVariant } from '../types/index.js';
import type { VideoSource } from '../types/generators.js';

/** Ladder rungs, largest → smallest. */
const LADDER_ORDER = ['1080p', '720p', '480p', '360p'] as const;

export interface HlsLadderConfig {
  /** Explicit variants — overrides the auto-derived ladder. */
  variants?: QualityVariant[];
  /** Cap the top rung (e.g. 720) regardless of source size. */
  maxHeight?: number;
  ffmpegPath?: string;
  ffprobePath?: string;
  timeout?: number;
  debug?: boolean;
  onProgress?: (p: { percent: number }) => void;
}

export interface HlsLadderResult {
  outputDir: string;
  /** Path to the master playlist. */
  masterPlaylist: string;
  /** The rungs that were encoded. */
  variants: QualityVariant[];
}

function toVariant(key: (typeof LADDER_ORDER)[number]): QualityVariant {
  const p = QUALITY_PRESETS[key]!;
  return {
    name: key,
    height: p.height,
    videoBitrate: parseInt(p.videoBitrate, 10),
    audioBitrate: parseInt(p.audioBitrate, 10),
  };
}

/**
 * Pick ladder rungs no taller than the source (never upscale), capped by
 * `maxHeight`. Always keeps at least the smallest rung so there's a low-
 * bandwidth fallback even for tiny sources.
 */
export function ladderFor(sourceHeight: number, maxHeight?: number): QualityVariant[] {
  const cap = Math.min(sourceHeight || 1080, maxHeight ?? Infinity);
  const rungs = LADDER_ORDER.filter((k) => QUALITY_PRESETS[k]!.height <= cap).map(toVariant);
  return rungs.length > 0 ? rungs : [toVariant('360p')];
}

export async function hlsLadder(
  source: VideoSource,
  outputDir: string,
  config: HlsLadderConfig = {},
): Promise<HlsLadderResult> {
  const variants = config.variants ?? ladderFor(source.height ?? 1080, config.maxHeight);

  const processor = new HLSProcessor({
    variants,
    ffmpeg: {
      ...(config.ffmpegPath !== undefined ? { ffmpegPath: config.ffmpegPath } : {}),
      ...(config.ffprobePath !== undefined ? { ffprobePath: config.ffprobePath } : {}),
      ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
    },
    ...(config.debug !== undefined ? { debug: config.debug } : {}),
  });

  await processor.process({
    inputPath: source.inputPath,
    outputDir,
    // `config` is required by ProcessorOptions though `process` reads the
    // constructor's; pass the same variants to satisfy the type.
    config: { variants },
    ...(config.onProgress !== undefined ? { onProgress: config.onProgress } : {}),
  });

  return { outputDir, masterPlaylist: join(outputDir, 'master.m3u8'), variants };
}
