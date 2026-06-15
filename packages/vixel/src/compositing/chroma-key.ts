/**
 * Chroma key — green-screen the foreground over a background (mixer2).
 * ====================================================================
 * `[fg]chromakey → [bg][keyed]overlay`. Keys a color to transparent on the
 * foreground and composites it over the background, both at the output size.
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../types/generators.js';
import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../types/generators.js';
import type { VixelPrimitiveDescriptor } from '../core/descriptor.js';
import { spawnFFmpeg, configToSpawnOptions } from '../core/ffmpeg-spawn.js';
import { outputSize } from '../core/temp-manager.js';
import { VixelError, ErrorCode, ConfigError } from '../errors.js';

export interface ChromaKeyConfig extends BaseGeneratorConfig {
  /** Key color as `RRGGBB` hex (default `00FF00`, green). */
  color?: string;
  /** Match tolerance 0–1 (default `0.12`). Higher keys more of the color. */
  similarity?: number;
  /** Edge blend 0–1 (default `0.05`). Softens the key edge. */
  blend?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

export interface ChromaKeyResult extends GeneratorResult {
  color: string;
}

export const chromaKeyDescriptor: VixelPrimitiveDescriptor = {
  id: 'vixel.compositing.chromaKey',
  name: 'Chroma Key',
  arity: 'mixer2',
  description: 'Key a color out of the foreground and composite it over the background.',
  inputs: [{ name: 'foreground' }, { name: 'background' }],
  params: [
    { name: 'color', type: 'color', default: '00FF00', description: 'Key color (RRGGBB)' },
    { name: 'similarity', type: 'number', default: 0.12, min: 0.01, max: 1, displayMin: 0.01, displayMax: 0.5, step: 0.01, unit: 'fraction', description: 'Key tolerance' },
    { name: 'blend', type: 'number', default: 0.05, min: 0, max: 1, displayMin: 0, displayMax: 0.3, step: 0.01, unit: 'fraction', description: 'Edge softness' },
  ],
};

const HEX6 = /^[0-9a-fA-F]{6}$/;

/** Pure: build the `[vout]`-producing chroma-key composite graph. */
export function buildChromaKeyGraph(opts: {
  color: string;
  similarity: number;
  blend: number;
  width: number;
  height: number;
}): string {
  const { color, similarity, blend, width, height } = opts;
  return (
    `[0:v]scale=${width}:${height},chromakey=0x${color}:${similarity}:${blend}[ked];` +
    `[1:v]scale=${width}:${height}[bg];` +
    `[bg][ked]overlay=shortest=1,format=yuv420p[vout]`
  );
}

export async function chromaKey(
  foreground: VideoSource,
  background: VideoSource,
  outputPath: string,
  config: ChromaKeyConfig = {},
): Promise<ChromaKeyResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const color = (config.color ?? '00FF00').replace(/^#/, '');
  if (!HEX6.test(color)) throw new ConfigError(`chromaKey color must be RRGGBB hex, got "${color}"`);

  const width = foreground.width ?? background.width ?? 0;
  const height = foreground.height ?? background.height ?? 0;
  if (width <= 0 || height <= 0) throw new ConfigError('chromaKey needs source width/height (probe them first)');

  if (!config.dryRun) {
    for (const s of [foreground, background]) {
      try {
        await fs.access(s.inputPath);
      } catch {
        throw new VixelError(`Input not found: ${s.inputPath}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  const filter = buildChromaKeyGraph({
    color,
    similarity: config.similarity ?? 0.12,
    blend: config.blend ?? 0.05,
    width,
    height,
  });
  const args = [
    '-i', normalize(foreground.inputPath),
    '-i', normalize(background.inputPath),
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '1:a?',
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-shortest',
    '-y',
    normalize(outputPath),
  ];
  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, foreground.duration));
  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, color };
}
