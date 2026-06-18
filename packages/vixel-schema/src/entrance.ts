/**
 * Entrance/exit motion — compile the named {@link OverlayEnter}/{@link OverlayExit}
 * vocab (fade / slide / pop) into a sampled offset, ONE source of truth every
 * renderer reads.
 * ========================================================================
 * Instead of each backend hardcoding a fade, {@link entranceAt} returns, for a
 * given time within an element, the delta to apply ON TOP of its resolved
 * transform: an opacity multiplier (fade), a positional offset as a fraction of
 * the canvas (slide), and a scale multiplier (pop). Pure + deterministic.
 *
 * Direction = the direction of MOTION. `slideUp` arrives from below moving up;
 * on exit it departs upward. Enter plays over `[0, inDur]`, exit over
 * `[dur-outDur, dur]`. The opacity ramp is linear (matches the engine's ffmpeg
 * `fade` filter), so a slide degrades cleanly to a plain fade where a backend
 * can't translate yet.
 */
import type { OverlayEnter, OverlayExit } from './animation.js';
import { applyEasing, type Easing } from './animation.js';

export interface EntranceSample {
  /** Opacity multiplier 0..1 (fade). */
  opacity: number;
  /** Positional offset as a FRACTION of the canvas — the renderer scales by W/H. */
  dx: number;
  dy: number;
  /** Scale multiplier (pop). */
  scale: number;
}

export interface EntranceOptions {
  /** Enter ramp seconds (default {@link ENTRANCE_DEFAULTS}, clamped to ≤ half the element duration). */
  inDur?: number;
  /** Exit ramp seconds (default {@link ENTRANCE_DEFAULTS}, clamped to ≤ half the element duration). */
  outDur?: number;
  /** Slide distance as a fraction of the canvas (default {@link ENTRANCE_DEFAULTS}). */
  distance?: number;
  /** Pop start/end scale (default {@link ENTRANCE_DEFAULTS}). */
  popScale?: number;
  /** Easing for the ENTER motion (slide/pop). Default `easeOut` (the historical curve).
   *  Opacity stays a linear ramp regardless (matches the ffmpeg `fade` filter). */
  enterEasing?: Easing;
  /** Easing for the EXIT motion. Default `easeIn` (the historical curve). */
  exitEasing?: Easing;
}

/**
 * The ONE set of entrance timing/shape constants, shared by every renderer (the
 * Pixi preview samples {@link entranceAt}; the ffmpeg engine compiles the same
 * curve into overlay x/y expressions) so motion looks identical across both.
 */
export const ENTRANCE_DEFAULTS = {
  /** Enter ramp seconds. */
  inDur: 0.35,
  /** Exit ramp seconds. */
  outDur: 0.35,
  /** Slide distance as a fraction of the canvas. */
  distance: 0.06,
  /** Pop start/end scale. */
  popScale: 0.8,
} as const;

const IDENTITY: EntranceSample = { opacity: 1, dx: 0, dy: 0, scale: 1 };
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** True for the positional slide presets (vs fade/pop). */
export function isSlide(name: string | undefined): boolean {
  return name === 'slideUp' || name === 'slideDown' || name === 'slideLeft' || name === 'slideRight';
}

/** Motion-direction vector (fraction of canvas) for a slide preset; `{0,0}` otherwise. */
export function entranceMotionVec(name: string, dist: number): { dx: number; dy: number } {
  switch (name) {
    case 'slideUp': return { dx: 0, dy: -dist };
    case 'slideDown': return { dx: 0, dy: dist };
    case 'slideLeft': return { dx: -dist, dy: 0 };
    case 'slideRight': return { dx: dist, dy: 0 };
    default: return { dx: 0, dy: 0 };
  }
}

/**
 * Sample the combined enter+exit animation at `localT` seconds into an element of
 * `durSec`. Returns {@link IDENTITY} when nothing is active (cheap no-op path).
 */
export function entranceAt(
  enter: OverlayEnter | undefined,
  exit: OverlayExit | undefined,
  localT: number,
  durSec: number,
  opts: EntranceOptions = {},
): EntranceSample {
  const dist = opts.distance ?? ENTRANCE_DEFAULTS.distance;
  const popScale = opts.popScale ?? ENTRANCE_DEFAULTS.popScale;
  const inDur = Math.min(opts.inDur ?? ENTRANCE_DEFAULTS.inDur, durSec / 2);
  const outDur = Math.min(opts.outDur ?? ENTRANCE_DEFAULTS.outDur, durSec / 2);

  let opacity = 1;
  let dx = 0;
  let dy = 0;
  let scale = 1;

  if (enter && enter !== 'none' && inDur > 0 && localT < inDur) {
    const p = clamp01(localT / inDur); // 0 → 1
    const e = applyEasing(opts.enterEasing ?? 'easeOut', p);
    opacity *= p;
    if (enter === 'popIn') {
      scale *= popScale + (1 - popScale) * e;
    } else {
      const m = entranceMotionVec(enter, dist);
      dx += -m.dx * (1 - e); // starts at -motion (where it came from), arrives at 0
      dy += -m.dy * (1 - e);
    }
  }

  if (exit && exit !== 'none' && outDur > 0 && localT > durSec - outDur) {
    const q = clamp01((durSec - localT) / outDur); // 1 → 0 toward the end
    const k = applyEasing(opts.exitEasing ?? 'easeIn', 1 - q); // 0 → 1 as it leaves
    opacity *= q;
    if (exit === 'popOut') {
      scale *= 1 - (1 - popScale) * k; // 1 → popScale
    } else {
      const m = entranceMotionVec(exit, dist);
      dx += m.dx * k; // departs toward the motion direction
      dy += m.dy * k;
    }
  }

  if (opacity === 1 && dx === 0 && dy === 0 && scale === 1) return IDENTITY;
  return { opacity, dx, dy, scale };
}
