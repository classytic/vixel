/**
 * In-browser animated-GIF export — the same Pixi frame loop as the MP4 path, but
 * each frame is quantized to a palette and written with `gifenc` (tiny, pure-JS,
 * optional dep). GIF is 256-color + 1-bit alpha, so gradients band and files grow
 * fast — default to a lower fps + a duration cap; for crisp motion prefer MP4 or
 * (later) animated WebP. Good for stickers / short looping clips.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { preloadAssets, renderScene, awaitVideoSeeks, destroyApp, type MediaCache } from '../preview/pixi/index.js';
import { totalDurationSec } from '../shared/utils/spec.js';
import { createApp, fpsOf } from './common.js';

export interface GifExportOptions {
  /** Output frame rate. Default 12 (GIFs look fine low, and stay small). */
  fps?: number;
  /** Palette size 2..256. Default 256. */
  maxColors?: number;
  /** Hard cap on duration (seconds) — GIFs balloon past this. Default 15. */
  maxDurationSec?: number;
  antialias?: boolean;
  onProgress?: (p: { frame: number; totalFrames: number; ratio: number }) => void;
  signal?: AbortSignal;
}

/** Render a {@link VixelSpec} to an animated-GIF {@link Blob} entirely in the browser. */
export async function exportToGif(spec: VixelSpec, opts: GifExportOptions = {}): Promise<Blob> {
  const PIXI = await import('pixi.js');
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');

  const fps = opts.fps ?? 12;
  const maxColors = Math.max(2, Math.min(256, opts.maxColors ?? 256));
  const dur = Math.min(totalDurationSec(spec), opts.maxDurationSec ?? 15);
  const totalFrames = Math.max(1, Math.round(dur * fps));
  const delay = Math.round(1000 / fps);

  const { app, W, H } = await createApp(PIXI, spec, opts.antialias ?? true);
  const cache: MediaCache = new Map();
  try {
    await preloadAssets(PIXI, spec, cache);
    const gif = GIFEncoder();

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
      const t = i / fps;
      await awaitVideoSeeks(spec, t, cache);
      renderScene(PIXI, app, spec, t, cache);

      const { pixels } = app.renderer.extract.pixels(app.stage);
      const data = pixels as unknown as Uint8Array; // RGBA
      const palette = quantize(data, maxColors);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, W, H, { palette, delay, ...(i === 0 ? { repeat: 0 } : {}) });

      opts.onProgress?.({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames });
    }

    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  } finally {
    destroyApp(app);
  }
}
