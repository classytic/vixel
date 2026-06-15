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

import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type * as PIXINS from 'pixi.js';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';
import { preloadAssets, renderScene, type MediaCache } from '../renderer/scene.js';

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

  const spec = useEditorState((s) => s.spec);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const isPlaying = useEditorState((s) => s.isPlaying);
  const durationSec = useEditorState((s) => s.durationSec);
  const actions = useEditorActions();

  const W = spec.output.width;
  const H = spec.output.height;

  // Live refs for the rAF clock (avoids re-subscribing the loop each frame).
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;

  // Init the Pixi application (re-init only if the output size changes).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const PIXI = await import('pixi.js');
      if (cancelled) return;
      const app = new PIXI.Application();
      await app.init({
        width: W,
        height: H,
        background: spec.output.background ?? '#000000',
        antialias,
        autoStart: false,
        resolution: 1,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
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
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
      pixiRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, antialias]);

  // Preload assets whenever the spec changes.
  useEffect(() => {
    const PIXI = pixiRef.current;
    if (!PIXI || !ready) return;
    let cancelled = false;
    void preloadAssets(PIXI, spec, cacheRef.current).then(() => {
      if (!cancelled) setAssetVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, ready]);

  // Render the current frame on playhead / spec / asset changes.
  useEffect(() => {
    const PIXI = pixiRef.current;
    const app = appRef.current;
    if (!PIXI || !app || !ready) return;
    renderScene(PIXI, app, spec, playheadSec, cacheRef.current);
  }, [spec, playheadSec, ready, assetVersion]);

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
    />
  );
}
