/**
 * Caption + text-style model.
 * ==========================
 * JSON-serializable, agent-emittable types for animated captions. The caption
 * shape matches `@remotion/captions` / Whisper word-timestamp output, so an AI
 * agent (or an ASR pipeline) can feed cues straight in.
 *
 * Rendering is via libass: a structured cue list + a {@link TextStyle} compile
 * to an ASS file (see `./ass.ts`) burned with the ffmpeg `ass` filter. ASS is
 * the right primitive for word-level karaoke / TikTok pop captions — `drawtext`
 * cannot do per-word sweep or scale animation.
 */

/** One word with its own timing — the unit of karaoke / pop animation. */
export interface CaptionWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * One on-screen caption line. Provide `words` for word-level animation
 * (karaoke sweep / pop highlight); without them the whole line animates as one.
 * Mirrors the `@classytic`/Remotion `Caption` interchange shape.
 */
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
  | 'none' // static line
  | 'fade' // line fades in/out
  | 'karaoke' // per-word fill sweep (\kf), spoken words stay brightened (cumulative)
  | 'pop' // per-word scale pop-in, timed to speech
  | 'word-by-word' // ONE word on screen at a time, replacing (max focus)
  | 'highlight' // full line, only the CURRENT word recolors + scales (reverts)
  | 'highlight-box'; // one word at a time with a background box (the boxed-word look)

/**
 * Bring-your-own text style. Every field is JSON-serializable and maps to an
 * ASS style field or override tag (see `./ass.ts`). Colors are `#RRGGBB`
 * (vixel handles the ASS byte-swap). All fields optional → terse agent specs.
 */
export interface TextStyle {
  /** Font family name. MUST match a font registered in `fontsDir`/fontconfig. */
  fontFamily?: string;
  /** Optional path to a font file to register (BYO font). */
  fontFile?: string;
  /** Font size in output (PlayRes) pixels. */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Main fill color (`#RRGGBB`). */
  fillColor?: string;
  /** Color of the active/spoken word for karaoke/pop (`#RRGGBB`). */
  highlightColor?: string;
  /** Outline. */
  stroke?: { width: number; color: string };
  /** Drop shadow. */
  shadow?: { depth: number; color: string; blur?: number };
  /** Opaque background box behind text (ASS BorderStyle=3). */
  box?: { color: string };
  /** Vertical placement. Default `bottom`. */
  alignment?: CaptionAlignment;
  /** Distance (px) from the aligned edge. */
  marginV?: number;
  /** Letter spacing (px). */
  letterSpacing?: number;
  /** Per-word animation. Default `karaoke` when words are present, else `fade`. */
  animation?: CaptionAnimation;
}

/** Output canvas the ASS is authored against (must match the burn target). */
export interface CaptionCanvas {
  readonly width: number;
  readonly height: number;
}
