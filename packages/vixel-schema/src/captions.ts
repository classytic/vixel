/**
 * Captions + text style — word-timed cues and BYO text styling. Every field is
 * JSON-serializable so an agent can emit it and the engine can burn it (libass).
 */
import type { TextFillLayer, TextStroke, TextShadow, PaintOrder } from './text-design.js';

/** One word with its own timing — the unit of karaoke / pop animation. */
export interface CaptionWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** One on-screen caption line. Provide `words` for word-level animation. */
export interface CaptionCue {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly words?: readonly CaptionWord[];
}

/** Where the caption block sits vertically. */
export type CaptionAlignment = 'top' | 'center' | 'bottom';

/** How each word animates/activates as it's spoken (CapCut/TikTok-style). */
export type CaptionAnimation =
  | 'none'
  | 'fade'
  | 'karaoke'
  | 'pop'
  | 'word-by-word'
  | 'highlight'
  | 'highlight-box';

/** Bring-your-own text style. Every field is JSON-serializable. Colors `#RRGGBB`. */
export interface TextStyle {
  fontFamily?: string;
  /** @engine-resolved Custom font file — wired via ffmpeg font attachment in the engine. */
  fontFile?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fillColor?: string;
  highlightColor?: string;
  stroke?: { width: number; color: string };
  /** `blur` is engine-resolved (soft-shadow); `depth` is the offset. */
  shadow?: { depth: number; color: string; blur?: number };
  /** Neon/glow halo around the text. `sigma` = blur radius, `intensity` = strength. */
  glow?: { color: string; sigma?: number; intensity?: number };
  // ── Layered design (SVG-like) — the rich-style path. When present these WIN over
  //    the flat fields above; `resolveTextDesign` lifts either form to one stack. ──
  /** Fill LAYERS back→front (solid/gradient/texture, with offsets for 3D). */
  fills?: TextFillLayer[];
  /** Multiple strokes, outermost→innermost. */
  strokes?: TextStroke[];
  /** Multiple drop shadows / glows. */
  shadows?: TextShadow[];
  /** SVG paint-order (strokes over fills, or under). Default `'fill-stroke'`. */
  paintOrder?: PaintOrder;
  /** A solid background card behind the text. `padding`/`radius` are px (radius
   *  rounds the corners); `opacity` 0..1 (default 1). The Pixi preview + the engine
   *  draw it; the text's corner-radius lives HERE (its own box), not the clip frame. */
  box?: { color: string; padding?: number; radius?: number; opacity?: number };
  /** Vertical placement of the caption block. */
  alignment?: CaptionAlignment;
  /** Horizontal text alignment (orthogonal to `alignment`). Default `center`. */
  align?: 'left' | 'center' | 'right';
  marginV?: number;
  letterSpacing?: number;
  animation?: CaptionAnimation;
}

/** Output canvas the captions are authored against. */
export interface CaptionCanvas {
  readonly width: number;
  readonly height: number;
}
