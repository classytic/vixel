/**
 * Keyframe channel — the ONE animation primitive. Sampling rules (clamped
 * endpoints, per-segment easing, hold/step) + the pure edit ops the editor's
 * right-click menu calls (upsert / remove at the playhead). All deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  sampleChannel,
  upsertKeyframe,
  removeKeyframeAt,
  keyframeIndexAt,
  hasKeyframeAt,
  type Keyframe,
} from '../src/index.js';

describe('sampleChannel', () => {
  it('empty channel → undefined (caller uses the static value)', () => {
    expect(sampleChannel(undefined, 1)).toBeUndefined();
    expect(sampleChannel([], 1)).toBeUndefined();
  });

  it('single keyframe → its value everywhere', () => {
    const k: Keyframe[] = [{ t: 2, value: 0.7 }];
    expect(sampleChannel(k, 0)).toBe(0.7);
    expect(sampleChannel(k, 2)).toBe(0.7);
    expect(sampleChannel(k, 99)).toBe(0.7);
  });

  it('clamps endpoints (hold before first + after last)', () => {
    const k: Keyframe[] = [{ t: 1, value: 0 }, { t: 3, value: 10 }];
    expect(sampleChannel(k, 0)).toBe(0); // before first
    expect(sampleChannel(k, 5)).toBe(10); // after last
    expect(sampleChannel(k, 1)).toBe(0); // exactly first
    expect(sampleChannel(k, 3)).toBe(10); // exactly last
  });

  it('linear interpolates across a segment', () => {
    const k: Keyframe[] = [{ t: 0, value: 0, easing: 'linear' }, { t: 2, value: 100 }];
    expect(sampleChannel(k, 1)).toBeCloseTo(50);
    expect(sampleChannel(k, 0.5)).toBeCloseTo(25);
  });

  it('the volume-envelope shape (100 → 25 → 100) samples its dip', () => {
    const env: Keyframe[] = [
      { t: 0, value: 100, easing: 'linear' },
      { t: 1, value: 25, easing: 'hold' },
      { t: 3, value: 25, easing: 'linear' },
      { t: 4, value: 100 },
    ];
    expect(sampleChannel(env, 0.5)).toBeCloseTo(62.5); // ramping down
    expect(sampleChannel(env, 2)).toBe(25); // held low (hold segment)
    expect(sampleChannel(env, 3.5)).toBeCloseTo(62.5); // ramping back up
  });

  it('`hold` easing steps (value stays until the next key)', () => {
    const k: Keyframe[] = [{ t: 0, value: 1, easing: 'hold' }, { t: 2, value: 9 }];
    expect(sampleChannel(k, 0)).toBe(1);
    expect(sampleChannel(k, 1.9)).toBe(1); // still held
    expect(sampleChannel(k, 2)).toBe(9); // snaps at the next key
  });

  it('smooth (Catmull-Rom) passes through every key AND stays velocity-continuous', () => {
    const mk = (easing: Keyframe['easing']): Keyframe[] => [
      { t: 0, value: 0, easing },
      { t: 1, value: 8, easing }, // interior key
      { t: 2, value: 10 },
    ];
    const smooth = mk('smooth');
    // Exact at the keyframes (a spline still interpolates its control points).
    expect(sampleChannel(smooth, 0)).toBeCloseTo(0);
    expect(sampleChannel(smooth, 1)).toBeCloseTo(8);
    expect(sampleChannel(smooth, 2)).toBeCloseTo(10);
    // Speed across the interior key: `smooth` flows through it; per-segment
    // `easeInOut` nearly STOPS (zero velocity at each key) — the kdenlive gap we close.
    const speedAcrossInteriorKey = (kfs: Keyframe[]) =>
      Math.abs(sampleChannel(kfs, 1.02)! - sampleChannel(kfs, 0.98)!);
    expect(speedAcrossInteriorKey(smooth)).toBeGreaterThan(speedAcrossInteriorKey(mk('easeInOut')) * 3);
  });

  it('eased segments are monotonic and hit the endpoints exactly', () => {
    const k: Keyframe[] = [{ t: 0, value: 0, easing: 'easeInOut' }, { t: 1, value: 1 }];
    const mid = sampleChannel(k, 0.5)!;
    expect(sampleChannel(k, 0)).toBeCloseTo(0);
    expect(sampleChannel(k, 1)).toBeCloseTo(1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('edit ops (right-click add/remove keyframe)', () => {
  it('upsert inserts in time order without mutating the input', () => {
    const a: Keyframe[] = [{ t: 0, value: 0 }, { t: 4, value: 4 }];
    const b = upsertKeyframe(a, { t: 2, value: 2 });
    expect(b.map((k) => k.t)).toEqual([0, 2, 4]);
    expect(a).toHaveLength(2); // original untouched
  });

  it('upsert UPDATES (merges) a keyframe already at that time — no duplicate', () => {
    const a: Keyframe[] = [{ t: 2, value: 2, easing: 'linear' }];
    const b = upsertKeyframe(a, { t: 2.00005, value: 9 }); // within eps
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t: 2.00005, value: 9, easing: 'linear' }); // merged easing
  });

  it('upsert onto an empty/undefined channel starts a fresh one', () => {
    expect(upsertKeyframe(undefined, { t: 1, value: 5 })).toEqual([{ t: 1, value: 5 }]);
  });

  it('removeKeyframeAt drops the key at the time (within eps), keeps the rest', () => {
    const a: Keyframe[] = [{ t: 0, value: 0 }, { t: 2, value: 2 }, { t: 4, value: 4 }];
    expect(removeKeyframeAt(a, 2).map((k) => k.t)).toEqual([0, 4]);
    expect(removeKeyframeAt(a, 1.9)).toHaveLength(3); // outside eps → no-op
  });

  it('keyframeIndexAt / hasKeyframeAt locate a key at the playhead', () => {
    const a: Keyframe[] = [{ t: 0, value: 0 }, { t: 2, value: 2 }];
    expect(keyframeIndexAt(a, 2)).toBe(1);
    expect(keyframeIndexAt(a, 3)).toBe(-1);
    expect(hasKeyframeAt(a, 0)).toBe(true);
    expect(hasKeyframeAt(a, 1)).toBe(false);
  });
});
