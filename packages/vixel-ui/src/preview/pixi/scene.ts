/**
 * PixiJS scene renderer — draws a {@link VixelSpec} at a given time to a Pixi
 * stage. This is the browser-side compositor for the editor preview: it renders
 * the ACTUAL composition (background · visual lanes of image/video/text/shape
 * clips with fit + ken-burns + enter/exit + BoxStyle frame), so preview ≈ export.
 *
 * UNIFIED MODEL: a timeline is `spec.tracks` of type-agnostic {@link VisualTrack}s
 * (`clips: VisualClip[]`) + {@link AudioTrack}s. A clip carries its own media kind
 * (`clip.media.kind` — image / video / text / shape / effect), is absolutely timed
 * (`at` + `duration`), and stacks PURELY by position: lanes composite in `tracks`
 * order (later = on top), and clips within a lane composite in array order. There
 * is no `z`/`defaultZ` — see {@link renderScene}'s positional z assignment.
 *
 * This module is the RECONCILER: it dispatches each clip to its media-kind
 * reconciler in `clips/*`, owns the per-Application retained scene (`SCENES`), and
 * composites the result. The clip reconcilers, the filter/transition builders, and
 * the shared retained-node helpers live in their own modules (see the `pixi/` tree).
 */
import type * as PIXINS from 'pixi.js';
import type { VixelSpec, VisualClip, EffectRef } from '@classytic/vixel-schema';
import { applyEasing, getTransitionOverlay } from '@classytic/vixel-schema';
import { isVisualTrack, layoutLane } from '../../shared/utils/spec.js';
import { clipWindowAt, isIncomingFromPrev } from './calc.js';
import type { Pixi, ElementLayout, RetainedScene, MediaCache } from './types.js';
import { ensureNode, disposeNodeFilters, disposeFilters } from './node.js';
import { publishLayouts } from './layouts.js';
import { buildPixiFilters, effectsSig } from './filters/registry.js';
import { setBakeTime, tickShaderTime } from './filters/shader.js';
import { renderGlTransition, transitionSourceFor } from './filters/transition.js';
import { overlayTextureFromCache } from './media/cache.js';
import { reconcileMediaClip } from './clips/media.js';
import { reconcileTextClip } from './clips/text.js';
import { reconcileShapeClip } from './clips/shape.js';

// ── Public re-exports ─────────────────────────────────────────────────────────
// The renderer is split across cohesive modules; the public barrel (`pixi/index.ts`)
// re-exports the surface external code imports. These re-exports keep the names the
// reconciler co-owns reachable from one place.
export type { Pixi, MediaAsset, MediaCache, ElementLayout, RetainedNode, RetainedScene } from './types.js';
export { getElementLayouts, subscribeElementLayouts, clearElementLayouts } from './layouts.js';
export { sourceUrl, collectSourceUrls, mediaCacheKey, collectMediaKeys, preloadAssets, awaitVideoSeeks, disposeMediaCache, evictUnused, collectOverlayUrls, overlayTextureFromCache } from './media/cache.js';
export { collectFontFaces, loadFonts } from './media/fonts.js';
export { loadLuts } from './filters/lut.js';
export { loadShaders, trackAnimatedFilter } from './filters/shader.js';
export { PIXI_EFFECT_IDS, registerPixiEffect } from './filters/registry.js';

// ── Retained scene: reuse display objects across frames ──────────────────────
// renderScene keeps ONE persistent, keyed node per element and only MUTATES cheap
// props each frame (position/scale/rotation/alpha/texture), rebuilding expensive
// sub-resources (text rasterization, filters, vector geometry) solely when their
// inputs change. Each node sits in a thin wrapper container whose `zIndex` drives
// compositing order; element geometry stays in absolute canvas coords.

/** Per-Application retained state. Weak so it's GC'd when the app is destroyed. */
const SCENES: WeakMap<PIXINS.Application, RetainedScene> = new WeakMap();

function getScene(PIXI: Pixi, app: PIXINS.Application): RetainedScene {
  let scene = SCENES.get(app);
  if (!scene) {
    app.stage.sortableChildren = true; // compositing order via zIndex
    const bg = new PIXI.Graphics();
    bg.zIndex = -1;
    app.stage.addChild(bg);
    scene = { bg, bgSig: '', nodes: new Map(), fxSig: '' };
    SCENES.set(app, scene);
  }
  return scene;
}

/**
 * Release a scene's GPU resources that aren't owned by the stage graph — the
 * gl-transition RenderTextures + filter. Call on host teardown BEFORE
 * `app.destroy()`. Idempotent.
 */
export function disposeScene(app: PIXINS.Application): void {
  const scene = SCENES.get(app);
  if (!scene) return;
  // Free every retained node's filters (Pixi's app.destroy frees containers/textures
  // but NOT assigned filters → GL-program leak across re-inits).
  for (const node of scene.nodes.values()) disposeNodeFilters(node);
  if (scene.transition) {
    scene.transition.rtFrom.destroy(true);
    scene.transition.rtTo.destroy(true);
    scene.transition.filter?.destroy();
    scene.transition = undefined;
  }
}

/** Dispatch a clip to its media-kind reconciler. Returns the rendered box (or null). */
function reconcileClip(
  PIXI: Pixi,
  scene: RetainedScene,
  stage: PIXINS.Container,
  key: string,
  z: number,
  clip: VisualClip,
  W: number,
  H: number,
  localT: number,
  dur: number,
  cache: MediaCache,
  alphaMul = 1,
): ElementLayout | null {
  switch (clip.media.kind) {
    case 'image':
    case 'video':
      return reconcileMediaClip(PIXI, scene, stage, key, z, clip, W, H, localT, dur, cache, alphaMul);
    case 'text':
      return reconcileTextClip(PIXI, scene, stage, key, z, clip, W, H, localT, dur);
    case 'shape':
      return reconcileShapeClip(PIXI, scene, stage, key, z, clip, W, H, localT, dur);
    case 'effect':
      return null; // adjustment layer — filters the composite in renderScene, not a node
  }
}

/**
 * Render the whole spec at `timeSec` onto the app's stage, then present. Pass
 * `publishLayout` (the live editor preview does) to broadcast each rendered
 * element's exact box for the transform gizmo; the headless export omits it.
 */
export function renderScene(
  PIXI: Pixi,
  app: PIXINS.Application,
  spec: VixelSpec,
  timeSec: number,
  cache: MediaCache,
  publishLayout = false,
  /**
   * Bake time-varying scalars (`progress`) as GLSL literals instead of uniforms —
   * set by the export paths so the shader carries no uniform interface block (a
   * GPU-less server rejects it). Live preview leaves it false.
   */
  bakeDynamic = false,
  /**
   * Host "draw another frame" hook (PixiPreview's coalesced requestRender). Stored
   * on the scene so a clip reconciler can ask for a redraw once an async source
   * frame (a seeked video) decodes — see {@link RetainedScene.requestRender}.
   */
  requestRender?: () => void,
): void {
  const W = spec.output.width;
  const H = spec.output.height;
  const stage = app.stage;
  const scene = getScene(PIXI, app);
  scene.requestRender = requestRender;
  const layouts = publishLayout ? new Map<string, ElementLayout>() : null;

  // Background — repaint only when its size/color changes.
  const bgSig = `${W}x${H}|${spec.output.background ?? '#000000'}`;
  if (scene.bgSig !== bgSig) {
    scene.bg.clear().rect(0, 0, W, H).fill(spec.output.background ?? '#000000');
    scene.bgSig = bgSig;
  }

  setBakeTime(bakeDynamic ? timeSec : null);
  tickShaderTime(timeSec);

  // Track which keyed nodes are live this frame; the rest get pruned at the end.
  const seen = new Set<string>();

  // STACKING (replaces defaultZ): lanes composite in `tracks` array order (index 0
  // = bottom, last = top); within a lane, clips composite in array order. We assign
  // a monotonically increasing z per (trackIndex, clipIndex) so a later element is
  // ALWAYS on top — purely positional, no z-by-media-kind. `zCursor` walks the flat
  // (track,clip) sequence; the transition incoming clip / blend sprite slot just
  // above their outgoing clip but below the next element.
  let zCursor = 1;
  // Adjustment-effect clips active this frame → their filters apply to the stage.
  const activeFx: EffectRef[] = [];

  for (let ti = 0; ti < spec.tracks.length; ti++) {
    const track = spec.tracks[ti];
    if (!track || !isVisualTrack(track)) continue;
    const layout = layoutLane(track);

    for (let pos = 0; pos < layout.length; pos++) {
      const l = layout[pos];
      const clip = l.clip;
      const z = zCursor;
      zCursor += 1;
      if (clip.hidden) continue;

      // If the PREVIOUS clip is mid-transition INTO this one, this clip is already
      // drawn as that transition's incoming (`:in`) pass — skip its own normal
      // render so it doesn't ALSO composite at full opacity (the double-image /
      // "two scenes overlapping" during a crossfade).
      if (isIncomingFromPrev(layout[pos - 1], timeSec)) continue;

      // An effect clip is an adjustment layer over the whole composite during its
      // window — collected here, applied as stage filters below (CapCut effect lane).
      if (clip.media.kind === 'effect') {
        if (timeSec >= l.startSec && timeSec < l.endSec) activeFx.push(clip.media.effect);
        continue;
      }

      // Active + transition window for this clip (pure, tested in calc.ts).
      const win = clipWindowAt(l.startSec, l.endSec, l.transitionSec, timeSec);
      if (!win.onScreen && !win.inTransition) continue;

      const key = `vis:${ti}:${l.index}`;
      const box = reconcileClip(PIXI, scene, stage, key, z, clip, W, H, timeSec - l.startSec, l.durationSec, cache);
      const node = scene.nodes.get(key);
      if (node) {
        node.container.visible = true; // a prior gl-transition frame may have hidden it
        seen.add(key);
        if (layouts && box) layouts.set(key, box);
      }

      // gl-transition / crossfade into the NEXT clip in this lane.
      if (win.inTransition && node) {
        const next = track.clips[l.index + 1];
        if (next && !next.hidden) {
          const ref = l.transitionRef;
          // Ease the linear window progress by the ref's chosen curve (shared schema
          // easing → same feel in preview + export). Undefined/linear is the identity,
          // so an un-eased transition keeps its native progress.
          const p = applyEasing(ref?.easing, win.progress);
          const inKey = `vis:${ti}:${l.index + 1}:in`;
          const nextLocalT = timeSec - next.at;
          const source = ref ? transitionSourceFor(ref) : undefined;
          if (source) {
            // Real gl-transition: capture BOTH clips (incoming at full opacity) and
            // blend with the schema's two-texture fragment. ONE renderer for preview,
            // in-browser export, and the headless server.
            reconcileClip(PIXI, scene, stage, inKey, z + 0.5, next, W, H, nextLocalT, next.duration, cache);
            const inNode = scene.nodes.get(inKey);
            const transKey = `vis:${ti}:${l.index}:trans`;
            const transNode = ensureNode(PIXI, scene, stage, transKey, 'sprite');
            transNode.container.zIndex = z + 0.75;
            if (inNode) {
              // Premium overlay-texture transitions (light-leak/film-burn) sample a
              // preloaded texture; bind it when this transition declares one.
              const ovUrl = getTransitionOverlay(ref!.id);
              const ovTex = ovUrl ? overlayTextureFromCache(cache, ovUrl) : undefined;
              renderGlTransition(PIXI, app, scene, node, inNode, transNode, source, ref!.params, p, W, H, bakeDynamic, ovTex, ref!.shake ?? 0);
              seen.add(inKey);
              seen.add(transKey);
            }
          } else {
            // Honest crossfade stand-in (the engine renders the precise xfade on the
            // fast tier for these).
            reconcileClip(PIXI, scene, stage, inKey, z + 0.5, next, W, H, nextLocalT, next.duration, cache, p);
            if (scene.nodes.has(inKey)) seen.add(inKey);
          }
        }
      }
    }
  }

  // Adjustment-effect layers: filter the WHOLE composite during their window
  // (CapCut effect track). Rebuilt only when the active set changes.
  const fxSig = effectsSig(activeFx);
  if (scene.fxSig !== fxSig) {
    disposeFilters(stage.filters as PIXINS.Filter[] | null); // free the outgoing adjustment filters
    const next = activeFx.length ? buildPixiFilters(PIXI, activeFx) ?? [] : [];
    stage.filters = next;
    // Fixed full-canvas bounds → skip Pixi's per-frame filter-bounds walk.
    if (next.length) stage.filterArea = new PIXI.Rectangle(0, 0, W, H);
    scene.fxSig = fxSig;
  }

  // Prune nodes that aren't part of this frame (off-screen / hidden / deleted).
  for (const [key, node] of scene.nodes) {
    if (!seen.has(key)) {
      disposeNodeFilters(node); // container.destroy doesn't free filters (GL-program leak)
      node.container.destroy({ children: true });
      scene.nodes.delete(key);
    }
  }

  if (layouts) publishLayouts(layouts);
  app.render();
}
