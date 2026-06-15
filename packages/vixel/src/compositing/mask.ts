/**
 * Mask — cut a clip to a geometric shape with a soft edge (filter).
 * =================================================================
 * Produces RGBA with a shaped alpha channel (circle / ellipse) — a round
 * avatar, a spotlight, a PiP cutout. Because the output carries alpha, it
 * defaults to an alpha-preserving codec (`qtrle` in a `.mov`); feed it to an
 * overlay track to composite it.
 *
 * Animated / bézier-path (roto) masks are deliberately out of scope — that's the
 * compositor tier (see DESIGN.md, "What vixel deliberately refuses").
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../types/generators.js';
import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../types/generators.js';
import type { VixelPrimitiveDescriptor } from '../core/descriptor.js';
import { spawnFFmpeg, configToSpawnOptions } from '../core/ffmpeg-spawn.js';
import { outputSize } from '../core/temp-manager.js';
import { VixelError, ErrorCode } from '../errors.js';

export type MaskShape = 'ellipse' | 'circle';

export interface MaskConfig extends BaseGeneratorConfig {
  /** Mask shape (default `circle`). `ellipse` fills the frame; `circle` is centered. */
  shape?: MaskShape;
  /** Edge softness as a fraction of the radius, 0–1 (default `0.04`). */
  feather?: number;
  /** Output codec — defaults to alpha-preserving `qtrle`. */
  videoCodec?: string;
  /** CRF (only applied for libx264/libx265, which flatten alpha onto black). */
  crf?: number;
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

export interface MaskResult extends GeneratorResult {
  shape: MaskShape;
}

export const maskDescriptor: VixelPrimitiveDescriptor = {
  id: 'vixel.compositing.mask',
  name: 'Mask',
  arity: 'filter',
  description: 'Cut a clip to a geometric shape with a soft edge (outputs alpha).',
  inputs: [{ name: 'source' }],
  params: [
    { name: 'shape', type: 'choice', default: 'circle', options: ['ellipse', 'circle'], description: 'Mask shape' },
    { name: 'feather', type: 'number', default: 0.04, min: 0, max: 1, displayMin: 0, displayMax: 0.3, step: 0.01, unit: 'fraction', description: 'Edge softness' },
  ],
};

/** Pure: build the `-vf` chain that sets a shaped alpha via `geq`. */
export function buildMaskFilter(opts: { shape: MaskShape; feather: number }): string {
  const fw = Math.max(0.001, opts.feather); // avoid divide-by-zero in the ramp
  // normalized distance d: 0 at center, 1 at the shape edge
  const d =
    opts.shape === 'circle'
      ? `(hypot(X-W/2\\,Y-H/2)/(min(W\\,H)/2))`
      : `(hypot((X-W/2)/(W/2)\\,(Y-H/2)/(H/2)))`;
  // opaque inside, linear feather across the last `fw` of the radius, transparent outside
  const alpha = `255*clip((1-${d})/${fw}\\,0\\,1)`;
  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'`;
}

export async function mask(source: VideoSource, outputPath: string, config: MaskConfig = {}): Promise<MaskResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const shape = config.shape ?? 'circle';
  const codec = config.videoCodec ?? 'qtrle';

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const filter = buildMaskFilter({ shape, feather: config.feather ?? 0.04 });
  const lossy = codec === 'libx264' || codec === 'libx265';
  const args = [
    '-i', normalize(source.inputPath),
    '-vf', filter,
    '-c:v', codec,
    ...(lossy ? ['-crf', String(config.crf ?? 18), '-pix_fmt', 'yuv420p'] : []),
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));
  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, shape };
}
