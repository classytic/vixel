/**
 * Slideshow Generator
 * ===================
 * Turn a list of images into a video — each slide optionally Ken Burns'd,
 * joined with transitions. Composes the `kenBurns` and transition/concat
 * primitives and manages its own temp files.
 *
 * @example
 * ```typescript
 * await slideshow(
 *   ['a.jpg', 'b.jpg', 'c.jpg'],
 *   './reel.mp4',
 *   { durationPer: 4, transition: 'fade', width: 1080, height: 1920 },
 * );
 * ```
 */

import { tmpdir } from 'node:os';
import type { VideoSource } from '../../types/generators.js';
import type { Slide, SlideshowConfig, SlideshowResult } from './types.js';
import type { KenBurnsDirection } from '../ken-burns/types.js';
import { kenBurns } from '../ken-burns/generator.js';
import { concatWithTransitions } from '../transitions/generator.js';
import { concatenateVideos } from '../concat/generator.js';
import { TempFileManager, outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';
import type { GeneratorCommand } from '../../types/generators.js';

/** Drop undefined keys so passing them doesn't trip exactOptionalPropertyTypes. */
function compact<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

export async function slideshow(
  slides: Array<Slide | string>,
  outputPath: string,
  config: SlideshowConfig = {},
): Promise<SlideshowResult> {
  const startTime = Date.now();
  if (slides.length === 0) {
    throw new VixelError('slideshow requires at least one slide', ErrorCode.INVALID_CONFIG);
  }

  const durationPer = config.durationPer ?? 4;
  const useKenBurns = config.kenBurns ?? true;
  const width = config.width ?? 1920;
  const height = config.height ?? 1080;
  const fps = config.fps ?? 30;
  const transition = config.transition ?? 'fade';
  const transitionDuration = config.transitionDuration ?? 0.5;

  const normalized: Slide[] = slides.map((s) => (typeof s === 'string' ? { image: s } : s));

  const temp = new TempFileManager();
  const tempDir = tmpdir();
  // When the caller wants command capture, forward each child command up.
  const onCommand = config.onCommand
    ? (cmd: GeneratorCommand) => config.onCommand!(cmd)
    : undefined;

  try {
    // 1) Render each slide into a Ken Burns (or static) segment.
    const segments: VideoSource[] = [];
    for (let i = 0; i < normalized.length; i++) {
      const slide = normalized[i]!;
      const duration = slide.duration ?? durationPer;
      const direction: KenBurnsDirection = slide.direction ?? (i % 2 === 0 ? 'in' : 'out');
      const segPath = temp.file(`vixel-slide-${i}.mp4`, tempDir);

      await kenBurns(slide.image, segPath, compact<import('../ken-burns/types.js').KenBurnsConfig>({
        duration,
        width,
        height,
        fps,
        direction: useKenBurns ? direction : 'in',
        // 'static-ish' when Ken Burns is off: no zoom range
        ...(useKenBurns ? {} : { startZoom: 1, endZoom: 1 }),
        videoCodec: config.videoCodec,
        crf: config.crf,
        preset: config.preset,
        ffmpegPath: config.ffmpegPath,
        timeout: config.timeout,
        signal: config.signal,
        dryRun: config.dryRun,
        ...(onCommand ? { onCommand } : {}),
      }));

      segments.push({ inputPath: segPath, duration, width, height });
    }

    // 2) Join the segments.
    let totalDuration: number;
    if (transition === 'none') {
      await concatenateVideos(segments, outputPath, compact<import('../concat/types.js').ConcatConfig>({
        ffmpegPath: config.ffmpegPath,
        timeout: config.timeout,
        signal: config.signal,
        dryRun: config.dryRun,
        ...(onCommand ? { onCommand } : {}),
      }));
      totalDuration = segments.reduce((a, s) => a + s.duration, 0);
    } else {
      const res = await concatWithTransitions(segments, outputPath, compact<import('../transitions/types.js').TransitionConfig>({
        transition,
        duration: transitionDuration,
        width,
        height,
        fps,
        audio: false, // image segments are silent
        videoCodec: config.videoCodec,
        crf: config.crf,
        preset: config.preset,
        ffmpegPath: config.ffmpegPath,
        timeout: config.timeout,
        signal: config.signal,
        dryRun: config.dryRun,
        ...(onCommand ? { onCommand } : {}),
      }));
      totalDuration = res.totalDuration;
    }

    return {
      outputPath,
      fileSize: await outputSize(outputPath, config.dryRun),
      processingTime: Date.now() - startTime,
      slideCount: normalized.length,
      totalDuration,
    };
  } finally {
    await temp.cleanup();
  }
}
