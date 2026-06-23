/**
 * `<PixiPreview>` — a real WebGL preview that renders the actual `VixelSpec`
 * (not a proxy video). Mirrors the editor playhead, runs its own playback clock,
 * and re-renders the composition each frame via {@link renderScene}.
 *
 * `pixi.js` is loaded dynamically (optional dep), so importing this subpath is
 * the only thing that pulls Pixi into your bundle.
 *
 * @example
 * ```tsx
 * import { PixiPreview } from '@classytic/vixel-ui/preview';
 * <VixelEditor spec={spec}><PixiPreview className="w-full" /></VixelEditor>
 * ```
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type * as PIXINS from 'pixi.js';
import { registerSpecPacks } from '@classytic/vixel-schema';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';
import { preloadAssets, renderScene, collectMediaKeys, collectFontFaces, loadFonts, loadLuts, loadShaders, loadEffectTextures, collectEffectTextureUrls, clearElementLayouts, createApp, destroyApp, disposeMediaCache, evictUnused, type MediaCache } from '../pixi/index.js';

type Pixi = typeof import('pixi.js');

export interface PixiPreviewProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Antialiasing (default true). */
  antialias?: boolean;
}

export function PixiPreview({ antialias = true, className, style, ...props }: PixiPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXINS.Application | null>(null);
  const pixiRef = useRef<Pixi | null>(null);
  const cacheRef = useRef<MediaCache>(new Map());
  const [ready, setReady] = useState(false);
  const [assetVersion, setAssetVersion] = useState(0);
  // True while the spec's media is (pre)loading — drives a loader overlay so the
  // user never sees half-decoded textures (the "white video / snaps to native size"
  // flash) on first paint or when new assets are added.
  const [loading, setLoading] = useState(true);

  const spec = useEditorState((s) => s.spec);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const isPlaying = useEditorState((s) => s.isPlaying);
  const durationSec = useEditorState((s) => s.durationSec);
  const actions = useEditorActions();

  const W = spec.output.width;
  const H = spec.output.height;

  // Live refs so the rAF clock + the coalesced renderer always read the latest
  // values without re-subscribing each frame.
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;
  const specRef = useRef(spec);
  specRef.current = spec;

  // The SET of media URLs the spec references. Transform/opacity/rotation edits
  // leave this unchanged, so the preload effect below won't re-run on every
  // slider tick (it used to key on the whole `spec`, firing an async preload +
  // an extra render per tick — the main cause of the slider feeling laggy).
  // SELF-CONTAINED packs: register a spec's inline `packs` (custom shaders/transitions
  // a project carries) BEFORE the keys/preloads below — they call getEffect, which must
  // see the pack. Runs in render order (above assetKey); registerPack is idempotent.
  useMemo(() => { registerSpecPacks(spec); return (spec.packs ?? []).map((p) => p.id).join(','); }, [spec]);

  // Media source keys + BYO shader texture-input URLs — so applying/swapping a
  // `texture`-param effect re-triggers the preload (loadEffectTextures) + rebind.
  const assetKey = useMemo(() => [...collectMediaKeys(spec), ...collectEffectTextureUrls(spec)].join('\n'), [spec]);

  // The set of custom (family, file) fonts — keyed so we only (re)load fonts when
  // a new face appears, not on every transform edit.
  const fontKey = useMemo(() => collectFontFaces(spec).map((f) => `${f.family}|${f.file}`).join('\n'), [spec]);

  // Coalesce renders to ONE per animation frame: a burst of store commits (e.g.
  // dragging a slider, which fires many onChange/commits) collapses into a single
  // draw with the latest spec — bounding Pixi work to the display refresh rate
  // instead of doing a full scene rebuild per input event.
  const rafRef = useRef(0);
  const requestRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const PIXI = pixiRef.current;
      const app = appRef.current;
      if (PIXI && app) renderScene(PIXI, app, specRef.current, playheadRef.current, cacheRef.current, true, false, requestRender);
    });
  }, []);

  // Init the Pixi application (re-init only if the output size changes).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const PIXI = await import('pixi.js');
      if (cancelled) return;
      const app = await createApp(PIXI, {
        width: W,
        height: H,
        background: spec.output.background ?? '#000000',
        antialias,
      });
      if (cancelled) {
        destroyApp(app);
        return;
      }
      const canvas = app.canvas;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      containerRef.current?.appendChild(canvas);
      appRef.current = app;
      pixiRef.current = PIXI;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (appRef.current) destroyApp(appRef.current); // frees off-stage transition RTs, then destroys
      appRef.current = null;
      pixiRef.current = null;
      setReady(false);
      clearElementLayouts(); // don't leak this preview's boxes into the next mount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, antialias]);

  // Preload assets only when the set of media URLs changes (not on every
  // transform tweak). The resolved bump triggers exactly one re-render.
  useEffect(() => {
    const PIXI = pixiRef.current;
    if (!PIXI || !ready) return;
    let cancelled = false;
    setLoading(true);
    void preloadAssets(PIXI, specRef.current, cacheRef.current).then(() => {
      if (cancelled) return;
      // Drop textures for sources the spec no longer references (background/B-roll
      // swaps) so GPU memory doesn't grow unbounded over a long edit session.
      evictUnused(cacheRef.current, specRef.current);
      setAssetVersion((v) => v + 1);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [assetKey, ready]);

  // Load custom fonts when the font set changes; once a face arrives, bump the
  // asset version so text (drawn in a fallback face) re-rasterizes correctly.
  useEffect(() => {
    if (!ready) return;
    const PIXI = pixiRef.current;
    if (!PIXI) return;
    let cancelled = false;
    // Fonts + pack-effect resources (LUT `.cube`s, URL-sourced shaders) — once any
    // arrive, bump the asset version so the affected elements re-render.
    void Promise.all([loadFonts(specRef.current), loadLuts(PIXI, specRef.current), loadShaders(specRef.current), loadEffectTextures(PIXI, specRef.current)]).then(() => {
      if (!cancelled) setAssetVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [fontKey, ready, assetKey]);

  // Request a (coalesced) frame on playhead / spec / asset changes.
  useEffect(() => {
    if (!ready) return;
    requestRender();
  }, [spec, playheadSec, ready, assetVersion, requestRender]);

  // Cancel any pending frame + release ALL cached GPU textures on unmount (the
  // MediaCache is the sole owner of image/video/GIF-frame textures). Deps `[]` so
  // this runs ONLY on true unmount, not on the app re-init (W/H/antialias) — those
  // keep the cache warm.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      disposeMediaCache(cache);
    };
  }, []);

  // Playback clock — advance the playhead while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = playheadRef.current + dt;
      if (next >= durationRef.current) {
        actions.setPlayhead(durationRef.current);
        actions.pause();
        return;
      }
      actions.setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, actions]);

  return (
    <div
      {...props}
      ref={containerRef}
      className={className}
      data-vixel-pixi-preview=""
      style={{
        position: 'relative',
        aspectRatio: `${W} / ${H}`,
        overflow: 'hidden',
        background: '#000',
        ...style,
      }}
    >
      {(loading || !ready) && (
        <div
          data-vixel-preview-loading=""
          aria-busy="true"
          aria-label="Loading preview assets"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            color: '#fff',
            font: '500 12px/1 system-ui, sans-serif',
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              border: '2px solid rgba(255,255,255,0.25)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'vixel-spin 0.7s linear infinite',
            }}
          />
          Loading assets…
          <style>{'@keyframes vixel-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
    </div>
  );
}
