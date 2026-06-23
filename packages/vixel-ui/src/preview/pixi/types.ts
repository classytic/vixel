/**
 * Shared types for the Pixi preview renderer. Kept in one place so the renderer
 * modules (scene · media · fonts · captions · effects) agree on the same shapes
 * without importing each other just for a type.
 */
import type * as PIXINS from 'pixi.js';

/** The dynamically-imported `pixi.js` runtime, passed into the renderer functions. */
export type Pixi = typeof import('pixi.js');

/** A preloaded media source: an image/video/animated-GIF texture set, or a load failure. */
export type MediaAsset =
  | { kind: 'image'; texture: PIXINS.Texture }
  | { kind: 'video'; el: HTMLVideoElement; texture: PIXINS.Texture; lastTime?: number; seekPending?: boolean }
  | { kind: 'gif'; textures: PIXINS.Texture[]; frameEndsMs: number[]; totalMs: number; width: number; height: number }
  | { kind: 'failed' };

/** url#instanceKey → asset. Keyed per render-instance (see `mediaCacheKey`). */
export type MediaCache = Map<string, MediaAsset>;

/**
 * An element's RENDERED box in normalized canvas coords (0..1) + rotation degrees,
 * keyed like the selection (`clip:<track>` / `ov:<track>:<idx>`). The preview
 * publishes these from the actual Pixi render so a DOM overlay (the transform
 * gizmo) can frame elements EXACTLY — instead of re-measuring text and drifting.
 */
export interface ElementLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

/**
 * A persistent, keyed display object reused across frames. The renderer mutates
 * cheap props each frame (position/scale/alpha/texture) and rebuilds expensive
 * sub-resources (text raster, filters, vector geometry, caption word glyphs) only
 * when their signature changes — see the retained-scene note in `scene.ts`.
 */
export interface RetainedNode {
  kind: 'sprite' | 'text' | 'shape';
  container: PIXINS.Container;
  content: PIXINS.Sprite | PIXINS.Text | PIXINS.Graphics;
  mask?: PIXINS.Graphics;
  /** The user's CLIP mask (rect/ellipse/path) — masks `container` (a separate slot
   *  from the cover-fit `mask` which masks `content`), so the two never clash. */
  clipMask?: PIXINS.Graphics;
  clipMaskSig?: string;
  box?: PIXINS.Graphics;
  /** Rounded-corner clip mask for `transform.style.radius` (BoxStyle). */
  styleMask?: PIXINS.Graphics;
  /** Border stroke overlay for `transform.style.border` (BoxStyle). */
  border?: PIXINS.Graphics;
  /** Soft drop-shadow stand-in behind the box when pixi-filters is absent (BoxStyle). */
  styleShadow?: PIXINS.Graphics;
  /** Per-node effect filters (updateFilters owns their lifetime; LUT filters are
   *  cache-shared and excluded from destroy). Composed into `content.filters`. */
  effectFilters?: PIXINS.Filter[];
  /** BoxStyle drop-shadow FILTER (pixi-filters path); boxstyle owns its lifetime.
   *  Separate from `effectFilters` so the two owners never clobber each other. */
  shadowFilter?: PIXINS.Filter;
  textSig?: string;
  boxSig?: string;
  /** Signature of the applied BoxStyle (radius/border/shadow + box geometry). */
  styleSig?: string;
  /** Signature of the effect PROGRAMS (recompile trigger; excludes live shader params). */
  effectsSig?: string;
  /** Signature of live shader param VALUES (number/color/boolean) — updates uniforms, no recompile. */
  liveSig?: string;
  shapeSig?: string;
  maskSig?: string;
  /** Per-word caption Text objects (karaoke/highlight) — laid out under `wordRow`. */
  words?: PIXINS.Text[];
  /** Sub-container holding the word row, so it can be centered/rotated as a unit. */
  wordRow?: PIXINS.Container;
  /** Highlight box behind the active word (`highlight-box` animation). */
  wordBox?: PIXINS.Graphics;
  /** Signature of the word layout (cue text + style) — rebuild glyphs only on change. */
  wordsSig?: string;
  /** BACK fill layers (3D offset / stacked design fills) drawn behind `content`. */
  layers?: PIXINS.Text[];
  /** Signature of the back-layer set (text + design) — rebuild only on change. */
  layersSig?: string;
  /** Per-token kinetic typography: the SplitText whose word/char/line tokens are
   *  animated each frame via `textTokenSampleAt` (the `TextMedia.motion` path). */
  split?: PIXINS.SplitText;
  /** Back fill-layer SplitTexts (3D extrude under motion) — one per back fill, each
   *  staggered with the SAME per-token delta as `split`, offset behind it. */
  splitLayers?: PIXINS.SplitText[];
  /** Captured base (un-animated) layout position of each token, by index. */
  splitBase?: { x: number; y: number }[];
  /** Block size at split time (stable pivot + gizmo box, ignoring per-frame offsets). */
  splitW?: number;
  splitH?: number;
  /** Signature of the split (text + style + split unit) — re-split only on change. */
  splitSig?: string;
}

/**
 * GPU resources for a clip-to-clip gl-transition: the two RenderTextures the
 * outgoing/incoming clips are captured into, plus the cached two-texture filter.
 * Reused across the transition's frames; the filter rebuilds when its signature
 * changes (and, in baked/export mode, every frame as `progress` is inlined).
 */
export interface TransitionGfx {
  rtFrom: PIXINS.RenderTexture;
  rtTo: PIXINS.RenderTexture;
  w: number;
  h: number;
  filter?: PIXINS.Filter;
  sig?: string;
}

/** Per-Application retained scene: the background + the keyed node map. */
export interface RetainedScene {
  bg: PIXINS.Graphics;
  bgSig: string;
  nodes: Map<string, RetainedNode>;
  /** Signature of the active adjustment-effect set, to rebuild stage filters only on change. */
  fxSig: string;
  /** Lazily-allocated GPU resources for gl-transition rendering (see {@link TransitionGfx}). */
  transition?: TransitionGfx;
  /**
   * Host-supplied "draw another frame" callback (PixiPreview's coalesced
   * `requestRender`). A paused/stationary preview renders ONCE, so a clip whose
   * source decodes asynchronously (a seeked video frame) needs this to re-upload +
   * redraw when the frame is ready — otherwise it shows the blank pre-seek frame.
   */
  requestRender?: () => void;
}
