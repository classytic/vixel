/**
 * Clip mask — crop a visual clip to a shape (the CapCut/Premiere "mask" tool:
 * rectangle / ellipse PiP masks). Distinct from {@link BoxStyle.radius} (which
 * only rounds the clip's own box): a mask is an independent, optionally ANIMATED
 * region, with a soft `feather` edge and `invert` (keep outside).
 *
 * Geometry reuses the {@link Keyframe} channel primitive — the SAME sampler as
 * transform/audio — so an animated mask costs no new math (a mask that travels
 * across the frame is just keyframed x/y). The renderer turns {@link ResolvedMask}
 * into a Pixi `Graphics`/alpha mask; ffmpeg approximates on export.
 *
 * Lean on purpose: `rect` + `ellipse` cover the common PiP masks; `path` adds
 * freeform polygon masks (the rotoscope/clone case) — a closed polygon the Pixi
 * renderer draws via `Graphics.poly`, no Bézier-handle UI required for v1.
 */
import type { Rect } from './transform.js';
import type { Keyframe } from './keyframes.js';
import { sampleChannel } from './keyframes.js';

export type MaskShape = 'rect' | 'ellipse' | 'path';

/** A point in normalized canvas coords (0..1), for a `path` mask polygon. */
export interface MaskPoint {
  x: number;
  y: number;
}

/** Per-channel keyframes for an animated mask (mirrors {@link TransformKeyframes}). */
export interface MaskKeyframes {
  x?: Keyframe[];
  y?: Keyframe[];
  w?: Keyframe[];
  h?: Keyframe[];
  /** Soft-edge width over time. */
  feather?: Keyframe[];
}

/** A clip's mask — the agent/editor emits this; `normalizeSpec` leaves it as-is. */
export interface ClipMask {
  /** Default `rect`. */
  shape?: MaskShape;
  /** Mask region as a normalized canvas {@link Rect} (0..1), like `transform.frame`.
   *  For `path`, this is the polygon's bounding box (informational); `points` is the shape. */
  frame: Rect;
  /** Closed polygon in normalized canvas coords — REQUIRED for `shape: 'path'`. */
  points?: MaskPoint[];
  /** Soft edge as a FRACTION (0..1) of the mask's shorter side. Default 0 (hard). */
  feather?: number;
  /** Keep what's OUTSIDE the shape instead of inside. Default false. */
  invert?: boolean;
  /** Animate the mask region / feather (rect/ellipse). Sampled by {@link resolveMaskAt}. */
  keyframes?: MaskKeyframes;
}

/** A mask resolved at one instant — exactly what a renderer needs (no time, no keyframes). */
export interface ResolvedMask {
  shape: MaskShape;
  frame: Rect;
  /** Present for `shape: 'path'` — the polygon to draw. */
  points?: MaskPoint[];
  feather: number;
  invert: boolean;
}

/**
 * Resolve a {@link ClipMask} at `t` seconds (element-relative): sample any animated
 * channel, else fall back to the static `frame`/`feather`. Pure + deterministic, so
 * the preview and the offline export mask identically.
 */
export function resolveMaskAt(mask: ClipMask, t: number): ResolvedMask {
  const kf = mask.keyframes;
  const x = kf && sampleChannel(kf.x, t);
  const y = kf && sampleChannel(kf.y, t);
  const w = kf && sampleChannel(kf.w, t);
  const h = kf && sampleChannel(kf.h, t);
  const feather = kf && sampleChannel(kf.feather, t);
  return {
    shape: mask.shape ?? 'rect',
    frame: {
      x: x != null ? x : mask.frame.x,
      y: y != null ? y : mask.frame.y,
      w: w != null ? w : mask.frame.w,
      h: h != null ? h : mask.frame.h,
    },
    ...(mask.points ? { points: mask.points } : {}),
    feather: Math.max(0, feather != null ? feather : (mask.feather ?? 0)),
    invert: mask.invert ?? false,
  };
}
