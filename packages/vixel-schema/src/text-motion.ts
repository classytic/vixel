/**
 * Text MOTION — per-token (word / character / line) kinetic typography, the
 * "animated lyric/quote video" look (staggered word punch-ins). A FIRST-CLASS
 * primitive distinct from:
 *   - `clip.enter/exit` ({@link OverlayEnter}/{@link OverlayExit}) — animate the WHOLE block.
 *   - `clip.loop` ({@link TextLoop}) — continuous whole-block motion.
 *   - `TextStyle.animation` (karaoke/highlight) — per-WORD recolor driven by SPEECH timing.
 *
 * This animates each token's TRANSFORM (offset / scale / opacity) on a stagger,
 * driven by a duration (not a transcript). It is deliberately built ON TOP of the
 * shared {@link entranceAt} sampler — a token's entrance is just `entranceAt` with
 * a per-token time OFFSET — so there is ONE source of truth for fade/slide/pop and
 * every renderer (Pixi `SplitText`, the ffmpeg/libass engine) stays in lock-step.
 * The schema owns the TIMING + the per-token DELTA; the renderer owns the LAYOUT
 * (where each token sits) and applies the delta.
 */
import type { OverlayEnter, OverlayExit } from './animation.js';
import { entranceAt, type EntranceSample, type EntranceOptions } from './entrance.js';

/** How to break the string into independently-animated tokens. */
export type TextSplitUnit = 'word' | 'char' | 'line';
/** The order tokens animate in (which token gets stagger-rank 0). */
export type TextMotionOrder = 'forward' | 'reverse' | 'center' | 'random';

/**
 * Per-token kinetic typography on a {@link TextMedia} clip. Flat (no nesting) so an
 * agent can emit it in one object. All fields optional → see {@link TEXT_MOTION_DEFAULTS}.
 */
export interface TextMotion {
  /** Tokenization unit. Default `'word'`. */
  by?: TextSplitUnit;
  /** Seconds between consecutive tokens' entrances. Default `0.06`. */
  stagger?: number;
  /** Which token leads (stagger-rank 0). Default `'forward'`. */
  order?: TextMotionOrder;
  /** Per-token entrance preset (reuses the shared vocab). Default `'popIn'`. */
  enter?: OverlayEnter;
  /** Per-token exit preset. Default none (tokens stay until the clip ends). */
  exit?: OverlayExit;
  /** Per-token entrance ramp seconds (default {@link entranceAt} default). */
  inDur?: number;
  /** Per-token exit ramp seconds. */
  outDur?: number;
  /** Slide distance as a fraction of the canvas (slide presets). */
  distance?: number;
  /** Pop start scale (pop presets). */
  popScale?: number;
}

export const TEXT_MOTION_DEFAULTS = {
  by: 'word',
  stagger: 0.06,
  order: 'forward',
  enter: 'popIn',
} as const satisfies Pick<TextMotion, 'by' | 'stagger' | 'order' | 'enter'>;

/** One token of the split string (its text + its position index in reading order). */
export interface TextToken {
  text: string;
  /** 0-based position in reading order (the split sequence). */
  index: number;
}

/**
 * Split `text` into animation tokens. Whitespace-delimited for `'word'`, newline
 * for `'line'`, code points for `'char'`. The renderer MUST split identically (Pixi
 * `SplitText` does; libass we tokenize with this) so per-token deltas line up with
 * the laid-out glyphs. Pure.
 */
export function tokenizeText(text: string, by: TextSplitUnit = 'word'): TextToken[] {
  if (by === 'char') return Array.from(text).map((t, index) => ({ text: t, index }));
  if (by === 'line') return text.split('\n').map((t, index) => ({ text: t, index }));
  const out: TextToken[] = [];
  for (const w of text.split(/\s+/)) if (w.length) out.push({ text: w, index: out.length });
  return out;
}

/**
 * The stagger RANK of a token (0 = animates first). Decouples reading-order
 * `index` from animation order. `'random'` is a DETERMINISTIC scatter (a hash, not
 * `Math.random`) so preview == export. Pure.
 */
export function tokenRank(index: number, count: number, order: TextMotionOrder = 'forward'): number {
  if (count <= 1) return 0;
  switch (order) {
    case 'reverse':
      return count - 1 - index;
    case 'center':
      return Math.round(Math.abs(index - (count - 1) / 2));
    case 'random': {
      // Knuth-multiplicative hash → a stable pseudo-scatter in [0, count).
      const h = Math.imul(index + 1, 2654435761) >>> 0;
      return h % count;
    }
    default:
      return index;
  }
}

/**
 * Sample token `tokenIndex` of `tokenCount`'s animation DELTA at `localT` seconds
 * into a clip of `durSec`. Returns an {@link EntranceSample} (opacity/dx/dy/scale)
 * the renderer applies ON TOP of the token's laid-out position — exactly like the
 * whole-clip {@link entranceAt}, because that is literally what powers it (with a
 * per-token time offset). Before a token's turn it reads opacity 0 (hidden); after
 * its entrance it reads identity (fully shown). Pure + deterministic.
 */
export function textTokenSampleAt(
  motion: TextMotion,
  tokenIndex: number,
  tokenCount: number,
  localT: number,
  durSec: number,
): EntranceSample {
  const stagger = Math.max(0, motion.stagger ?? TEXT_MOTION_DEFAULTS.stagger);
  const enter = motion.enter ?? TEXT_MOTION_DEFAULTS.enter;
  const order = motion.order ?? TEXT_MOTION_DEFAULTS.order;
  const offset = tokenRank(tokenIndex, tokenCount, order) * stagger;
  const dur = Math.max(durSec, 1e-4);
  const opts: EntranceOptions = {
    inDur: motion.inDur,
    outDur: motion.outDur,
    distance: motion.distance,
    popScale: motion.popScale,
  };
  // Entrance: shift time by the token's stagger offset (exit=undefined here).
  const enterS = entranceAt(enter, undefined, localT - offset, dur, opts);
  if (!motion.exit || motion.exit === 'none') return enterS;
  // Exit: clip-end aligned (all tokens leave together — staggered IN, clean OUT).
  const exitS = entranceAt(undefined, motion.exit, localT, dur, opts);
  return {
    opacity: enterS.opacity * exitS.opacity,
    dx: enterS.dx + exitS.dx,
    dy: enterS.dy + exitS.dy,
    scale: enterS.scale * exitS.scale,
  };
}

/** One entry in the Motion-Typography gallery (pure data, like the effect/transition catalogs). */
export interface TextMotionDescriptor {
  id: string;
  name: string;
  motion: TextMotion;
}

/**
 * Built-in kinetic-typography presets — the Tier-0 gallery + the agent's vocabulary
 * (the agent emits `{ id }` or the inlined {@link TextMotion}). Curated "looks",
 * not raw knobs.
 */
export const BUILTIN_TEXT_MOTIONS: TextMotionDescriptor[] = [
  { id: 'pop-stack', name: 'Pop Stack', motion: { by: 'word', enter: 'popIn', stagger: 0.08 } },
  { id: 'rise-words', name: 'Rise Words', motion: { by: 'word', enter: 'slideUp', stagger: 0.06 } },
  { id: 'fade-words', name: 'Fade Words', motion: { by: 'word', enter: 'fadeIn', stagger: 0.08 } },
  { id: 'typewriter', name: 'Typewriter', motion: { by: 'char', enter: 'fadeIn', stagger: 0.03 } },
  { id: 'drop-lines', name: 'Drop Lines', motion: { by: 'line', enter: 'slideDown', stagger: 0.12 } },
];
