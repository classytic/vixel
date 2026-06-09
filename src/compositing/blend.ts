/**
 * Blend — composite two layers with a blend mode (mixer2).
 * ========================================================
 * `[base][overlay] → blend=all_mode=…` — the screen/multiply/overlay family
 * ffmpeg supports natively. The overlay is scaled to the base's frame size.
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../types/generators.js';
import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../types/generators.js';
import type { VixelPrimitiveDescriptor } from '../core/descriptor.js';
import { spawnFFmpeg, configToSpawnOptions } from '../core/ffmpeg-spawn.js';
import { outputSize } from '../core/temp-manager.js';
import { VixelError, ErrorCode, ConfigError } from '../errors.js';

/**
 * Blend modes that exist natively in ffmpeg's `blend` filter. This is the subset
 * of Natron's 40 Merge operators that map to a pure 2-input pixel op (the rest —
 * alpha-matte `in/out/atop/mask` and HSL `hue/sat/color/lum` modes — are
 * compositor-tier and refused). All render-verified.
 */
export const BLEND_MODES = [
  'screen', 'multiply', 'overlay', 'softlight', 'hardlight',
  'lighten', 'darken', 'difference', 'addition', 'subtract', 'divide', 'average',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface BlendConfig extends BaseGeneratorConfig {
  /** Blend mode (default `screen`). */
  mode?: BlendMode;
  /** Overlay opacity 0–1 (default `1`). */
  opacity?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

export interface BlendResult extends GeneratorResult {
  mode: BlendMode;
}

export const blendDescriptor: VixelPrimitiveDescriptor = {
  id: 'vixel.compositing.blend',
  name: 'Blend',
  arity: 'mixer2',
  description: 'Composite an overlay over a base using a blend mode.',
  inputs: [{ name: 'base' }, { name: 'overlay' }],
  params: [
    { name: 'mode', type: 'choice', default: 'screen', options: BLEND_MODES, description: 'Blend mode' },
    { name: 'opacity', type: 'number', default: 1, min: 0, max: 1, displayMin: 0, displayMax: 1, step: 0.05, unit: 'fraction', description: 'Overlay opacity' },
  ],
};

/** Pure: build the `[vout]`-producing blend graph. */
export function buildBlendFilter(opts: { mode: BlendMode; opacity: number; width: number; height: number }): string {
  const { mode, opacity, width, height } = opts;
  return (
    `[0:v]format=rgba[base];` +
    `[1:v]scale=${width}:${height},format=rgba[ov];` +
    `[base][ov]blend=all_mode=${mode}:all_opacity=${opacity},format=yuv420p[vout]`
  );
}

export async function blend(
  base: VideoSource,
  overlay: VideoSource,
  outputPath: string,
  config: BlendConfig = {},
): Promise<BlendResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const mode = config.mode ?? 'screen';
  const width = base.width ?? 0;
  const height = base.height ?? 0;
  if (width <= 0 || height <= 0) throw new ConfigError('blend needs the base source width/height (probe it first)');

  if (!config.dryRun) {
    for (const s of [base, overlay]) {
      try {
        await fs.access(s.inputPath);
      } catch {
        throw new VixelError(`Input not found: ${s.inputPath}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  const filter = buildBlendFilter({ mode, opacity: config.opacity ?? 1, width, height });
  const args = [
    '-i', normalize(base.inputPath),
    '-i', normalize(overlay.inputPath),
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-shortest',
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, base.duration));
  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, mode };
}
