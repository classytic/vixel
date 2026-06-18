/**
 * Keyframes — the scoped animation primitive (movis/AE/OpenShot model). A CHANNEL
 * is a sorted list of {@link Keyframe}s; the easing on a keyframe applies across
 * the segment to the NEXT one. One primitive drives every animatable scalar —
 * transform x/y/w/h/rotation/opacity ({@link TransformKeyframes}), mask geometry,
 * and audio gain — so there is ONE sampler + ONE set of edit ops, tested here,
 * reused by the preview, the in-browser export, the ffmpeg engine, and the editor.
 *
 * Design (deliberately lean — no Bézier handles like OpenShot's Point.handle*):
 * easing is a NAMED curve, not draggable tangents. That covers linear / ease /
 * hold (OpenShot LINEAR / BEZIER / CONSTANT) without a handle-editing UI.
 */
import { applyEasing, type Easing } from './animation.js';

/**
 * Easing INTO the next keyframe (movis/AE model). Mirrors a pro NLE's set:
 *  - `linear`  — straight ramp (kdenlive/MLT "Linear").
 *  - `hold`    — step / no interpolation (kdenlive "Discrete", OpenShot CONSTANT).
 *  - `smooth`  — Catmull-Rom SPLINE through the neighbouring keys, so multi-point
 *                paths stay velocity-continuous (don't stop at each key) — kdenlive
 *                "Smooth". Use this for natural motion through 3+ keyframes.
 *  - `easeIn`/`easeOut`/`easeInOut` — directional single-segment eases (CapCut-style
 *    presets) that desktop NLEs leave to manual Bézier handles; better for a
 *    2-key move, but they DO settle to zero velocity at each key (use `smooth`
 *    for paths).
 */
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smooth' | 'hold';

/** Uniform Catmull-Rom: a cubic through p1→p2 with tangents from p0,p3 (the
 *  neighbouring keys). Passes through p1 at t=0 and p2 at t=1, C1-continuous at
 *  interior keys — the standard "smooth" interpolation (MLT/AE). */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export interface Keyframe {
  /** Time in seconds (relative to the element's start). */
  t: number;
  value: number;
  /** Easing applied across the segment to the NEXT keyframe. Default `linear`. */
  easing?: KeyframeEasing;
}

/** Float tolerance for "a keyframe AT this time" (≈0.1ms). */
const EPS = 1e-4;

/** Keyframes sorted ascending by time. The edit ops below maintain this; the
 *  sampler ASSUMES it (so it stays a single linear scan, no per-call sort). */
function sorted(kfs: readonly Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.t - b.t);
}

/**
 * Sample a channel's value at `t` seconds. Pure + deterministic, so a scrub and an
 * offline export pick the SAME value. Returns `undefined` when the channel is empty
 * (the caller falls back to the element's STATIC value — an un-keyframed property).
 *
 * Semantics (OpenShot/AE): hold before the first key + after the last (clamped
 * endpoints); within a segment, interpolate by the LEFT key's easing (`hold` →
 * step). Input is assumed time-sorted (the edit ops keep it so).
 */
export function sampleChannel(kfs: readonly Keyframe[] | undefined, t: number): number | undefined {
  if (!kfs || kfs.length === 0) return undefined;
  const first = kfs[0]!;
  if (kfs.length === 1 || t <= first.t) return first.value;
  const last = kfs[kfs.length - 1]!;
  if (t >= last.t) return last.value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (t < a.t || t > b.t) continue;
    const span = b.t - a.t;
    if (span <= 0 || a.easing === 'hold') return a.value; // step / coincident keys
    const localT = (t - a.t) / span;
    if (a.easing === 'smooth') {
      // Catmull-Rom through the 4 surrounding keys (clamp endpoints by repeating).
      const p0 = (kfs[i - 1] ?? a).value;
      const p3 = (kfs[i + 2] ?? b).value;
      return catmullRom(p0, a.value, b.value, p3, localT);
    }
    const eased = applyEasing((a.easing ?? 'linear') as Easing, localT);
    return a.value + (b.value - a.value) * eased;
  }
  return last.value; // unreachable for sorted input; defensive
}

/** Index of a keyframe AT `t` (within `eps`), or -1. */
export function keyframeIndexAt(kfs: readonly Keyframe[] | undefined, t: number, eps = EPS): number {
  if (!kfs) return -1;
  for (let i = 0; i < kfs.length; i++) if (Math.abs(kfs[i]!.t - t) <= eps) return i;
  return -1;
}

/** True if the channel has a keyframe AT `t`. */
export function hasKeyframeAt(kfs: readonly Keyframe[] | undefined, t: number, eps = EPS): boolean {
  return keyframeIndexAt(kfs, t, eps) !== -1;
}

/**
 * Insert a keyframe, or UPDATE the one already at `kf.t` (within `eps`) — the
 * "right-click → add/set keyframe at playhead" op. Pure: returns a NEW sorted
 * array, never mutates the input. Merges onto an existing key so re-adding at the
 * same time changes value/easing rather than duplicating.
 */
export function upsertKeyframe(kfs: readonly Keyframe[] | undefined, kf: Keyframe, eps = EPS): Keyframe[] {
  const base = kfs ? [...kfs] : [];
  const i = keyframeIndexAt(base, kf.t, eps);
  if (i >= 0) base[i] = { ...base[i]!, ...kf };
  else base.push(kf);
  return sorted(base);
}

/**
 * Remove the keyframe AT `t` (within `eps`) — the "right-click → delete keyframe"
 * op. Pure: returns a NEW array (the others, still sorted).
 */
export function removeKeyframeAt(kfs: readonly Keyframe[] | undefined, t: number, eps = EPS): Keyframe[] {
  if (!kfs) return [];
  return kfs.filter((k) => Math.abs(k.t - t) > eps);
}
