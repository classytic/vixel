/**
 * Timeline planner — unit tests (pure). Pins the offset math that drives the
 * xfade graph: total = Σ clipDuration − Σ transitionDuration.
 */

import { describe, it, expect } from 'vitest';
import { planTimeline } from '../src/compose/timeline.js';
import type { VisualClip, SequenceTransition } from '../src/compose/schema.js';

/** A sequential (main-track) video clip. `at` is irrelevant to the planner. */
const clip = (duration: number, trimStart?: number): VisualClip => ({
  media: { kind: 'video', source: 's.mp4', ...(trimStart != null ? { trimStart } : {}) },
  at: 0,
  duration,
});

/** A per-track transition between adjacent clip indices [i, i+1]. */
const tr = (i: number, id: string, duration: number): SequenceTransition => ({
  between: [i, i + 1],
  transition: { id, duration },
});

describe('planTimeline — first-class transitions[]', () => {
  it('reads per-track transitions[] by clip-pair, leaving other gaps as hard cuts', () => {
    const p = planTimeline([clip(3), clip(3), clip(3)], undefined, [tr(1, 'cube', 0.5)]);
    expect(p.transitions[0]!.type).toBe('none'); // gap 0 — hard cut
    expect(p.transitions[0]!.duration).toBe(0);
    expect(p.transitions[1]!.type).toBe('cube'); // gap 1 — transition by id
    expect(p.transitions[1]!.duration).toBe(0.5);
    expect(p.total).toBeCloseTo(3 + 3 + 3 - 0.5);
  });

  it('an empty transitions[] list yields all hard cuts', () => {
    const p = planTimeline([clip(3), clip(3)], undefined, []);
    expect(p.transitions[0]!.type).toBe('none'); // explicit empty list → no transitions
  });
});

describe('planTimeline', () => {
  it('single clip: total = duration, no transitions', () => {
    const p = planTimeline([clip(4)]);
    expect(p.total).toBe(4);
    expect(p.transitions).toHaveLength(0);
    expect(p.hasTransitions).toBe(false);
  });

  it('two clips with a crossfade: total = Σdur − overlap; correct offset', () => {
    const p = planTimeline([clip(3), clip(3)], undefined, [tr(0, 'dissolve', 0.5)]);
    expect(p.total).toBeCloseTo(5.5, 5); // 3 + 3 − 0.5
    expect(p.transitions[0]).toMatchObject({ type: 'dissolve', duration: 0.5, offset: 2.5 });
  });

  it('without fps: no frame fields (legacy float behavior)', () => {
    const p = planTimeline([clip(2)]);
    expect(p.fps).toBeUndefined();
    expect(p.totalFrames).toBeUndefined();
    expect(p.clips[0]!.frameDuration).toBeUndefined();
  });

  describe('frame-exact (with fps)', () => {
    it('snaps off-grid durations onto the frame grid and exposes frame positions', () => {
      // 2.0207s @ 24fps = 48.49 frames → snaps to 48 frames = exactly 2.0s
      const p = planTimeline([clip(2.0207), clip(2.0207)], 24, [tr(0, 'dissolve', 0.49)]);
      expect(p.fps).toBe(24);
      expect(p.clips[0]!.frameDuration).toBe(48);
      expect(p.clips[0]!.duration).toBeCloseTo(2.0, 10); // snapped seconds agree with frames
      // 0.49s @ 24 = 11.76 → 12 frames
      expect(p.transitions[0]!.frameDuration).toBe(12);
      expect(p.transitions[0]!.frameOffset).toBe(36); // (48 − 12) frames
      expect(p.totalFrames).toBe(84); // 48 + 48 − 12
    });

    it('totalFrames is the exact zoom domain for a host timeline', () => {
      const p = planTimeline([clip(1), clip(1), clip(1)], 30);
      expect(p.totalFrames).toBe(90);
      expect(p.clips.every((c) => c.frameDuration === 30)).toBe(true);
    });
  });

  it('three clips: offsets accumulate on the (overlapped) output timeline', () => {
    const p = planTimeline([clip(2), clip(2), clip(2)], undefined, [tr(0, 'fade', 0.5), tr(1, 'fade', 0.5)]);
    expect(p.total).toBeCloseTo(5, 5); // 6 − 1.0
    expect(p.transitions[0]!.offset).toBeCloseTo(1.5, 5); // 2 − 0.5
    expect(p.transitions[1]!.offset).toBeCloseTo(3.0, 5); // (2+2−0.5) − 0.5
  });

  it('respects the invariant total = Σdur − Σtransition for random-ish inputs', () => {
    const durations = [4, 1.5, 2.2, 3];
    const overlaps = [0.4, 0.6, 0.3];
    const clips: VisualClip[] = durations.map((d) => clip(d));
    const transitions = overlaps.map((o, i) => tr(i, 'wipeleft', o));
    const p = planTimeline(clips, undefined, transitions);
    const sumDur = durations.reduce((a, b) => a + b, 0);
    const sumOv = overlaps.reduce((a, b) => a + b, 0);
    expect(p.total).toBeCloseTo(sumDur - sumOv, 5);
  });

  it('hard cuts (no transitions): total = Σdur, no overlap', () => {
    const p = planTimeline([clip(2), clip(3)]);
    expect(p.total).toBe(5);
    expect(p.hasTransitions).toBe(false);
    // A hard cut has zero overlap; `offset` (unused for concat) is the cut point.
    expect(p.transitions[0]!.type).toBe('none');
    expect(p.transitions[0]!.duration).toBe(0);
  });

  it('reads the source trim from media.trimStart', () => {
    const p = planTimeline([{ media: { kind: 'video', source: 's.mp4', trimStart: 1 }, at: 0, duration: 3 }]);
    expect(p.clips[0]!.duration).toBe(3);
    expect(p.clips[0]!.trimStart).toBe(1);
  });

  it('throws on a clip with no duration', () => {
    // @ts-expect-error — duration is required in the new model
    expect(() => planTimeline([{ media: { kind: 'video', source: 's.mp4' }, at: 0 }])).toThrow();
  });

  it('throws on an empty clip list', () => {
    expect(() => planTimeline([])).toThrow();
  });

  it('throws when a transition is not shorter than both adjacent clips', () => {
    // overlap 1.0 >= left clip 1.0 → invalid xfade
    expect(() =>
      planTimeline([clip(1), clip(3)], undefined, [tr(0, 'fade', 1.0)]),
    ).toThrow();
  });
});
