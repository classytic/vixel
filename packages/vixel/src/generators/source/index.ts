/**
 * Generator source — materialize a synthetic source to a file (`source` arity).
 * =============================================================================
 * Renders a `generator` MediaReference (solid colour / test pattern) to a real
 * clip you can use anywhere a `source` is accepted. This is the frei0r/OFX
 * "SOURCE" arity made concrete — and how a `generator` reference becomes usable
 * without compose having to inline lavfi into its graph.
 */

import { normalize } from 'node:path';
import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';
import type { GeneratorReference } from '../../core/media-reference.js';
import { mediaInputArgs } from '../../core/media-reference.js';
import type { VixelPrimitiveDescriptor } from '../../core/descriptor.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';

export interface GenerateSourceConfig extends BaseGeneratorConfig {
  width: number;
  height: number;
  durationSec: number;
  fps?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  preset?: string;
}

export interface GenerateSourceResult extends GeneratorResult {
  generator: GeneratorReference['generator'];
  durationSec: number;
}

export const sourceDescriptor: VixelPrimitiveDescriptor = {
  id: 'vixel.source.generate',
  name: 'Generator Source',
  arity: 'source',
  description: 'Materialize a synthetic source (solid colour / test pattern) to a clip.',
  inputs: [],
  params: [
    { name: 'generator', type: 'choice', default: 'color', options: ['color', 'testsrc', 'smptebars'], description: 'Which generator' },
    { name: 'color', type: 'color', default: '000000', description: 'Fill colour (for the `color` generator)' },
    { name: 'durationSec', type: 'number', default: 3, min: 0.1, unit: 's', description: 'Length' },
  ],
};

export async function generateSource(
  ref: GeneratorReference,
  outputPath: string,
  config: GenerateSourceConfig,
): Promise<GenerateSourceResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const { width, height, durationSec } = config;
  const fps = config.fps ?? 30;
  const { input, options } = mediaInputArgs(ref, { width, height, durationSec });

  const args = [
    ...options,
    '-i', input,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-t', String(durationSec),
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, durationSec));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, generator: ref.generator, durationSec };
}
