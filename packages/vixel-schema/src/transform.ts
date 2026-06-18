/**
 * VisualTransform — the ONE spatial model for every visual element.
 * ================================================================
 * Clips, text, images, and videos all position/size/rotate through a single
 * {@link VisualTransform}: a normalized `frame` rect (+ rotation/fit/opacity and
 * optional per-channel keyframes). Canvas drag/resize handles AND numeric
 * X/Y/W/H fields both write `frame`, so there is exactly one representation of
 * "where + how big" — no per-type branching. Modeled on OpenShot's single clip
 * transform and kdenlive's qtblend rect.
 *
 * Legacy spatial fields (`OverlayBase.position/scale/box`, `width/height`,
 * `motion`) are superseded by this and folded in by `normalizeSpec`; they remain
 * readable for back-compat. See ARCHITECTURE.md.
 */
import type { Keyframe } from './keyframes.js';
import { sampleChannel } from './keyframes.js';

/** A 9-point anchor (a convenience the editor/normalizer resolves to a `frame`). */
export type Anchor =
  | 'top' | 'top-left' | 'top-right'
  | 'center' | 'center-left' | 'center-right'
  | 'bottom' | 'bottom-left' | 'bottom-right';

/** How media fills its frame. */
export type Fit = 'contain' | 'cover' | 'stretch';

/** A normalized rectangle of the canvas (all 0..1): `{x,y}` top-left + `{w,h}` size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Resolve a normalized {@link Rect} to integer canvas pixels, CLAMPED so the box
 * always lies fully inside `W×H` (min 2px, and `x+w ≤ W`, `y+h ≤ H`). Shared by
 * the engine (pad/scale) and preview so an out-of-range frame can never emit an
 * invalid ffmpeg `pad`. Pure.
 */
export function frameToPx(frame: Rect, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(W, Math.max(2, Math.round(frame.w * W)));
  const h = Math.min(H, Math.max(2, Math.round(frame.h * H)));
  const x = Math.min(Math.max(0, Math.round(frame.x * W)), W - w);
  const y = Math.min(Math.max(0, Math.round(frame.y * H)), H - h);
  return { x, y, w, h };
}

/**
 * Per-channel keyframes for a transform — subsumes the old `PositionKeyframe[]`
 * motion (x/y) and extends it to size/rotation/opacity (OpenShot per-property
 * model on our {@link Keyframe} shape). Times are seconds from the element start.
 */
export interface TransformKeyframes {
  x?: Keyframe[];
  y?: Keyframe[];
  w?: Keyframe[];
  h?: Keyframe[];
  rotation?: Keyframe[];
  opacity?: Keyframe[];
}

/** The single, hand-editable spatial model shared by every visual element. */
export interface VisualTransform {
  /** Box as a normalized canvas {@link Rect}. Absent ⇒ full-frame `{0,0,1,1}`. */
  frame?: Rect;
  /** Clockwise rotation in DEGREES around the frame's center (default 0). */
  rotation?: number;
  /** How the media fills `frame` (default `cover`). */
  fit?: Fit;
  /** 0..1 (default 1). */
  opacity?: number;
  /** Convenience — resolves to a `frame` (preset placement). */
  anchor?: Anchor;
  flipH?: boolean;
  flipV?: boolean;
  /** Animate any channel over time. Subsumes the legacy `motion` path. */
  keyframes?: TransformKeyframes;
  /**
   * Frame styling — rounded corners, border, shadow. Applies to the clip's BOX
   * (any visual media: image / video / text / shape), so a "rounded video" needs
   * no shape wrapper. This is what CapCut/Premiere expose as a clip's
   * corner-radius + border + drop-shadow. See {@link BoxStyle}.
   */
  style?: BoxStyle;
}

/**
 * Resolve a transform's ANIMATED channels at `t` seconds (element-relative) into a
 * concrete transform — the keyframed frame/rotation/opacity, falling back to the
 * static value for any un-keyframed channel. Pure + deterministic, so the preview,
 * the in-browser export, and the headless server export (all sharing the Pixi
 * reconciler) animate identically. No keyframes ⇒ returns the input unchanged.
 */
export function resolveTransformAt(transform: VisualTransform | undefined, t: number): VisualTransform | undefined {
  const kf = transform?.keyframes;
  if (!transform || !kf) return transform;
  const base = transform.frame ?? { x: 0, y: 0, w: 1, h: 1 };
  const x = sampleChannel(kf.x, t);
  const y = sampleChannel(kf.y, t);
  const w = sampleChannel(kf.w, t);
  const h = sampleChannel(kf.h, t);
  const rotation = sampleChannel(kf.rotation, t);
  const opacity = sampleChannel(kf.opacity, t);
  const hasFrameKf = x !== undefined || y !== undefined || w !== undefined || h !== undefined;
  return {
    ...transform,
    ...(hasFrameKf ? { frame: { x: x ?? base.x, y: y ?? base.y, w: w ?? base.w, h: h ?? base.h } } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

/**
 * Box-level styling shared by every visual clip — independent of media kind.
 * Resolution-independent: `radius` is a FRACTION of the frame's shorter side, so
 * it survives any output size. The Pixi preview masks + strokes the frame; the
 * ffmpeg engine approximates (rounded alpha-mask + drawbox border) on export.
 */
export interface BoxStyle {
  /**
   * Corner radius as a FRACTION (0..1) of the frame's shorter side. `0` = square,
   * `0.5`+ ⇒ fully pill/circle. A CapCut "roundness" 0..100% maps to 0..0.5.
   */
  radius?: number;
  /** Border stroke on the frame edge. `width` is a fraction of the shorter side. */
  border?: { width: number; color: string };
  /** Drop shadow behind the frame. Offsets/blur are fractions of the shorter side. */
  shadow?: { x?: number; y?: number; blur?: number; color?: string };
}
