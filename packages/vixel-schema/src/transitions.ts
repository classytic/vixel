/**
 * Transitions — a first-class, registry-backed primitive (mirrors ./effects).
 * ==========================================================================
 * A transition is a thing that sits BETWEEN two scenes, chosen from a registry —
 * not a property of a clip. Descriptors are pure DATA an agent introspects; the
 * engine owns the resolver keyed by `id` (ffmpeg `xfade` now, a GL/shader path
 * later — the same shader can feed BE render and FE preview for true parity).
 * A spec emits a {@link TransitionRef}; placement lives in
 * `VideoTrack.transitions[]` (see ./track, {@link SequenceTransition}).
 */
import type { Easing } from './animation.js';
import type { EffectParam } from './effects/contract.js';

/** Coarse grouping for the transitions browser. */
export type TransitionFamily =
  | 'fade'
  | 'wipe'
  | 'slide'
  | 'zoom'
  | 'shape'
  | '3d'
  | 'blur'
  | 'glitch'
  | 'move';

/**
 * A registrable transition's CONTRACT — pure data. `ffmpeg.xfade` is the native
 * fast tier; `gl.shader` (gl-transitions) powers richer 3D/move trends; `preview`
 * hints let the editor mirror it. The engine resolves by `id`.
 */
export interface TransitionDescriptor {
  id: string;
  name: string;
  family: TransitionFamily;
  /**
   * One-line, agent-facing semantics: the FEEL + when to use it (e.g. "fast
   * directional whip for high-energy montage cuts"). Drives {@link describeCatalog}
   * so an LLM picks by meaning, not by guessing from the id. Additive, pure data.
   */
  description?: string;
  params?: EffectParam[];
  /** Native ffmpeg `xfade` transition name (the fast tier / fallback). */
  ffmpeg?: { xfade?: string };
  /** GL-transition shader id for richer/3D transitions (engine + preview share it). */
  gl?: { shader: string };
  /**
   * An OVERLAY texture (light-leak / film-burn / particle footage) composited over
   * the blend — the premium "leak transition" look. `source` is an image/video URL
   * (relative to a pack's `baseUrl`); the GL source samples it via `getOverlayColor`.
   * GL-tier only (preview + Pixi export); the ffmpeg fast tier uses the `xfade` fallback.
   */
  overlay?: { source: string; blend?: 'screen' | 'add' | 'normal' };
  /**
   * A SOUND effect (whoosh / swish / impact) mixed at the seam — the audio half of
   * a premium transition. `source` is an audio URL (relative to a pack's `baseUrl`);
   * `gain` in dB (default 0). The renderer mixes it at the cut so it lands on the hit.
   */
  sound?: { source: string; gain?: number };
  /** Editor preview hints so Pixi can approximate the transition in-canvas. */
  preview?: { css?: string; webgl?: string };
  /** Suggested default overlap (seconds). */
  defaultDuration?: number;
}

/** What a spec (and an agent) emits: a transition by id + overlap + tuning. */
export interface TransitionRef {
  id: string;
  /** Overlap duration in seconds (shortens total length). */
  duration: number;
  params?: Record<string, number | string | boolean>;
  easing?: Easing;
  direction?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
  /** Camera-shake intensity (fraction of frame, ~0.004–0.02; 0/undefined = none). */
  shake?: number;
}

/**
 * Built-in transition catalog — the vocabulary an agent picks from. Ids are the
 * source of truth (supersede the legacy {@link TransitionType} union, whose
 * values are kept here 1:1 for back-compat). Each has an ffmpeg `xfade` fallback;
 * richer entries also carry a `gl.shader` the engine can use when GL is available.
 */
export const BUILTIN_TRANSITIONS: TransitionDescriptor[] = [
  { id: 'fade', name: 'Fade', family: 'fade', ffmpeg: { xfade: 'fade' }, defaultDuration: 0.5 },
  { id: 'dissolve', name: 'Dissolve', family: 'fade', ffmpeg: { xfade: 'dissolve' }, defaultDuration: 0.5 },
  { id: 'fadeblack', name: 'Fade to Black', family: 'fade', ffmpeg: { xfade: 'fadeblack' }, defaultDuration: 0.5 },
  { id: 'wipeleft', name: 'Wipe Left', family: 'wipe', ffmpeg: { xfade: 'wipeleft' }, defaultDuration: 0.5 },
  { id: 'wiperight', name: 'Wipe Right', family: 'wipe', ffmpeg: { xfade: 'wiperight' }, defaultDuration: 0.5 },
  { id: 'wipeup', name: 'Wipe Up', family: 'wipe', ffmpeg: { xfade: 'wipeup' }, defaultDuration: 0.5 },
  { id: 'wipedown', name: 'Wipe Down', family: 'wipe', ffmpeg: { xfade: 'wipedown' }, defaultDuration: 0.5 },
  { id: 'slideleft', name: 'Slide Left', family: 'slide', ffmpeg: { xfade: 'slideleft' }, defaultDuration: 0.5 },
  { id: 'slideright', name: 'Slide Right', family: 'slide', ffmpeg: { xfade: 'slideright' }, defaultDuration: 0.5 },
  { id: 'slideup', name: 'Slide Up', family: 'slide', ffmpeg: { xfade: 'slideup' }, defaultDuration: 0.5 },
  { id: 'slidedown', name: 'Slide Down', family: 'slide', ffmpeg: { xfade: 'slidedown' }, defaultDuration: 0.5 },
  { id: 'zoomin', name: 'Zoom In', family: 'zoom', ffmpeg: { xfade: 'zoomin' }, defaultDuration: 0.5 },
  { id: 'squeeze', name: 'Squeeze', family: 'zoom', ffmpeg: { xfade: 'squeezeh' }, defaultDuration: 0.5 },
  { id: 'radial', name: 'Radial', family: 'shape', ffmpeg: { xfade: 'radial' }, defaultDuration: 0.6 },
  { id: 'iris', name: 'Iris', family: 'shape', ffmpeg: { xfade: 'circleopen' }, defaultDuration: 0.6 },
  { id: 'ripple', name: 'Ripple', family: 'shape', ffmpeg: { xfade: 'distance' }, gl: { shader: 'ripple' }, defaultDuration: 0.6 },
  // Trending / richer — ffmpeg fallback now, GL shader for the real effect later.
  { id: 'whip-pan', name: 'Whip Pan', family: 'move', ffmpeg: { xfade: 'smoothleft' }, gl: { shader: 'directionalwarp' }, defaultDuration: 0.35 },
  { id: 'zoom-blur', name: 'Zoom Blur', family: 'zoom', ffmpeg: { xfade: 'zoomin' }, gl: { shader: 'CrossZoom' }, defaultDuration: 0.4 },
  { id: 'blur', name: 'Blur', family: 'blur', ffmpeg: { xfade: 'hblur' }, gl: { shader: 'crosswarp' }, defaultDuration: 0.5 },
  { id: 'glitch', name: 'Glitch', family: 'glitch', ffmpeg: { xfade: 'pixelize' }, gl: { shader: 'GlitchMemories' }, defaultDuration: 0.4 },
  { id: 'cube', name: 'Cube', family: '3d', ffmpeg: { xfade: 'slideleft' }, gl: { shader: 'cube' }, defaultDuration: 0.6 },
  { id: 'flip3d', name: '3D Flip', family: '3d', ffmpeg: { xfade: 'slideleft' }, gl: { shader: 'doorway' }, defaultDuration: 0.6 },
  // ── Premium (motion-blurred / multi-layer) — render on the GL/Pixi tier ───────
  { id: 'zoom-punch', name: 'Zoom Punch', family: 'zoom', ffmpeg: { xfade: 'zoomin' }, gl: { shader: 'zoom-punch' }, defaultDuration: 0.4 },
  { id: 'rgb-glitch', name: 'RGB Glitch', family: 'glitch', ffmpeg: { xfade: 'pixelize' }, gl: { shader: 'rgb-glitch' }, defaultDuration: 0.35 },
  { id: 'light-leak', name: 'Light Leak', family: 'fade', ffmpeg: { xfade: 'fadewhite' }, gl: { shader: 'light-leak' }, defaultDuration: 0.5 },
];

// ── legacy (deprecated, kept readable; new code emits TransitionRef ids) ──────

/**
 * @deprecated Superseded by {@link TransitionRef} `id` validated against
 * {@link BUILTIN_TRANSITIONS}. Retained as a string-alias for back-compat.
 */
export type TransitionType =
  | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown'
  | 'slideleft' | 'slideright' | 'slideup' | 'slidedown' | 'zoomin' | 'none'
  | 'whip-pan' | 'zoom-blur' | 'blur' | 'glitch' | 'radial' | 'ripple' | 'squeeze' | 'iris';

/**
 * @deprecated Superseded by {@link SequenceTransition} in `VideoTrack.transitions[]`.
 * `normalizeSpec` lifts a clip's `transition` into the per-track list.
 */
export interface Transition {
  type: TransitionType;
  /** Overlap duration in seconds (shortens total length). */
  duration: number;
  easing?: Easing;
}
