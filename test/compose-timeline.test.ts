/**
 * Timeline planner — unit tests (pure). Pins the offset math that drives the
 * xfade graph: total = Σ clipDuration − Σ transitionDuration.
 */

import { describe, it, expect } from 'vitest';
import { planTimeline } from '../src/compose/timeline.js';
import type { Clip } from '../src/compose/schema.js';

const clip = (duration: number, transition?: Clip['transition']): Clip =>
  transition ? { source: 's.mp4', duration, transition } : { source: 's.mp4', duration };

describe('planTimeline', () => {
  it('single clip: total = duration, no transitions', () => {
    const p = planTimeline([clip(4)]);
    expect(p.total).toBe(4);
    expect(p.transitions).toHaveLength(0);
    expect(p.hasTransitions).toBe(false);
  });

  it('two clips with a crossfade: total = Σdur − overlap; correct offset', () => {
    const p = planTimeline([clip(3, { type: 'dissolve', duration: 0.5 }), clip(3)]);
    expect(p.total).toBeCloseTo(5.5, 5); // 3 + 3 − 0.5
    expect(p.transitions[0]).toMatchObject({ type: 'dissolve', duration: 0.5, offset: 2.5 });
  });

  it('three clips: offsets accumulate on the (overlapped) output timeline', () => {
    const p = planTimeline([
      clip(2, { type: 'fade', duration: 0.5 }),
      clip(2, { type: 'fade', duration: 0.5 }),
      clip(2),
    ]);
    expect(p.total).toBeCloseTo(5, 5); // 6 − 1.0
    expect(p.transitions[0]!.offset).toBeCloseTo(1.5, 5); // 2 − 0.5
    expect(p.transitions[1]!.offset).toBeCloseTo(3.0, 5); // (2+2−0.5) − 0.5
  });

  it('respects the invariant total = Σdur − Σtransition for random-ish inputs', () => {
    const durations = [4, 1.5, 2.2, 3];
    const overlaps = [0.4, 0.6, 0.3];
    const clips: Clip[] = durations.map((d, i) =>
      i < overlaps.length ? clip(d, { type: 'wipeleft', duration: overlaps[i]! }) : clip(d),
    );
    const p = planTimeline(clips);
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

  it('resolves duration from out − in', () => {
    const p = planTimeline([{ source: 's.mp4', in: 1, out: 4 }]);
    expect(p.clips[0]!.duration).toBe(3);
    expect(p.clips[0]!.trimStart).toBe(1);
  });

  it('throws on a clip with no duration or out', () => {
    expect(() => planTimeline([{ source: 's.mp4' }])).toThrow();
  });

  it('throws on an empty clip list', () => {
    expect(() => planTimeline([])).toThrow();
  });

  it('throws when a transition is not shorter than both adjacent clips', () => {
    // overlap 1.0 >= left clip 1.0 → invalid xfade
    expect(() =>
      planTimeline([clip(1, { type: 'fade', duration: 1.0 }), clip(3)]),
    ).toThrow();
  });
});
