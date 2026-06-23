import { describe, it, expect } from 'vitest';
import {
  BUILTIN_CAPTION_STYLES,
  getCaptionStyle,
  buildCaptionClips,
  applyCaptionStyle,
  captionWordsFromClips,
  captionLines,
  setCaptionLineText,
  isCaptionClip,
  type CaptionStyle,
} from './caption-styles.js';
import type { AsrWord } from './caption-cues.js';

const WORDS: AsrWord[] = [
  { text: 'crypto', startMs: 0, endMs: 400 },
  { text: 'is', startMs: 400, endMs: 600 },
  { text: 'rewriting', startMs: 600, endMs: 1100 },
  { text: 'money', startMs: 1100, endMs: 1600 },
  { text: 'for', startMs: 1600, endMs: 1800 },
  { text: 'everyone', startMs: 1800, endMs: 2400 },
];
const OPTS = { W: 1080, H: 1920, accent: '#f97316' };
const capText = (clips: ReturnType<typeof buildCaptionClips>) => clips.filter((c) => c.media.kind === 'text');

describe('caption-styles', () => {
  it('exposes the reel styles + a safe default', () => {
    expect(BUILTIN_CAPTION_STYLES.map((s) => s.id)).toEqual(['word-pop', 'one-word', 'karaoke', 'rise']);
    expect(getCaptionStyle('nope').id).toBe('word-pop'); // unknown → default
  });

  it('cue-driven style (word-pop) → ONE clip with cues, tagged + carrying raw words + accent highlight', () => {
    const clips = buildCaptionClips(WORDS, getCaptionStyle('word-pop'), OPTS);
    expect(clips).toHaveLength(1);
    const m = clips[0]!.media as { cues?: unknown[]; style?: { highlightColor?: string; fontSize?: number } };
    expect(m.cues && m.cues.length).toBeTruthy();
    expect(m.style?.highlightColor).toBe('#f97316');
    expect(m.style?.fontSize).toBeGreaterThan(80); // big (0.058 * 1920)
    expect(isCaptionClip(clips[0]!)).toBe(true);
    expect((clips[0]!.metadata as { captionStyle?: string; words?: unknown[] }).captionStyle).toBe('word-pop');
    expect((clips[0]!.metadata as { words?: unknown[] }).words?.length).toBe(WORDS.length); // raw words stashed
  });

  it('one-word style → one word per cue', () => {
    const clips = buildCaptionClips(WORDS, getCaptionStyle('one-word'), OPTS);
    const cues = (clips[0]!.media as { cues?: { text: string }[] }).cues ?? [];
    expect(cues.length).toBe(WORDS.length);
  });

  it('kinetic style (rise) → PER-CUE clips with word motion, no cue block', () => {
    const clips = buildCaptionClips(WORDS, getCaptionStyle('rise'), OPTS);
    expect(clips.length).toBeGreaterThanOrEqual(2);
    expect(clips.every(isCaptionClip)).toBe(true);
    expect((clips[0]!.media as { motion?: { enter?: string } }).motion?.enter).toBe('slideUp');
    expect((clips[0]!.media as { cues?: unknown }).cues).toBeUndefined();
  });

  it('applyCaptionStyle RE-STYLES from the stashed words (round-trips look↔look)', () => {
    const pop = buildCaptionClips(WORDS, getCaptionStyle('word-pop'), OPTS);
    // word-pop (1 cue clip) → rise (per-cue clips)
    const rise = applyCaptionStyle(pop, 'rise', OPTS);
    expect(rise.length).toBeGreaterThanOrEqual(2);
    expect((rise[0]!.media as { motion?: { enter?: string } }).motion?.enter).toBe('slideUp');
    // rise → back to word-pop (1 cue clip) — words survived the round-trip
    const back = applyCaptionStyle(rise, 'word-pop', OPTS);
    expect(back).toHaveLength(1);
    expect((back[0]!.media as { cues?: unknown[] }).cues?.length).toBeTruthy();
    expect((back[0]!.metadata as { words?: unknown[] }).words?.length).toBe(WORDS.length);
  });

  it('detects + restyles an UNTAGGED cue-driven caption (pre-tag back-compat)', () => {
    const pop = buildCaptionClips(WORDS, getCaptionStyle('word-pop'), OPTS);
    // Simulate a pre-tagging project: keep the cues, drop the metadata (no role/words).
    const old = pop.map((c) => ({ ...c, metadata: undefined }));
    expect(isCaptionClip(old[0]!)).toBe(true); // found via media.cues, not the role tag
    const rise = applyCaptionStyle(old, 'rise', OPTS); // recovers words from cue.words
    expect(rise.length).toBeGreaterThanOrEqual(2);
    expect((rise[0]!.media as { motion?: { enter?: string } }).motion?.enter).toBe('slideUp');
    expect((rise[0]!.metadata as { role?: string }).role).toBe('captions'); // re-styling heals the tag
  });

  it('applyCaptionStyle is a no-op when words are unrecoverable', () => {
    const orphan = [{ media: { kind: 'text' as const, text: 'hi' }, at: 0, duration: 1, metadata: { role: 'captions' } }];
    expect(applyCaptionStyle(orphan, 'rise', OPTS)).toBe(orphan);
  });

  it('empty words → no clips', () => {
    expect(buildCaptionClips([], getCaptionStyle('word-pop'), OPTS)).toEqual([]);
  });

  it('captionLines exposes editable lines; setCaptionLineText fixes a word + rebuilds (style kept)', () => {
    const pop = buildCaptionClips(WORDS, getCaptionStyle('word-pop'), OPTS);
    const lines = captionLines(pop);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.text.length).toBeGreaterThan(0);
    // fix a misheard word in line 0
    const edited = setCaptionLineText(pop, 0, 'BITCOIN is', OPTS);
    const words = captionWordsFromClips(edited);
    expect(words.some((w) => w.text === 'BITCOIN')).toBe(true); // edit landed
    expect(words.some((w) => w.text === 'everyone')).toBe(true); // other lines preserved
    expect(edited[0]!.metadata && (edited[0]!.metadata as { captionStyle?: string }).captionStyle).toBe('word-pop'); // style kept
    // out-of-range is a no-op
    expect(setCaptionLineText(pop, 99, 'x', OPTS)).toBe(pop);
  });
});
