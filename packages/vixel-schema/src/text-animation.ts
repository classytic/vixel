/**
 * Text animation — a FIRST-CLASS primitive, distinct from effects / filters /
 * transitions (this is CapCut's "Text → Animation" panel, with In / Out / Loop
 * tabs). A descriptor compiles down to primitives every renderer already samples,
 * so adding it costs almost no new render code:
 *  - `in`   → an {@link OverlayEnter} preset, applied to `clip.enter`  (motion via `entranceAt`).
 *  - `out`  → an {@link OverlayExit} preset,  applied to `clip.exit`   (motion via `entranceAt`).
 *  - `loop` → a continuous {@link TextLoop}, applied to `clip.loop`    (sampled via `loopAt`).
 *
 * This is deliberately NOT the same concept as:
 *  - `TextStyle.animation` (karaoke / word-by-word / highlight) — a per-WORD caption
 *    coloring effect, see ./captions.
 *  - an {@link EffectDescriptor} (filter / FX) — a pixel operation on a clip.
 *  - a {@link TransitionDescriptor} — a blend BETWEEN two clips at a seam.
 */
import type { OverlayEnter, OverlayExit } from './animation.js';

/**
 * Continuously-looping text motion (the CapCut "Loop" tab). Plays for the whole
 * clip, independent of enter/exit. Sampled by {@link loopAt}.
 */
export type TextLoop = 'none' | 'pulse' | 'breathe' | 'float' | 'wiggle' | 'bounce';

export type TextAnimationPhase = 'in' | 'out' | 'loop';

/** One entry in the Text → Animation gallery (pure data, like the effect/transition catalogs). */
export interface TextAnimationDescriptor {
  id: string;
  name: string;
  phase: TextAnimationPhase;
  /** `in` entries — the entrance preset written to `VisualClip.enter`. */
  enter?: OverlayEnter;
  /** `out` entries — the exit preset written to `VisualClip.exit`. */
  exit?: OverlayExit;
  /** `loop` entries — the continuous motion written to `VisualClip.loop`. */
  loop?: TextLoop;
}

/**
 * Built-in text-animation vocabulary, grouped by {@link TextAnimationPhase}. In/Out
 * reuse the shared entrance/exit presets; Loop is text-specific continuous motion.
 */
export const BUILTIN_TEXT_ANIMATIONS: TextAnimationDescriptor[] = [
  // ── In ──────────────────────────────────────────────────────────────────
  { id: 'in-fade', name: 'Fade In', phase: 'in', enter: 'fadeIn' },
  { id: 'in-rise', name: 'Rise Up', phase: 'in', enter: 'slideUp' },
  { id: 'in-drop', name: 'Drop In', phase: 'in', enter: 'slideDown' },
  { id: 'in-slide-left', name: 'Slide Left', phase: 'in', enter: 'slideLeft' },
  { id: 'in-slide-right', name: 'Slide Right', phase: 'in', enter: 'slideRight' },
  { id: 'in-pop', name: 'Pop In', phase: 'in', enter: 'popIn' },
  // ── Out ─────────────────────────────────────────────────────────────────
  { id: 'out-fade', name: 'Fade Out', phase: 'out', exit: 'fadeOut' },
  { id: 'out-rise', name: 'Rise Out', phase: 'out', exit: 'slideUp' },
  { id: 'out-drop', name: 'Drop Out', phase: 'out', exit: 'slideDown' },
  { id: 'out-slide-left', name: 'Slide Left', phase: 'out', exit: 'slideLeft' },
  { id: 'out-slide-right', name: 'Slide Right', phase: 'out', exit: 'slideRight' },
  { id: 'out-pop', name: 'Pop Out', phase: 'out', exit: 'popOut' },
  // ── Loop ────────────────────────────────────────────────────────────────
  { id: 'loop-pulse', name: 'Pulse', phase: 'loop', loop: 'pulse' },
  { id: 'loop-breathe', name: 'Breathe', phase: 'loop', loop: 'breathe' },
  { id: 'loop-float', name: 'Float', phase: 'loop', loop: 'float' },
  { id: 'loop-wiggle', name: 'Wiggle', phase: 'loop', loop: 'wiggle' },
  { id: 'loop-bounce', name: 'Bounce', phase: 'loop', loop: 'bounce' },
];

/** A frame sample of a {@link TextLoop} — deltas applied ON TOP of the resolved transform. */
export interface TextLoopSample {
  /** Positional offset as a FRACTION of the canvas (renderer scales by W/H). */
  dx: number;
  dy: number;
  /** Scale multiplier. */
  scale: number;
  /** Rotation delta in radians. */
  rotation: number;
}

const LOOP_IDENTITY: TextLoopSample = { dx: 0, dy: 0, scale: 1, rotation: 0 };

/** One full oscillation, in seconds. Subtle + premium, not jittery. */
export const TEXT_LOOP_PERIOD = 1.6;

/**
 * Sample a continuous text loop at `localT` seconds into the clip. Pure +
 * deterministic (a function of time only), so the Pixi preview and the offline
 * export agree frame-for-frame. Returns the identity sample for `none`/unknown.
 */
export function loopAt(loop: TextLoop | undefined, localT: number, period = TEXT_LOOP_PERIOD): TextLoopSample {
  if (!loop || loop === 'none') return LOOP_IDENTITY;
  const phase = (localT / period) * Math.PI * 2;
  const sin = Math.sin(phase);
  switch (loop) {
    case 'pulse':
      return { dx: 0, dy: 0, scale: 1 + 0.06 * sin, rotation: 0 };
    case 'breathe':
      return { dx: 0, dy: 0, scale: 1 + 0.03 * sin, rotation: 0 };
    case 'float':
      return { dx: 0, dy: 0.012 * sin, scale: 1, rotation: 0 };
    case 'wiggle':
      return { dx: 0, dy: 0, scale: 1, rotation: ((3 * Math.PI) / 180) * sin };
    case 'bounce':
      // one-sided: the text dips below baseline and springs back, never above.
      return { dx: 0, dy: -0.02 * Math.abs(sin), scale: 1, rotation: 0 };
    default:
      return LOOP_IDENTITY;
  }
}
