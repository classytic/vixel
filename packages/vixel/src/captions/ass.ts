/**
 * ASS (Advanced SubStation Alpha) generation — pure, no I/O.
 * =========================================================
 * Compiles a {@link CaptionCue} list + a {@link TextStyle} into an ASS file
 * string that libass burns via the ffmpeg `ass` filter. Kept pure so the whole
 * caption look is golden-snapshot-testable without ffmpeg.
 *
 * Load-bearing details (the classic ASS footguns):
 *  - Colors are `&HAABBGGRR` — byte-REVERSED from `#RRGGBB` (R↔B swap). Getting
 *    this wrong swaps red/blue silently.
 *  - Karaoke `\k`/`\kf` durations are in CENTISECONDS and their sum across a
 *    line MUST equal the line duration, or the sweep desyncs — so silent gaps
 *    between words are emitted as empty `\k` chunks.
 *  - Per-word "pop" uses `\t(t1,t2,…)` with times RELATIVE TO THE LINE START,
 *    offset by each word's start, so each word pops when it's spoken.
 */

import { ConfigError } from '../errors.js';
import type {
  CaptionAlignment,
  CaptionCanvas,
  CaptionCue,
  TextStyle,
} from './types.js';

const POP_FROM_SCALE = 70; // % start scale for pop-in
const POP_DURATION_MS = 120;

const DEFAULTS = {
  fontFamily: 'Arial',
  fontSize: 64,
  fillColor: '#FFFFFF',
  highlightColor: '#FFD700',
  strokeColor: '#000000',
  strokeWidth: 2,
  marginV: 80,
  alignment: 'bottom' as CaptionAlignment,
} as const;

const ALIGN_NUMPAD: Record<CaptionAlignment, number> = { top: 8, center: 5, bottom: 2 };

/**
 * Validate + normalize a color to 6 hex digits, expanding `#RGB` shorthand.
 * Throws on anything else — a bad color must fail loudly (and can't smuggle a
 * comma into the CSV Style row).
 */
function normalizeHex6(hex: string): string {
  const raw = hex.trim().replace(/^#/, '');
  const expanded = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new ConfigError(`Invalid color "${hex}" — expected #RRGGBB or #RGB`, {
      context: { color: hex },
    });
  }
  return expanded.toUpperCase();
}

/** `#RRGGBB` (or `#RGB`) → `BBGGRR` (the ASS byte order). Validates input. */
export function hexToAssBgr(hex: string): string {
  const h = normalizeHex6(hex);
  return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
}

/** Strip characters that would corrupt a comma-separated ASS `Style:` row. */
function sanitizeStyleField(s: string): string {
  return s.replace(/[\r\n,{}]/g, ' ').trim();
}

/** Opaque color for a Style field: `&H00BBGGRR`. */
function styleColor(hex: string): string {
  return `&H00${hexToAssBgr(hex)}`;
}

/** Color for an override tag (`\1c`, `\3c`, …): `&HBBGGRR&`. */
function tagColor(hex: string): string {
  return `&H${hexToAssBgr(hex)}&`;
}

/**
 * Override prefix for a GLOW pass — a soft, blurred, colored blob meant to be
 * drawn on a LOWER layer behind the sharp text (so a halo bleeds out around the
 * glyphs). `sigma` drives `\blur`, with a matching colored border for spread;
 * `intensity` softens the layer's alpha. The caller renders the same text with
 * this prefix at a lower ASS layer, then the normal styled text on top.
 */
export function glowOverride(glow: { color: string; sigma?: number; intensity?: number }): string {
  const sigma = Math.max(1, glow.sigma ?? 6);
  // A THIN colored border seeds the halo; the blur does the spreading. A fat
  // border reads as a chunky offset blob (especially top-anchored), not a glow.
  const bord = Math.max(1, Math.round(sigma / 4));
  const c = tagColor(glow.color);
  // alpha 00 = opaque; weaker intensity → more transparent halo.
  const alpha = Math.round(Math.max(0, Math.min(255, 255 * (1 - Math.min(1, glow.intensity ?? 1)))));
  const aHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  return `{\\blur${sigma}\\bord${bord}\\shad0\\1c${c}\\3c${c}\\alpha&H${aHex}&}`;
}

/**
 * Override for a SOFT DROP-SHADOW pass — a blurred, offset, shadow-colored copy
 * of the glyphs with the fill + outline made fully transparent (only the shadow
 * shows). Rendered on a LOWER layer behind the sharp text, mirroring the Pixi
 * preview's `dropShadow` (offset by `depth`, blurred by `blur`). For `blur:0`
 * the engine's hard Style shadow already matches, so this pass is only emitted
 * when `blur` is set.
 */
export function shadowOverride(shadow: { depth: number; color: string; blur?: number }): string {
  const blur = Math.max(0, shadow.blur ?? 0);
  const depth = Math.max(0, shadow.depth ?? 2);
  const c = tagColor(shadow.color);
  // \1a/\3a transparent (hide fill + outline); \4a opaque shadow in \4c, blurred.
  return `{\\bord0\\shad${depth}\\blur${blur}\\1a&HFF&\\3a&HFF&\\4a&H00&\\4c${c}}`;
}

/** Scale (%) the active word grows to in highlight modes. */
const HIGHLIGHT_SCALE = 112;
/** Smoothing for highlight color/scale transitions (ms). */
const HIGHLIGHT_RAMP_MS = 80;

/** Centiseconds timestamp `h:mm:ss.cc`. */
export function msToAssTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
}

/** Escape ASS-special characters in user text. */
function escapeText(text: string): string {
  return text.replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

/** Build the `[V4+ Styles]` `Style:` line. `opts` lets compose author multiple
 *  named, independently-positioned styles in one ASS document. */
export function buildStyleLine(style: TextStyle, opts: { name?: string; alignNumpad?: number } = {}): string {
  const karaoke = (style.animation ?? 'karaoke') === 'karaoke';
  const fill = style.fillColor ?? DEFAULTS.fillColor;
  const highlight = style.highlightColor ?? DEFAULTS.highlightColor;
  // Karaoke sweep flips Secondary→Primary, so spoken=Primary(highlight), unspoken=Secondary(fill).
  const primary = styleColor(karaoke ? highlight : fill);
  const secondary = styleColor(fill); // always the unspoken/base color

  // 'highlight-box' implies a background box even if the caller didn't set one
  // (the box color defaults to the accent/highlight color).
  const boxMode = style.animation === 'highlight-box';
  const hasBox = !!style.box || boxMode;
  const boxColor = style.box?.color ?? highlight;
  const outlineColour = styleColor(hasBox ? boxColor : (style.stroke?.color ?? DEFAULTS.strokeColor));
  const backColour = styleColor(style.shadow?.color ?? '#000000');
  const borderStyle = hasBox ? 3 : 1;
  const outline = style.stroke?.width ?? (hasBox ? 4 : DEFAULTS.strokeWidth);
  const shadow = style.shadow?.depth ?? 0;
  const bold = style.bold ? -1 : 0;
  const italic = style.italic ? -1 : 0;
  const underline = style.underline ? -1 : 0;
  const spacing = style.letterSpacing ?? 0;
  // Numpad encodes BOTH axes: ALIGN_NUMPAD gives the vertical (center column);
  // horizontal `align` shifts ∓1 within the row (left/center/right).
  const hOff = style.align === 'left' ? -1 : style.align === 'right' ? 1 : 0;
  const align = (opts.alignNumpad ?? ALIGN_NUMPAD[style.alignment ?? DEFAULTS.alignment]) + hOff;
  const marginV = style.marginV ?? DEFAULTS.marginV;

  // Format: Name,Fontname,Fontsize,Primary,Secondary,Outline,Back,Bold,Italic,
  // Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,
  // Alignment,MarginL,MarginR,MarginV,Encoding
  return [
    `Style: ${opts.name ?? 'Default'}`,
    sanitizeStyleField(style.fontFamily ?? DEFAULTS.fontFamily), // never let a comma/newline shift the CSV
    style.fontSize ?? DEFAULTS.fontSize,
    primary,
    secondary,
    outlineColour,
    backColour,
    bold,
    italic,
    underline,
    0,
    100,
    100,
    spacing,
    0,
    borderStyle,
    outline,
    shadow,
    align,
    40,
    40,
    marginV,
    1,
  ].join(',');
}

/** Build the `Text` field for one cue (the override-tagged string). */
export function buildCueText(cue: CaptionCue, style: TextStyle): string {
  const animation = style.animation ?? (cue.words && cue.words.length > 0 ? 'karaoke' : 'fade');
  const words = cue.words ?? [];

  // No word timing → animate the whole line.
  if (animation === 'fade' || words.length === 0) {
    const body = escapeText(cue.text);
    return animation === 'fade' || animation === 'pop' ? `{\\fad(150,150)}${body}` : body;
  }
  if (animation === 'none') {
    return escapeText(cue.text);
  }

  // 'highlight' — full line in the base color; only the CURRENT word ramps to
  // the highlight color + scales up during its window, then reverts (the classic
  // "active word pops" CapCut look). Each word's override resets to base first,
  // so highlights don't accumulate.
  if (animation === 'highlight') {
    const fillT = tagColor(style.fillColor ?? DEFAULTS.fillColor);
    const hiT = tagColor(style.highlightColor ?? DEFAULTS.highlightColor);
    const R = HIGHLIGHT_RAMP_MS;
    const S = HIGHLIGHT_SCALE;
    return words
      .map((w) => {
        const s = Math.max(0, Math.round(w.startMs - cue.startMs));
        const e = Math.max(s, Math.round(w.endMs - cue.startMs));
        return (
          `{\\1c${fillT}\\fscx100\\fscy100` +
          `\\t(${s},${s + R},\\1c${hiT}\\fscx${S}\\fscy${S})` +
          `\\t(${e},${e + R},\\1c${fillT}\\fscx100\\fscy100)}${escapeText(w.text)} `
        );
      })
      .join('')
      .trimEnd();
  }

  // Per-word karaoke / pop. The cursor only ever advances, and word times are
  // CLAMPED to [cue.startMs, cue.endMs], so the sum of \k can never exceed the
  // line duration regardless of out-of-order / overlapping / out-of-bounds words
  // (the silent \k for inter-word gaps keeps the sweep in sync).
  const cs = (ms: number) => Math.max(0, Math.round(ms / 10));
  let cursor = cue.startMs;
  const parts: string[] = [];
  for (const w of words) {
    const start = Math.max(cursor, Math.min(w.startMs, cue.endMs));
    const end = Math.max(start, Math.min(w.endMs, cue.endMs));
    if (start > cursor) {
      const gap = cs(start - cursor);
      if (gap > 0) parts.push(`{\\k${gap}}`); // silent lead-in
    }
    // No floor: a clamped/degenerate word gets \k0 (instant) so Σ\k stays exact
    // and can never exceed the line duration.
    const dur = cs(end - start);
    const word = escapeText(w.text);
    if (animation === 'pop') {
      const rel = Math.max(0, Math.round(start - cue.startMs));
      parts.push(
        `{\\k${dur}\\fscx${POP_FROM_SCALE}\\fscy${POP_FROM_SCALE}` +
          `\\t(${rel},${rel + POP_DURATION_MS},\\fscx100\\fscy100)}${word} `,
      );
    } else {
      // karaoke fill sweep
      parts.push(`{\\kf${dur}}${word} `);
    }
    cursor = end;
  }
  return parts.join('').trimEnd();
}

interface AssEvent {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/**
 * Expand one cue into ASS Dialogue events. Most modes are ONE event (the whole
 * line); `word-by-word` and `highlight-box` are one event PER WORD (a single
 * word on screen at a time, fade+pop), giving the max-focus / boxed-word looks.
 */
export function cueEvents(cue: CaptionCue, style: TextStyle): AssEvent[] {
  const animation = style.animation ?? (cue.words && cue.words.length > 0 ? 'karaoke' : 'fade');
  const words = cue.words ?? [];
  if ((animation === 'word-by-word' || animation === 'highlight-box') && words.length > 0) {
    return words.map((w) => ({
      startMs: w.startMs,
      endMs: w.endMs,
      text:
        `{\\fad(60,40)\\fscx${POP_FROM_SCALE}\\fscy${POP_FROM_SCALE}` +
        `\\t(0,${POP_DURATION_MS},\\fscx100\\fscy100)}${escapeText(w.text)}`,
    }));
  }
  return [{ startMs: cue.startMs, endMs: cue.endMs, text: buildCueText(cue, style) }];
}

/** Compile cues + style → a complete ASS file string. */
export function buildAss(cues: readonly CaptionCue[], style: TextStyle, canvas: CaptionCanvas): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildStyleLine(style),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = cues.flatMap((cue) =>
    cueEvents(cue, style).map(
      (ev) => `Dialogue: 0,${msToAssTime(ev.startMs)},${msToAssTime(ev.endMs)},Default,,0,0,0,,${ev.text}`,
    ),
  );
  return [...header, ...events, ''].join('\n');
}
