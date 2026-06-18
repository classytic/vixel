/**
 * Pure render-math for the Pixi reconciler — NO Pixi / DOM / spec-object deps, so
 * every resource-sensitive, correctness-critical algorithm here is independently
 * unit-testable (see `calc.test.ts`). The reconciler (`scene.ts`) stays orchestration
 * + GPU object mutation; the geometry/timing decisions live here, named and tested.
 *
 * Conventions:
 *  - `fit` scale: cover = fill the box (max), contain = letterbox (min).
 *  - Transition windows are the TRAILING `transitionSec` of a clip (it crossfades
 *    into its successor); progress is 0..1 across that window.
 *  - {@link BoxStyle} metrics are FRACTIONS of the box's shorter side (resolution-
 *    independent), matching the ffmpeg engine so preview ≈ export.
 */
import type { Fit, BoxStyle } from '@classytic/vixel-schema';
import { clamp } from '../../shared/utils/time.js';

/**
 * Uniform scale to fit a `srcW×srcH` source into a `boxW×boxH` box under `fit`:
 * `cover` fills (max ratio, may overflow → caller masks), `contain` letterboxes
 * (min ratio). Returns `null` for `stretch` (caller sizes the box directly) or when
 * the source has no known dimensions yet (caller should hide rather than guess).
 */
export function fitScale(fit: Fit, boxW: number, boxH: number, srcW: number, srcH: number): number | null {
  if (fit === 'stretch') return null;
  if (srcW <= 0 || srcH <= 0) return null;
  const sx = boxW / srcW;
  const sy = boxH / srcH;
  return fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
}

/** A clip's active / transition state at `timeSec`, derived from its laid-out window. */
export interface ClipWindow {
  /** Playhead is inside `[startSec, endSec)`. */
  onScreen: boolean;
  /** Playhead is inside the trailing transition window (crossfading into the next clip). */
  inTransition: boolean;
  /** Time the transition window opens (`endSec - transitionSec`). */
  overlapStart: number;
  /** 0..1 across the transition window (0 outside it). */
  progress: number;
}

/** Compute {@link ClipWindow} for a clip laid out at `[startSec, endSec)` with a
 *  trailing `transitionSec` crossfade. Pure. */
export function clipWindowAt(startSec: number, endSec: number, transitionSec: number, timeSec: number): ClipWindow {
  const onScreen = timeSec >= startSec && timeSec < endSec;
  const overlapStart = endSec - transitionSec;
  const inTransition = transitionSec > 0 && timeSec >= overlapStart && timeSec < endSec;
  const progress = inTransition ? clamp((timeSec - overlapStart) / transitionSec, 0, 1) : 0;
  return { onScreen, inTransition, overlapStart, progress };
}

/**
 * Is the clip whose PREVIOUS lane-neighbour is `prev` currently the INCOMING side
 * of `prev`'s transition? If so it is already drawn by that transition's incoming
 * pass, so it must NOT also render its own normal pass (the double-image / two
 * scenes compositing at full opacity during a crossfade).
 */
export function isIncomingFromPrev(prev: { endSec: number; transitionSec: number } | undefined, timeSec: number): boolean {
  return !!prev && prev.transitionSec > 0 && timeSec >= prev.endSec - prev.transitionSec && timeSec < prev.endSec;
}

/**
 * The animated-GIF frame index to show at `localMs` into the clip, given each
 * frame's CUMULATIVE end time (ascending; last entry = the GIF's total duration).
 * The GIF loops, so time wraps modulo the total. Pure + deterministic, so a scrub
 * and an export pick the SAME frame for a given time (no wall-clock playback).
 */
export function gifFrameIndexAt(frameEndsMs: number[], localMs: number): number {
  const n = frameEndsMs.length;
  if (n === 0) return 0;
  const total = frameEndsMs[n - 1]!;
  if (!(total > 0)) return 0;
  const t = ((localMs % total) + total) % total; // wrap (handles negative)
  for (let i = 0; i < n; i++) if (t < frameEndsMs[i]!) return i;
  return n - 1;
}

/** BoxStyle metrics resolved to PIXELS for a given box (fractions × shorter side). */
export interface BoxStylePx {
  /** Corner radius px, clamped so it never exceeds half the shorter side. */
  radiusPx: number;
  /** Border stroke width px (0 if no border). */
  borderPx: number;
  /** Drop-shadow offset/blur px, or null when no shadow. */
  shadow: { ox: number; oy: number; blur: number } | null;
}

/**
 * Resolve {@link BoxStyle} fractions to px for a `boxW×boxH` box. Shadow defaults:
 * `y=0.04`, `blur=0.04`, `x=0` (fractions of the shorter side) — the same defaults
 * the engine's rasterizer uses.
 */
export function resolveBoxStylePx(style: BoxStyle | undefined, boxW: number, boxH: number): BoxStylePx {
  const short = Math.min(boxW, boxH);
  const radiusPx = style?.radius ? Math.min(style.radius * short, short / 2) : 0;
  const borderPx = style?.border?.width ? Math.max(0, style.border.width * short) : 0;
  const sh = style?.shadow;
  const shadow = sh
    ? { ox: (sh.x ?? 0) * short, oy: (sh.y ?? 0.04) * short, blur: (sh.blur ?? 0.04) * short }
    : null;
  return { radiusPx, borderPx, shadow };
}
