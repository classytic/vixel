import { describe, it, expect } from 'vitest';
import type { VixelSpec, VisualClip } from '@classytic/vixel-schema';
import {
  laneFreeAt,
  isEffectLane,
  laneSeams,
  pruneEmptyLanes,
  withClipAutoPlaced,
  withClipRemoved,
} from './spec.js';

// ── tiny builders ─────────────────────────────────────────────────────────────
const img = (at: number, duration = 2): VisualClip => ({ media: { kind: 'image', source: 's' }, at, duration });
const fx = (id: string, at: number, duration = 3): VisualClip => ({ media: { kind: 'effect', effect: { id } }, at, duration });

const spec = (...tracks: VixelSpec['tracks']): VixelSpec => ({
  version: 1,
  output: { width: 1080, height: 1920, fps: 30 },
  tracks,
});
const visualCount = (s: VixelSpec) => s.tracks.filter((t) => t.type === 'visual').length;

describe('laneFreeAt', () => {
  const lane = { type: 'visual' as const, clips: [img(0, 2), img(5, 2)] }; // busy [0,2] and [5,7]
  it('is free in the gap and after the last clip', () => {
    expect(laneFreeAt(lane, 2.5, 2)).toBe(true); // [2.5,4.5] fits the gap
    expect(laneFreeAt(lane, 7, 3)).toBe(true); // after the last clip
  });
  it('is NOT free when the window overlaps any clip', () => {
    expect(laneFreeAt(lane, 1, 2)).toBe(false); // straddles [0,2]
    expect(laneFreeAt(lane, 4.5, 2)).toBe(false); // [4.5,6.5] hits [5,7]
  });
  it('touching edges counts as free (butt-join)', () => {
    expect(laneFreeAt(lane, 2, 3)).toBe(true); // starts exactly where [0,2] ends
  });
});

describe('laneSeams — transitions attach to adjacent clips on ANY lane', () => {
  it('sequential lane: every consecutive pair is a seam (butt-joined)', () => {
    const lane = { type: 'visual' as const, sequential: true, clips: [img(0, 2), img(2, 2), img(4, 2)] };
    const seams = laneSeams(lane);
    expect(seams.map((s) => s.gap)).toEqual([0, 1]);
    expect(seams[0]!.seamSec).toBe(2); // the cut sits at the later clip's start
  });

  it('free lane: butt-joined clips form a seam, gapped clips do not', () => {
    const joined = laneSeams({ type: 'visual', clips: [img(0, 2), img(2, 2)] }); // touch at 2
    expect(joined).toHaveLength(1);
    expect(joined[0]!.gap).toBe(0);
    const gapped = laneSeams({ type: 'visual', clips: [img(0, 2), img(5, 2)] }); // 3s gap
    expect(gapped).toHaveLength(0);
  });

  it('free lane: only the touching pair among several clips is a seam', () => {
    // [0,2] then [2,4] (touch) then [6,8] (gap) → exactly one seam, between clips 0 and 1.
    const seams = laneSeams({ type: 'visual', clips: [img(0, 2), img(2, 2), img(6, 2)] });
    expect(seams.map((s) => s.gap)).toEqual([0]);
  });

  it('maxDuration is bounded by the shorter adjacent clip', () => {
    const seams = laneSeams({ type: 'visual', clips: [img(0, 4), img(4, 1)] }); // shorter = 1s
    expect(seams[0]!.maxDuration).toBeCloseTo(0.9, 5); // 1 * 0.9 overlap fraction
  });
});

describe('isEffectLane', () => {
  it('true only when every clip is an effect (and non-empty)', () => {
    expect(isEffectLane({ type: 'visual', clips: [fx('a', 0), fx('b', 4)] })).toBe(true);
    expect(isEffectLane({ type: 'visual', clips: [fx('a', 0), img(4)] })).toBe(false);
    expect(isEffectLane({ type: 'visual', clips: [] })).toBe(false);
  });
});

describe('pruneEmptyLanes', () => {
  it('drops empty NON-sequential visual lanes, keeps the empty main lane + audio', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [] }, // main — kept even if empty
      { type: 'visual', clips: [] }, // overlay — pruned
      { type: 'visual', clips: [fx('a', 0)] }, // kept (non-empty)
      { type: 'audio', items: [] }, // kept (audio never pruned)
    );
    const out = pruneEmptyLanes(s);
    expect(out.tracks).toHaveLength(3);
    expect(out.tracks.some((t) => t.type === 'visual' && !t.sequential && t.clips.length === 0)).toBe(false);
  });
  it('returns the SAME ref when nothing to prune (no needless re-render)', () => {
    const s = spec({ type: 'visual', sequential: true, clips: [img(0)] });
    expect(pruneEmptyLanes(s)).toBe(s);
  });
});

describe('withClipAutoPlaced — the CapCut "fill empty space" behaviour', () => {
  it('REUSES a free gap on an existing effect lane instead of adding a lane', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [img(0, 10)] },
      { type: 'visual', clips: [fx('contrast', 0, 3)] }, // effect lane, free after t=3
    );
    const out = withClipAutoPlaced(s, fx('warm', 4), 4);
    expect(visualCount(out)).toBe(2); // NO new lane
    const effectLane = out.tracks.find((t) => t.type === 'visual' && !t.sequential)!;
    expect(effectLane.type === 'visual' && effectLane.clips.map((c) => c.at)).toEqual([0, 4]);
  });

  it('adds a NEW lane when the only effect lane is busy at that window', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [img(0, 10)] },
      { type: 'visual', clips: [fx('contrast', 0, 3)] },
    );
    const out = withClipAutoPlaced(s, fx('warm', 1), 1); // overlaps [0,3]
    expect(visualCount(out)).toBe(3); // forced onto its own lane
  });

  it('never drops an effect onto a MEDIA lane (or vice-versa)', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [img(0, 10)] },
      { type: 'visual', clips: [img(0, 2)] }, // media overlay lane, free after t=2
    );
    const out = withClipAutoPlaced(s, fx('warm', 5), 5);
    expect(visualCount(out)).toBe(3); // effect did NOT reuse the media lane
  });

  it('prunes stale empty lanes first, so adding cleans the pile-up', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [img(0, 10)] },
      { type: 'visual', clips: [] },
      { type: 'visual', clips: [] },
      { type: 'visual', clips: [] },
    );
    const out = withClipAutoPlaced(s, fx('warm', 0), 0);
    expect(visualCount(out)).toBe(2); // 3 empties pruned, 1 new effect lane
  });
});

describe('withClipRemoved auto-prunes the emptied lane', () => {
  it('removing the last effect clip drops its lane (no dead "Track" row)', () => {
    const s = spec(
      { type: 'visual', sequential: true, clips: [img(0, 10)] },
      { type: 'visual', clips: [fx('contrast', 0)] },
    );
    const out = withClipRemoved(s, 1, 0);
    expect(visualCount(out)).toBe(1); // effect lane gone
  });
  it('keeps the sequential main lane even when its last clip is removed', () => {
    const s = spec({ type: 'visual', sequential: true, clips: [img(0)] });
    const out = withClipRemoved(s, 0, 0);
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]!.type === 'visual' && out.tracks[0]!.clips).toHaveLength(0);
  });
});
