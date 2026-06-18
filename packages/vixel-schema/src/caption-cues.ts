/**
 * ASR → caption cue builder. Turns a flat stream of word-level timestamps (from any
 * speech-to-text provider — Whisper, WhisperX, Deepgram, …) into broadcast-quality
 * {@link CaptionCue}s: well-segmented, readable, flicker-free, karaoke-ready.
 *
 * This is the part of caption quality that the ASR model does NOT give you. Raw word
 * timestamps are just dots on a timeline; turning them into cues a human can read at
 * speed is a SEGMENTATION + TIMING problem, and that is what lives here. It is a PURE
 * function (no DOM, no canvas, no fonts) so it runs identically in the browser, on a
 * server, in a worker, or in a test — the same VixelSpec-contract philosophy as the
 * rest of vixel. Transcription itself is deliberately NOT vixel's job; feed it the
 * tokens and it returns cues.
 *
 * Why pure char-budget instead of pixel measurement (the approach naive editors take
 * with a hidden `<canvas>`): professional subtitle practice (BBC/Netflix/EBU) caps
 * CHARACTERS-PER-LINE, not pixels — it is font-agnostic, deterministic, and matches
 * how reading-speed limits are defined (characters-per-second). A caller that truly
 * needs proportional fitting can pass a `charWidth` model; the default treats every
 * glyph as one unit, which is what CPL guidelines assume.
 *
 * The segmentation is MULTI-SIGNAL, in priority order — the thing width-only splitters
 * miss. A cue ends at, strongest first:
 *   1. a sentence end (`.`/`!`/`?`)            — the most natural boundary
 *   2. a long silence (gap ≥ `pauseMs`)        — speech paused → the line should too
 *   3. a clause break (`,`/`;`/`:`) near budget — a graceful soft break
 *   4. the line/char budget running out         — the hard fallback
 *   5. the max cue duration being hit           — never let one cue linger
 *
 * Then every cue gets TIMING HYGIENE the raw tokens lack: monotonic non-overlapping
 * words (ASR drift repaired), a minimum on-screen read time, a reading-speed cap
 * (extend a too-fast cue if there is room before the next one), a short hold toward
 * the next cue so captions don't flicker off in the micro-gaps between words, a max
 * duration cap, and optional frame snapping.
 */
import type { CaptionCue, CaptionWord } from './captions.js';

/** One ASR token: the spoken word and its absolute time window (ms from media start). */
export interface AsrWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** Tuning for {@link buildCaptionCues}. Every default targets readable short-form (TikTok/Reels) captions. */
export interface BuildCaptionsOptions {
  /** Max characters per line before wrapping (broadcast standard ~42; short-form ~24). Default 30. */
  readonly maxCharsPerLine?: number;
  /** Max lines per cue. Default 2. A cue that would need more lines is split. */
  readonly maxLines?: number;
  /** Hard cap on how long one cue may stay up (ms). Default 5000. */
  readonly maxCueMs?: number;
  /** Floor on a cue's on-screen time (ms) so a short line is still readable. Default 900. */
  readonly minCueMs?: number;
  /** Reading-speed cap in characters/second; a cue shorter than its text needs is
   *  extended toward the next cue. ~17 CPS is the adult comfort limit. Default 17. */
  readonly maxCps?: number;
  /** A silence ≥ this between two words forces a cue break before the later word (ms). Default 350. */
  readonly pauseMs?: number;
  /** Max time a cue may be HELD past its last word, toward the next cue, to kill
   *  flicker in the micro-gaps between phrases (ms). Default 200. */
  readonly gapHoldMs?: number;
  /** Always leave at least this gap between adjacent cues (ms) so they don't visually merge. Default 40. */
  readonly minGapMs?: number;
  /** Minimum duration forced onto any single word window (ms), repairing zero/negative ASR spans. Default 60. */
  readonly minWordMs?: number;
  /** If set, snap every cue boundary to a frame edge at this fps (keeps preview ≈ export). */
  readonly fps?: number;
  /** `'phrase'` (default) groups words into readable lines; `'word'` emits ONE word per
   *  cue (the CapCut single-word "bounce" style). */
  readonly mode?: 'phrase' | 'word';
  /** Optional proportional width model (units per char) for callers that want true
   *  font fitting; omit for the default 1-unit-per-char CPL model. */
  readonly charWidth?: (ch: string) => number;
}

interface ResolvedOptions {
  maxCharsPerLine: number;
  maxLines: number;
  maxCueMs: number;
  minCueMs: number;
  maxCps: number;
  pauseMs: number;
  gapHoldMs: number;
  minGapMs: number;
  minWordMs: number;
  fps: number | undefined;
  mode: 'phrase' | 'word';
  charWidth: (ch: string) => number;
}

const DEFAULTS: ResolvedOptions = {
  maxCharsPerLine: 30,
  maxLines: 2,
  maxCueMs: 5000,
  minCueMs: 900,
  maxCps: 17,
  pauseMs: 350,
  gapHoldMs: 200,
  minGapMs: 40,
  minWordMs: 60,
  fps: undefined,
  mode: 'phrase',
  charWidth: () => 1,
};

const SENTENCE_END = /[.!?]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;

/** Visual length of a string under the (default unit, or caller-supplied) width model. */
function lineLen(text: string, charWidth: (ch: string) => number): number {
  let n = 0;
  for (const ch of text) n += charWidth(ch);
  return n;
}

/**
 * Greedily wrap words onto ≤ `maxLines` lines bounded by `maxCharsPerLine`. Returns the
 * wrapped lines and whether they fit; `fits === false` means this word set overflows the
 * box and the caller must close the cue before adding more. A single word longer than a
 * line is allowed to occupy its own (over-long) line rather than being dropped.
 */
function wrap(words: readonly string[], o: ResolvedOptions): { lines: string[]; fits: boolean } {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (line && lineLen(candidate, o.charWidth) > o.maxCharsPerLine) {
      lines.push(line);
      line = w;
      if (lines.length >= o.maxLines) return { lines: [...lines, line], fits: false };
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return { lines, fits: lines.length <= o.maxLines };
}

/**
 * Repair raw ASR tokens into a clean, strictly forward, non-overlapping stream:
 * trim empties, sort by start, force each window to last ≥ `minWordMs`, and push each
 * word's start to at least the previous word's end (ASR timings sometimes overlap or
 * step backwards). Absolute ms throughout — the renderer reads absolute word times.
 */
function sanitize(words: readonly AsrWord[], o: ResolvedOptions): AsrWord[] {
  const cleaned = words
    .map((w) => ({ text: w.text.trim(), startMs: w.startMs, endMs: w.endMs }))
    .filter((w) => w.text.length > 0 && Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  const out: AsrWord[] = [];
  let cursor = -Infinity;
  for (const w of cleaned) {
    const startMs = Math.max(w.startMs, cursor);
    const endMs = Math.max(w.endMs, startMs + o.minWordMs);
    out.push({ text: w.text, startMs, endMs });
    cursor = endMs;
  }
  return out;
}

/** Group sanitized words into cue-sized runs using the multi-signal break priority. */
function segment(words: readonly AsrWord[], o: ResolvedOptions): AsrWord[][] {
  if (o.mode === 'word') return words.map((w) => [w]);

  const cues: AsrWord[][] = [];
  let run: AsrWord[] = [];

  const flush = () => {
    if (run.length) cues.push(run);
    run = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prev = run[run.length - 1];

    // (2) A long silence before this word → break BEFORE it.
    if (prev && word.startMs - prev.endMs >= o.pauseMs) flush();

    // (4) Width: would adding this word overflow the box? Break BEFORE it.
    if (run.length) {
      const texts = [...run, word].map((w) => w.text);
      if (!wrap(texts, o).fits) flush();
    }

    // (5) Duration: would this word push the cue past the max? Break BEFORE it.
    if (run.length && word.endMs - run[0].startMs > o.maxCueMs) flush();

    run.push(word);

    // (1) Sentence end → break AFTER this word (hard, highest-priority boundary).
    if (SENTENCE_END.test(word.text)) {
      flush();
      continue;
    }

    // (3) Clause end → break AFTER it only once the cue is "full enough" (≥60% of a
    //     line), so we split on a comma near the budget rather than mid-phrase.
    if (CLAUSE_END.test(word.text)) {
      const len = lineLen(run.map((w) => w.text).join(' '), o.charWidth);
      if (len >= o.maxCharsPerLine * 0.6) flush();
    }
  }
  flush();
  return cues;
}

/**
 * Pull a lone trailing word back onto the previous cue when the previous cue still has
 * room — a single dangling word ("orphan") reads badly. Only merges when the result
 * still fits the box and the time gap is small (same breath).
 */
function fixOrphans(cues: AsrWord[][], o: ResolvedOptions): AsrWord[][] {
  for (let i = 1; i < cues.length; i++) {
    const cur = cues[i];
    const prev = cues[i - 1];
    if (cur.length !== 1) continue;
    const merged = [...prev, ...cur];
    const closeInTime = cur[0].startMs - prev[prev.length - 1].endMs < o.pauseMs;
    if (closeInTime && wrap(merged.map((w) => w.text), o).fits && merged[merged.length - 1].endMs - merged[0].startMs <= o.maxCueMs) {
      cues[i - 1] = merged;
      cues.splice(i, 1);
      i--;
    }
  }
  return cues;
}

function snap(ms: number, fps: number | undefined): number {
  if (!fps) return ms;
  const frame = 1000 / fps;
  return Math.round(ms / frame) * frame;
}

/**
 * Build readable, flicker-free, karaoke-ready {@link CaptionCue}s from ASR word tokens.
 *
 * The returned cues carry per-word ABSOLUTE timings (`words[].startMs/endMs`), exactly
 * what the karaoke/highlight renderer samples — so word-level animation tracks the
 * voice with no extra wiring. The cue `text` is the wrapped lines joined by `\n`.
 *
 * Pure and deterministic: same tokens + options → same cues, anywhere.
 */
export function buildCaptionCues(words: readonly AsrWord[], options: BuildCaptionsOptions = {}): CaptionCue[] {
  const o: ResolvedOptions = { ...DEFAULTS, ...options };
  const clean = sanitize(words, o);
  if (clean.length === 0) return [];

  // Orphan-fixing is a phrase concern; in word mode one-word cues ARE the intent.
  const segments = segment(clean, o);
  const groups = o.mode === 'word' ? segments : fixOrphans(segments, o);

  // First pass: raw cue text + word windows straight from the (repaired) tokens.
  const draft = groups.map((run) => {
    const text = wrap(run.map((w) => w.text), o).lines.join('\n');
    const cueWords: CaptionWord[] = run.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }));
    return { text, words: cueWords, startMs: run[0].startMs, endMs: run[run.length - 1].endMs };
  });

  // Second pass: timing hygiene. Each cue may borrow time UP TO the next cue's start
  // (minus a guaranteed `minGapMs`) to satisfy the read-time floor, the reading-speed
  // cap, and the anti-flicker hold — none of which may ever cause an overlap.
  const cues: CaptionCue[] = [];
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    const next = draft[i + 1];
    const ceil = next ? next.startMs - o.minGapMs : Infinity;

    let endMs = d.endMs;
    const visibleChars = d.text.replace(/\n/g, ' ').length;

    // read-time floor + reading-speed cap (whichever needs more time wins)
    const needForSpeed = (visibleChars / o.maxCps) * 1000;
    const wanted = d.startMs + Math.max(o.minCueMs, needForSpeed);
    endMs = Math.max(endMs, Math.min(wanted, ceil));

    // anti-flicker hold toward the next cue (bounded by gapHoldMs and the ceiling)
    endMs = Math.min(Math.max(endMs, Math.min(d.endMs + o.gapHoldMs, ceil)), ceil);

    // max-duration cap, then never shorter than its own last word
    endMs = Math.min(endMs, d.startMs + o.maxCueMs);
    endMs = Math.max(endMs, d.words[d.words.length - 1].endMs);

    const startMs = snap(d.startMs, o.fps);
    cues.push({
      text: d.text,
      startMs,
      endMs: Math.max(snap(endMs, o.fps), startMs + Math.round(1000 / (o.fps ?? 1000))),
      words: d.words,
    });
  }
  return cues;
}
