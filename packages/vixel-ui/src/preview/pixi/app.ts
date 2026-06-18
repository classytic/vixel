/**
 * Pixi {@link PIXINS.Application} lifecycle — create + tear down the WebGL app the
 * preview/export render into. Extracted verbatim from `<PixiPreview>`'s init/destroy
 * so both the editor preview and the headless server export (`vixel-render-pixi`)
 * spin up the SAME app with the SAME options.
 *
 * `pixi.js` is passed in (dynamically imported by the caller), keeping this module —
 * and the package — free of a hard dependency on `pixi.js`.
 */
import type * as PIXINS from 'pixi.js';
import type { Pixi } from './types.js';
import { disposeScene } from './scene.js';

/** Options for {@link createApp} — the subset of `ApplicationOptions` the preview sets. */
export interface CreateAppOptions {
  width: number;
  height: number;
  /** Canvas clear color (default `#000000`). */
  background?: string;
  /** Antialiasing (default true). */
  antialias?: boolean;
  /** Renderer preference (export pins `'webgl'` for broadest readback/SwiftShader support). */
  preference?: 'webgl' | 'webgpu';
  /** Device-pixel multiplier (default 1). Export uses this as the QUALITY LADDER: the
   *  logical scene stays `width × height`, but the physical canvas (what `VideoFrame`
   *  captures) becomes `width·resolution × height·resolution` — so the SAME composition
   *  renders at 720p / 1080p / 4K without re-authoring. */
  resolution?: number;
}

/**
 * Create + init a Pixi Application with the preview's options. Mirrors the live
 * editor preview's init exactly: `autoStart: false` (the renderer drives frames),
 * `resolution: 1`.
 */
export async function createApp(PIXI: Pixi, opts: CreateAppOptions): Promise<PIXINS.Application> {
  // Register the advanced (filter-based) blend modes — `overlay` / `soft-light`.
  // Without this side-effect import they silently fall back to `normal` on WebGL.
  // Optional subpath: best-effort so an older pixi build still works.
  try {
    // @ts-ignore — optional pixi v8 subpath, imported only for its registration side effect
    await import('pixi.js/advanced-blend-modes');
  } catch {
    /* not available in this pixi build */
  }
  const app = new PIXI.Application();
  await app.init({
    width: opts.width,
    height: opts.height,
    background: opts.background ?? '#000000',
    antialias: opts.antialias ?? true,
    autoStart: false,
    resolution: opts.resolution ?? 1,
    autoDensity: false, // export: physical canvas == width·resolution (no CSS sizing)
    // Advanced blend modes (overlay/soft-light) need the back buffer on WebGL.
    useBackBuffer: true,
    ...(opts.preference ? { preference: opts.preference } : {}),
  });
  return app;
}

/**
 * Tear down an app: free the off-stage gl-transition RenderTextures first
 * ({@link disposeScene}), then destroy the app + its display graph. Mirrors the
 * preview's unmount cleanup.
 */
export function destroyApp(app: PIXINS.Application): void {
  disposeScene(app); // free off-stage transition RTs first
  // `releaseGlobalResources` drains the global batch/texture pools — REQUIRED when
  // an app is destroyed + re-created in the same tab (the preview re-inits on a
  // size/antialias change), else the next app flickers / shows stale textures.
  // (MediaCache textures are owned by `disposeMediaCache`, so we do NOT pass
  // `texture/textureSource` here — that would double-free shared textures.)
  app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
}
