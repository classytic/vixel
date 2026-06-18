import { describe, it, expect } from 'vitest';
import { fitScale, clipWindowAt, isIncomingFromPrev, resolveBoxStylePx, gifFrameIndexAt } from './calc.js';

describe('fitScale', () => {
  it('cover fills the box (max ratio → may overflow)', () => {
    // 16:9 source (1920×1080) into a 9:16 box (1080×1920): cover = max(0.5625, 1.777).
    expect(fitScale('cover', 1080, 1920, 1920, 1080)).toBeCloseTo(1080 / 1080 < 1920 / 1080 ? 1920 / 1080 : 1080 / 1920, 5);
    expect(fitScale('cover', 1080, 1920, 1920, 1080)).toBeCloseTo(1.7777, 3);
  });
  it('contain letterboxes (min ratio → fits inside)', () => {
    expect(fitScale('contain', 1080, 1920, 1920, 1080)).toBeCloseTo(0.5625, 4);
  });
  it('stretch returns null (caller sizes to the box)', () => {
    expect(fitScale('stretch', 100, 200, 640, 480)).toBeNull();
  });
  it('returns null when source dimensions are unknown (avoid guessing)', () => {
    expect(fitScale('cover', 100, 200, 0, 0)).toBeNull();
    expect(fitScale('cover', 100, 200, 640, 0)).toBeNull();
  });
  it('square source into square box = 1', () => {
    expect(fitScale('cover', 500, 500, 500, 500)).toBe(1);
    expect(fitScale('contain', 500, 500, 500, 500)).toBe(1);
  });
});

describe('clipWindowAt', () => {
  // clip [0,3) with a 0.5s trailing transition → overlap window [2.5, 3).
  it('on-screen, not transitioning, in the body', () => {
    const w = clipWindowAt(0, 3, 0.5, 1);
    expect(w.onScreen).toBe(true);
    expect(w.inTransition).toBe(false);
    expect(w.progress).toBe(0);
  });
  it('enters the transition window at end − transitionSec', () => {
    expect(clipWindowAt(0, 3, 0.5, 2.4).inTransition).toBe(false);
    const w = clipWindowAt(0, 3, 0.5, 2.5);
    expect(w.inTransition).toBe(true);
    expect(w.overlapStart).toBe(2.5);
    expect(w.progress).toBeCloseTo(0, 5);
  });
  it('progress ramps 0→1 across the window', () => {
    expect(clipWindowAt(0, 3, 0.5, 2.75).progress).toBeCloseTo(0.5, 5);
    expect(clipWindowAt(0, 3, 0.5, 2.999).progress).toBeCloseTo(0.998, 2);
  });
  it('off-screen past the end', () => {
    const w = clipWindowAt(0, 3, 0.5, 3);
    expect(w.onScreen).toBe(false);
    expect(w.inTransition).toBe(false);
  });
  it('no transition → never inTransition', () => {
    expect(clipWindowAt(0, 3, 0, 2.9).inTransition).toBe(false);
  });
});

describe('isIncomingFromPrev', () => {
  const prev = { endSec: 3, transitionSec: 0.5 }; // transition window [2.5, 3)
  it('true inside the previous clip transition window (this clip is the :in side)', () => {
    expect(isIncomingFromPrev(prev, 2.5)).toBe(true);
    expect(isIncomingFromPrev(prev, 2.9)).toBe(true);
  });
  it('false before the window and at/after the end', () => {
    expect(isIncomingFromPrev(prev, 2.49)).toBe(false);
    expect(isIncomingFromPrev(prev, 3)).toBe(false);
  });
  it('false with no previous clip or no transition', () => {
    expect(isIncomingFromPrev(undefined, 2.6)).toBe(false);
    expect(isIncomingFromPrev({ endSec: 3, transitionSec: 0 }, 2.6)).toBe(false);
  });
});

describe('gifFrameIndexAt', () => {
  // 3 frames, 100ms each → cumulative ends [100, 200, 300], total 300ms.
  const ends = [100, 200, 300];
  it('picks the frame whose window contains the time', () => {
    expect(gifFrameIndexAt(ends, 0)).toBe(0);
    expect(gifFrameIndexAt(ends, 99)).toBe(0);
    expect(gifFrameIndexAt(ends, 100)).toBe(1);
    expect(gifFrameIndexAt(ends, 250)).toBe(2);
  });
  it('loops modulo the total duration', () => {
    expect(gifFrameIndexAt(ends, 300)).toBe(0); // wraps to start
    expect(gifFrameIndexAt(ends, 350)).toBe(0);
    expect(gifFrameIndexAt(ends, 450)).toBe(1);
  });
  it('handles negative time (wrap) and empty input', () => {
    expect(gifFrameIndexAt(ends, -50)).toBe(2); // -50 → 250 → frame 2
    expect(gifFrameIndexAt([], 10)).toBe(0);
    expect(gifFrameIndexAt([0], 10)).toBe(0); // zero-total guard
  });
});

describe('resolveBoxStylePx', () => {
  it('radius is a fraction of the shorter side, clamped to half', () => {
    expect(resolveBoxStylePx({ radius: 0.1 } as never, 1000, 400).radiusPx).toBeCloseTo(40, 5); // 0.1 × 400
    expect(resolveBoxStylePx({ radius: 0.9 } as never, 1000, 400).radiusPx).toBe(200); // clamped to short/2
  });
  it('border width is a fraction of the shorter side', () => {
    expect(resolveBoxStylePx({ border: { width: 0.02, color: '#fff' } } as never, 400, 1000).borderPx).toBeCloseTo(8, 5);
  });
  it('shadow resolves offset/blur from fractions with sensible defaults', () => {
    const s = resolveBoxStylePx({ shadow: {} } as never, 400, 1000);
    expect(s.shadow).toEqual({ ox: 0, oy: 0.04 * 400, blur: 0.04 * 400 });
    expect(resolveBoxStylePx({ shadow: { x: 0.01, y: 0.02, blur: 0.03 } } as never, 400, 1000).shadow).toEqual({ ox: 4, oy: 8, blur: 12 });
  });
  it('no style → zeros + null shadow', () => {
    expect(resolveBoxStylePx(undefined, 100, 100)).toEqual({ radiusPx: 0, borderPx: 0, shadow: null });
  });
});
