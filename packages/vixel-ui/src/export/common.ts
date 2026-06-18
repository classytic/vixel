/**
 * Shared in-browser export plumbing — the bits every sink (MP4 / image / GIF)
 * needs: even dimensions (H.264 wants them), fps resolution, and a configured
 * headless Pixi app. One renderer ({@link renderScene}) feeds them all, so every
 * output is WYSIWYG with the editor preview.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { createApp as createPixiApp } from '../preview/pixi/index.js';

type Pixi = typeof import('pixi.js');

/** Round down to the nearest even number (H.264 needs even W/H; harmless for image/GIF). */
export const even = (n: number): number => (n % 2 === 0 ? n : n - 1);

/** Resolve a spec fps (number or rational) to a number. */
export const fpsOf = (fps: VixelSpec['output']['fps']): number =>
  typeof fps === 'number' ? fps : fps.num / fps.den;

/** Is in-browser frame capture available? (WebGL canvas + a 2D fallback always are.) */
export function canExportInBrowser(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

/**
 * Create + init a headless Pixi {@link PIXINS.Application} sized to the spec
 * (even dims, manual frame stepping). The caller preloads assets + drives
 * `renderScene`. `preference: 'webgl'` for the broadest VideoFrame/readback support.
 */
export async function createApp(
  PIXI: Pixi,
  spec: VixelSpec,
  antialias: boolean,
): Promise<{ app: import('pixi.js').Application; W: number; H: number }> {
  const W = even(spec.output.width);
  const H = even(spec.output.height);
  // Delegate to the single app owner (pixi/app.ts) so export shares the same
  // init — incl. advanced-blend-mode registration + useBackBuffer. `'webgl'` for
  // broadest VideoFrame/readback support (SwiftShader/GPU-less servers).
  const app = await createPixiApp(PIXI, {
    width: W,
    height: H,
    background: spec.output.background ?? '#000000',
    antialias,
    preference: 'webgl',
  });
  return { app, W, H };
}
