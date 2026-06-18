import { describe, it, expect } from 'vitest';
import type { VixelSpec, VisualClip } from '@classytic/vixel-schema';
import { stackingLaneIndex } from './lane-math.js';

const img = (): VisualClip => ({ media: { kind: 'image', source: 's' }, at: 0, duration: 2 });
const fx = (): VisualClip => ({ media: { kind: 'effect', effect: { id: 'x' } }, at: 0, duration: 2 });

// 3 visual lanes — tracks order [0=main(back), 1=fxA, 2=fxB(front)].
// DISPLAY (top→bottom): row0=fxB(idx2), row1=fxA(idx1), row2=main(idx0).
const spec = (...clipsPerLane: VisualClip[][]): VixelSpec => ({
  version: 1,
  output: { width: 1080, height: 1920, fps: 30 },
  tracks: clipsPerLane.map((clips, i) => ({ type: 'visual', sequential: i === 0, clips })),
});
const THREE = spec([img()], [fx()], [fx()]); // 3 visual lanes

describe('stackingLaneIndex — display(top=0) → stacking(back=0)', () => {
  it('drop at the TOP row → FRONT (highest stacking)', () => {
    expect(stackingLaneIndex(THREE, 0)).toBe(3); // → withClipInNewLane appends to front
  });
  it('drop BELOW the last row → BACK', () => {
    expect(stackingLaneIndex(THREE, 3)).toBe(0);
  });
  it('drop between rows maps monotonically (no inversion)', () => {
    expect(stackingLaneIndex(THREE, 1)).toBe(2);
    expect(stackingLaneIndex(THREE, 2)).toBe(1);
  });
  it('clamps out-of-range display indices', () => {
    expect(stackingLaneIndex(THREE, -5)).toBe(3);
    expect(stackingLaneIndex(THREE, 99)).toBe(0);
  });

  // ── move (source lane prunes) ──
  it('moving a clip off a lane that will prune shifts an ABOVE target down by one', () => {
    // Move fxA (tracks idx 1, its own 1-clip lane → prunes). Drop at display row0 (front,
    // pre-removal stacking 3). The source sits BELOW it, so after the prune the front
    // index in the now-2-lane spec is 3−1=2 (still "append to front" via clamp).
    expect(stackingLaneIndex(THREE, 0, 1)).toBe(2);
    // Drop at the very bottom (back, stacking 0): the source is NOT below it → no shift.
    expect(stackingLaneIndex(THREE, 3, 1)).toBe(0);
  });
  it('no shift when the source lane keeps other clips', () => {
    const s = spec([img()], [fx(), fx()]); // lane 1 has TWO fx → won't prune
    expect(stackingLaneIndex(s, 2, 1)).toBe(stackingLaneIndex(s, 2));
  });
  it('a sequential (main) lane is never treated as pruning', () => {
    expect(stackingLaneIndex(THREE, 0, 0)).toBe(3); // moving off main (sequential) → no prune shift
  });
});
