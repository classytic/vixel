/**
 * buildCaptionCues — ASR tokens → readable, flicker-free, karaoke-ready cues. Tests the
 * segmentation SIGNALS (pause / sentence / clause / width / duration), the timing
 * hygiene (monotonic repair, read-floor, speed cap, hold, no overlap), and determinism.
 */
import { describe, it, expect } from 'vitest';
import { buildCaptionCues, type AsrWord } from '../src/index.js';

/** Build an evenly-spaced word stream: each word `gap` ms after the previous, `len` ms long. */
const stream = (texts: string[], len = 300, gap = 0, start = 0): AsrWord[] => {
  let t = start;
  return texts.map((text) => {
    const w = { text, startMs: t, endMs: t + len };
    t += len + gap;
    return w;
  });
};

describe('buildCaptionCues', () => {
  it('returns nothing for empty / blank input', () => {
    expect(buildCaptionCues([])).toEqual([]);
    expect(buildCaptionCues([{ text: '  ', startMs: 0, endMs: 100 }])).toEqual([]);
  });

  it('breaks on a long silence (pause signal)', () => {
    // two tight words, a 600ms pause, then two more → two cues
    const words = [
      { text: 'hello', startMs: 0, endMs: 300 },
      { text: 'there', startMs: 300, endMs: 600 },
      { text: 'general', startMs: 1200, endMs: 1500 }, // 600ms gap
      { text: 'kenobi', startMs: 1500, endMs: 1800 },
    ];
    const cues = buildCaptionCues(words, { pauseMs: 350, gapHoldMs: 0, minCueMs: 0, maxCps: 1000 });
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('hello there');
    expect(cues[1].text).toBe('general kenobi');
  });

  it('breaks after sentence-ending punctuation', () => {
    const words = stream(['Stop.', 'We', 'go', 'now']);
    const cues = buildCaptionCues(words, { pauseMs: 9999, maxCharsPerLine: 100, minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    expect(cues[0].text).toBe('Stop.');
    expect(cues[1].text).toBe('We go now');
  });

  it('wraps within the char budget and splits when the box is full', () => {
    // maxCharsPerLine 10, maxLines 1 → each ~ word pair fills a line
    const words = stream(['aaaa', 'bbbb', 'cccc', 'dddd']); // "aaaa bbbb" = 9 chars fits, +cccc overflows
    const cues = buildCaptionCues(words, { maxCharsPerLine: 10, maxLines: 1, pauseMs: 9999, minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    expect(cues[0].text).toBe('aaaa bbbb');
    expect(cues[1].text).toBe('cccc dddd');
    expect(cues[0].text.includes('\n')).toBe(false);
  });

  it('wraps onto a second line before splitting when maxLines=2', () => {
    const words = stream(['aaaa', 'bbbb', 'cccc']); // line1 "aaaa bbbb", line2 "cccc"
    const cues = buildCaptionCues(words, { maxCharsPerLine: 10, maxLines: 2, pauseMs: 9999, minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('aaaa bbbb\ncccc');
  });

  it('word mode emits one cue per word with absolute karaoke timings', () => {
    const words = stream(['one', 'two', 'three'], 200, 0);
    const cues = buildCaptionCues(words, { mode: 'word', minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    expect(cues.map((c) => c.text)).toEqual(['one', 'two', 'three']);
    expect(cues[1].words?.[0]).toEqual({ text: 'two', startMs: 200, endMs: 400 });
  });

  it('repairs overlapping / backwards ASR timings into a monotonic stream', () => {
    const words: AsrWord[] = [
      { text: 'a', startMs: 100, endMs: 400 },
      { text: 'b', startMs: 200, endMs: 150 }, // starts before a ends AND ends before it starts
    ];
    const cues = buildCaptionCues(words, { minWordMs: 60, pauseMs: 9999, maxCharsPerLine: 100, minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    const [wa, wb] = cues[0].words!;
    expect(wb.startMs).toBeGreaterThanOrEqual(wa.endMs); // pushed forward
    expect(wb.endMs).toBeGreaterThanOrEqual(wb.startMs + 60); // min word duration enforced
  });

  it('never lets cues overlap, even when extending for read-time', () => {
    // tiny words back-to-back; minCueMs would want to stretch them past each other
    const words = stream(['hi', 'yo', 'ok'], 100, 500); // 500ms gaps → 3 separate cues
    const cues = buildCaptionCues(words, { minCueMs: 2000, minGapMs: 40, pauseMs: 350 });
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startMs - cues[i - 1].endMs).toBeGreaterThanOrEqual(40 - 1);
    }
  });

  it('enforces a minimum on-screen read time when there is room', () => {
    const words = [{ text: 'go', startMs: 0, endMs: 120 }]; // 120ms is too short to read
    const cues = buildCaptionCues(words, { minCueMs: 900, gapHoldMs: 0 });
    expect(cues[0].endMs - cues[0].startMs).toBeGreaterThanOrEqual(900);
  });

  it('pulls a lone orphan word back onto the previous cue when it fits', () => {
    // "hello world" then a close "ok" that would otherwise be its own one-word cue
    const words = [
      { text: 'hello', startMs: 0, endMs: 300 },
      { text: 'world.', startMs: 300, endMs: 600 },
      { text: 'ok', startMs: 650, endMs: 900 },
    ];
    // sentence break after "world." would orphan "ok"; orphan-fix should re-merge it
    const cues = buildCaptionCues(words, { maxCharsPerLine: 100, pauseMs: 9999, minCueMs: 0, maxCps: 1000, gapHoldMs: 0 });
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toContain('ok');
  });

  it('is deterministic (same input → identical output)', () => {
    const words = stream(['the', 'quick', 'brown', 'fox', 'jumps'], 250, 50);
    expect(buildCaptionCues(words)).toEqual(buildCaptionCues(words));
  });

  it('snaps boundaries to frame edges when fps is given', () => {
    const words = stream(['frame', 'snap', 'test'], 333, 17);
    const fps = 30;
    const frame = 1000 / fps;
    const cues = buildCaptionCues(words, { fps });
    for (const c of cues) {
      expect(Math.abs(c.startMs / frame - Math.round(c.startMs / frame))).toBeLessThan(1e-6);
      expect(Math.abs(c.endMs / frame - Math.round(c.endMs / frame))).toBeLessThan(1e-6);
    }
  });
});
