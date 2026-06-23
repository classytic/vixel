/**
 * Caption STYLES — the reel-caption "looks" the agent applies at generation AND the
 * editor lets a user switch (the CapCut "caption template" experience).
 * ============================================================================
 * A caption style is a curated COMBO of: how the VO words CHUNK into cues (few big
 * words vs one-at-a-time), the text LOOK, the ON-SCREEN POSITION, and the ANIMATION
 * (cue-driven karaoke/pop, or per-cue kinetic entrances like a rise). It is pure DATA
 * (like {@link BUILTIN_TEXT_PRESETS}) plus two pure builders, so BOTH the backend
 * (generation) and the editor (re-style on click) produce identical caption tracks —
 * one source of truth, no React/engine dependency.
 *
 * The reel rule baked in: keep WORDS FEW and TYPE BIG (sizes are fractions of canvas
 * height); the chunker enforces the word count, not a shrink-to-fit.
 */
import type { TextStyle, CaptionCue } from './captions.js';
import type { TextMotion } from './text-motion.js';
import type { AsrWord, BuildCaptionsOptions } from './caption-cues.js';
import { buildCaptionCues } from './caption-cues.js';
import type { VisualClip } from './visual.js';

export interface CaptionStyle {
  id: string;
  name: string;
  /** Coarse grouping for the gallery browser. */
  category?: string;
  /** Cue chunking — controls WORDS PER CUE (the reel "2-3 words" rule). */
  chunk: BuildCaptionsOptions;
  /** true → one TEXT CLIP per cue carrying `motion` (kinetic entrances, e.g. rise);
   *  false → one cue-driven clip whose `style.animation` activates each word. */
  perCue: boolean;
  /** Normalized 0..1 placement — always OUT of the centre so captions never collide
   *  with a centred hero stat/title. */
  frame: { x: number; y: number; w: number; h: number };
  /** Font size as a FRACTION of canvas height (kept big; words stay few). */
  sizeFrac: number;
  /** Vertical block placement within `frame`. */
  alignment?: NonNullable<TextStyle['alignment']>;
  /** Cue-driven caption animation (perCue:false). */
  animation?: TextStyle['animation'];
  /** Per-cue word entrance (perCue:true). */
  motion?: TextMotion;
}

const PUNCH: BuildCaptionsOptions = { mode: 'phrase', maxCharsPerLine: 14, maxLines: 1, pauseMs: 550, minCueMs: 500 };

/** The built-in reel caption styles (the gallery + the agent's per-pack defaults). */
export const BUILTIN_CAPTION_STYLES: CaptionStyle[] = [
  {
    id: 'word-pop',
    name: 'Word Pop',
    category: 'Reels',
    chunk: PUNCH,
    perCue: false,
    frame: { x: 0.08, y: 0.62, w: 0.84, h: 0.3 },
    sizeFrac: 0.058,
    alignment: 'bottom',
    animation: 'word-by-word',
  },
  {
    id: 'one-word',
    name: 'One Word',
    category: 'Reels',
    chunk: { mode: 'word' },
    perCue: false,
    frame: { x: 0.06, y: 0.4, w: 0.88, h: 0.24 },
    sizeFrac: 0.1,
    alignment: 'center',
    animation: 'pop',
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    category: 'Reels',
    chunk: { mode: 'phrase', maxCharsPerLine: 22, maxLines: 2, pauseMs: 600, minCueMs: 700 },
    perCue: false,
    frame: { x: 0.08, y: 0.66, w: 0.84, h: 0.28 },
    sizeFrac: 0.044,
    alignment: 'bottom',
    animation: 'karaoke',
  },
  {
    id: 'rise',
    name: 'Rise',
    category: 'Reels',
    chunk: PUNCH,
    perCue: true,
    frame: { x: 0.08, y: 0.6, w: 0.84, h: 0.3 },
    sizeFrac: 0.058,
    alignment: 'bottom',
    motion: { by: 'word', enter: 'slideUp', stagger: 0.05 },
  },
];

export const DEFAULT_CAPTION_STYLE_ID = 'word-pop';

export function listCaptionStyles(): CaptionStyle[] {
  return BUILTIN_CAPTION_STYLES;
}
export function getCaptionStyle(id?: string | null): CaptionStyle {
  return BUILTIN_CAPTION_STYLES.find((s) => s.id === id) ?? BUILTIN_CAPTION_STYLES[0]!;
}

/** The resolved {@link TextStyle} for a caption style (big, stroked, accent-highlight). */
export function captionTextStyle(style: CaptionStyle, accent: string, H: number): TextStyle {
  const px = (frac: number) => Math.round(frac * H);
  return {
    fontSize: px(style.sizeFrac),
    bold: true,
    fillColor: '#ffffff',
    highlightColor: accent,
    align: 'center',
    alignment: style.alignment ?? 'bottom',
    stroke: { width: Math.max(3, px(0.006)), color: '#000000' },
    shadow: { depth: Math.max(2, px(0.003)), color: '#000000cc', blur: px(0.005) },
    ...(style.animation ? { animation: style.animation } : {}),
  };
}

export interface CaptionBuildOpts {
  W: number;
  H: number;
  accent: string;
}

/**
 * Build the caption-track CLIPS from raw ASR WORDS (absolute-ms timeline) in a given
 * style. The first clip carries `metadata.words` (the raw word stream) so the editor
 * can RE-STYLE to any other style later without re-transcribing. Pure + deterministic.
 */
export function buildCaptionClips(words: AsrWord[], style: CaptionStyle, opts: CaptionBuildOpts): VisualClip[] {
  if (!words.length) return [];
  const cues = buildCaptionCues(words, style.chunk);
  if (!cues.length) return [];
  const st = captionTextStyle(style, opts.accent, opts.H);
  const frame = { ...style.frame };
  const tag = (first: boolean): Record<string, unknown> =>
    first ? { role: 'captions', captionStyle: style.id, words } : { role: 'captions', captionStyle: style.id };

  if (style.perCue) {
    // Kinetic styles (rise): one clip per cue so words animate IN per cue (TextMotion).
    return cues.map((q, i) => ({
      media: { kind: 'text' as const, text: q.text, style: st, ...(style.motion ? { motion: style.motion } : {}) },
      at: q.startMs / 1000,
      duration: Math.max(0.2, (q.endMs - q.startMs) / 1000),
      transform: { frame: { ...frame } },
      exit: 'fadeOut' as const,
      metadata: tag(i === 0),
    }));
  }
  // Cue-driven: ONE clip whose style.animation activates each word over the cue list.
  const span = (cues[cues.length - 1]!.endMs ?? 0) / 1000;
  return [
    {
      media: { kind: 'text' as const, text: '', style: st, cues },
      at: 0,
      duration: Math.max(0.2, span),
      transform: { frame: { ...frame } },
      metadata: tag(true),
    },
  ];
}

/**
 * Is this clip part of the caption track? Tagged clips (`metadata.role:'captions'`,
 * the path {@link buildCaptionClips} stamps) AND — for BACK-COMPAT with projects made
 * before tagging — any cue-bearing text clip (a running caption is a text clip with
 * `media.cues`). So the editor finds + restyles old captions without re-generation.
 */
export function isCaptionClip(clip: VisualClip): boolean {
  if ((clip.metadata as { role?: string } | undefined)?.role === 'captions') return true;
  return clip.media.kind === 'text' && !!(clip.media as { cues?: unknown[] }).cues?.length;
}

/**
 * Recover the raw ASR word stream from caption clips — preferring the stash on
 * `metadata.words` (new projects), else flattening per-word timings out of the
 * clips' `cues` (old cue-driven captions). A cue with no per-word timings degrades
 * to one token per cue. Pure.
 */
export function captionWordsFromClips(clips: VisualClip[]): AsrWord[] {
  const stashed = clips.find((c) => (c.metadata as { words?: AsrWord[] } | undefined)?.words?.length);
  const fromMeta = (stashed?.metadata as { words?: AsrWord[] } | undefined)?.words;
  if (fromMeta?.length) return fromMeta;
  const words: AsrWord[] = [];
  for (const c of clips) {
    const cues = (c.media as { cues?: CaptionCue[] }).cues;
    if (!cues) continue;
    for (const q of cues) {
      if (q.words?.length) for (const w of q.words) words.push({ text: w.text, startMs: w.startMs, endMs: w.endMs });
      else words.push({ text: q.text, startMs: q.startMs, endMs: q.endMs });
    }
  }
  return words;
}

/**
 * RE-STYLE an existing caption track to a different style — recovers the words (stash
 * or cues, see {@link captionWordsFromClips}) and rebuilds in the new style. Returns
 * the original clips unchanged if the words aren't recoverable. Pure.
 */
export function applyCaptionStyle(captionClips: VisualClip[], styleId: string, opts: CaptionBuildOpts): VisualClip[] {
  const words = captionWordsFromClips(captionClips);
  if (!words.length) return captionClips;
  return buildCaptionClips(words, getCaptionStyle(styleId), opts);
}

/** One editable caption line (a cue, or a per-cue clip) — for a transcript editor. */
export interface CaptionLine {
  text: string;
  startMs: number;
  endMs: number;
}

/** The currently-applied caption style id (off the track's clips), or the default. */
function currentCaptionStyleId(clips: VisualClip[]): string {
  const id = clips.map((c) => (c.metadata as { captionStyle?: string } | undefined)?.captionStyle).find(Boolean);
  return id ?? DEFAULT_CAPTION_STYLE_ID;
}

/** Split a line's text into evenly-timed words across its window (for an edited line). */
function lineToWords(text: string, startMs: number, endMs: number): AsrWord[] {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const span = Math.max(1, endMs - startMs);
  const per = span / toks.length;
  return toks.map((t, i) => ({ text: t, startMs: Math.round(startMs + i * per), endMs: Math.round(startMs + (i + 1) * per) }));
}

/** Per-line WORDS: a cue's own `words` (preserve timing), else even-split its text. */
function captionLineWords(clips: VisualClip[]): { line: CaptionLine; words: AsrWord[] }[] {
  const cueClip = clips.find((c) => (c.media as { cues?: CaptionCue[] }).cues?.length);
  if (cueClip) {
    const cues = (cueClip.media as { cues: CaptionCue[] }).cues;
    return cues.map((q) => ({
      line: { text: q.text, startMs: q.startMs, endMs: q.endMs },
      words: q.words?.length ? q.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })) : lineToWords(q.text, q.startMs, q.endMs),
    }));
  }
  // per-cue (rise): each text clip is a line; words aren't stored → even-split.
  return clips
    .filter((c) => c.media.kind === 'text')
    .map((c) => {
      const startMs = Math.round((c.at ?? 0) * 1000);
      const endMs = Math.round(((c.at ?? 0) + (c.duration ?? 0)) * 1000);
      const text = (c.media as { text?: string }).text ?? '';
      return { line: { text, startMs, endMs }, words: lineToWords(text, startMs, endMs) };
    });
}

/** The editable caption LINES (cues / per-cue clips) — drives a transcript editor. */
export function captionLines(clips: VisualClip[]): CaptionLine[] {
  return captionLineWords(clips).map((l) => l.line);
}

/**
 * EDIT one caption line's text (fix a misheard word, etc.) and rebuild the caption
 * track in its CURRENT style — the edited line is re-tokenized across its time window;
 * every other line keeps its words/timing. Pure; returns the original clips if the
 * index is out of range. Works for cue-driven AND per-cue (rise) styles.
 */
export function setCaptionLineText(clips: VisualClip[], lineIndex: number, newText: string, opts: CaptionBuildOpts): VisualClip[] {
  const per = captionLineWords(clips);
  if (lineIndex < 0 || lineIndex >= per.length) return clips;
  per[lineIndex] = { line: { ...per[lineIndex]!.line, text: newText }, words: lineToWords(newText, per[lineIndex]!.line.startMs, per[lineIndex]!.line.endMs) };
  const words = per.flatMap((l) => l.words);
  if (!words.length) return clips;
  return buildCaptionClips(words, getCaptionStyle(currentCaptionStyleId(clips)), opts);
}
