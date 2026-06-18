/**
 * In-browser STILL export — render one frame of a {@link VixelSpec} to a PNG/JPEG/
 * WebP {@link Blob}. The same Pixi renderer as the preview/MP4 path, so a poster
 * frame or a static social card is pixel-identical to what the editor shows. Turns
 * the editor into a Canva-style image tool with zero extra rendering code.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { preloadAssets, renderScene, awaitVideoSeeks, destroyApp, type MediaCache } from '../preview/pixi/index.js';
import { createApp, fpsOf } from './common.js';

export interface ImageExportOptions {
  /** Time (seconds) to capture. Default 0 (first frame). */
  at?: number;
  /** Encoding. Default `'png'`. */
  format?: 'png' | 'jpeg' | 'webp';
  /** 0..1 quality for jpeg/webp (ignored for png). Default 0.92. */
  quality?: number;
  antialias?: boolean;
}

/**
 * Render a {@link VixelSpec} to a single-image {@link Blob}. Captures via Pixi's
 * extract (reliable WebGL framebuffer readback), so it works regardless of the
 * canvas' `preserveDrawingBuffer`.
 */
export async function exportToImage(spec: VixelSpec, opts: ImageExportOptions = {}): Promise<Blob> {
  const PIXI = await import('pixi.js');
  const at = opts.at ?? 0;
  const { app } = await createApp(PIXI, spec, opts.antialias ?? true);
  const cache: MediaCache = new Map();
  try {
    await preloadAssets(PIXI, spec, cache);
    await awaitVideoSeeks(spec, at, cache);
    renderScene(PIXI, app, spec, at, cache);

    const canvas = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
    const type = opts.format === 'jpeg' ? 'image/jpeg' : opts.format === 'webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, opts.quality ?? 0.92));
    if (!blob) throw new Error('image encode failed (canvas.toBlob returned null)');
    return blob;
  } finally {
    destroyApp(app);
  }
}
