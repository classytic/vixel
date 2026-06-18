/**
 * Clip motion fold — the ONE whole-element motion sample every renderer applies on
 * top of a clip's resolved layout. It folds the one-shot entrance/exit
 * ({@link entranceAt}) and the continuous loop ({@link loopAt}) into a single delta,
 * so a renderer never hand-rolls `e.dx + lp.dx` again (each clip kind did it
 * separately, and they DIVERGED — text folded loop, media didn't). Centralizing here
 * is what makes loop motion (pulse / float / wiggle) work on ANY visual clip — image,
 * video, shape, text — from the same data.
 *
 * A clip-local TRANSFORM animation (Ken Burns) stays renderer-side and composes ON
 * TOP of this sample (it needs the canvas + the sprite's fit scale). Channels mirror
 * the samplers they fold: `dx`/`dy` are canvas FRACTIONS (renderer scales by W/H),
 * `rotation` is RADIANS — both ADDITIVE; `opacity`/`scale` are MULTIPLICATIVE. Pure.
 */
import type { VisualClip } from './visual.js';
import { entranceAt } from './entrance.js';
import { loopAt } from './text-animation.js';

export interface MotionSample {
  /** Positional offset as a fraction of the canvas (additive). */
  dx: number;
  dy: number;
  /** Rotation in radians (additive on top of the clip's base rotation). */
  rotation: number;
  /** Opacity multiplier 0..1. */
  opacity: number;
  /** Uniform scale multiplier. */
  scale: number;
}

export const NEUTRAL_MOTION: MotionSample = { dx: 0, dy: 0, rotation: 0, opacity: 1, scale: 1 };

/** Fold a clip's entrance/exit + continuous loop into one {@link MotionSample} at
 *  `localT` seconds into a clip of `durSec`. Returns {@link NEUTRAL_MOTION}'s values
 *  when nothing is active (cheap). */
export function sampleClipMotion(clip: VisualClip, localT: number, durSec: number): MotionSample {
  const e = entranceAt(clip.enter, clip.exit, localT, durSec);
  const lp = loopAt(clip.loop, localT);
  return {
    dx: e.dx + lp.dx,
    dy: e.dy + lp.dy,
    rotation: lp.rotation, // entrance carries no rotation; loop does
    opacity: e.opacity, // loop doesn't change opacity
    scale: e.scale * lp.scale,
  };
}
