import { describe, it, expect } from 'vitest';
import { rippleDeleteRanges, rippleInsertGap, mergeRanges } from './ripple.js';
import { normalizeSpec } from './normalize.js';
import { totalDurationSec } from './timeline.js';
import type { VixelSpec } from './spec.js';
import type { VisualTrack } from './visual.js';
import type { AudioTrack } from './track.js';

const vis = (s: VixelSpec): VisualTrack => s.tracks[0] as VisualTrack;
const aud = (s: VixelSpec, i = 1): AudioTrack => s.tracks[i] as AudioTrack;

// Main lane: three 3s video clips end-to-end (0-3, 3-6, 6-9).
const baseSpec = (): VixelSpec =>
  normalizeSpec({
    version: 1,
    output: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        type: 'visual',
        id: 'main',
        sequential: true,
        clips: [
          { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
          { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 3 },
          { media: { kind: 'video', source: 'c.mp4' }, at: 6, duration: 3 },
        ],
      },
    ],
  });

describe('mergeRanges', () => {
  it('merges overlapping and adjacent ranges, drops empties, sorts', () => {
    expect(mergeRanges([[2, 4], [3, 5], [10, 10], [8, 9], [9, 11]])).toEqual([
      [2, 5],
      [8, 11],
    ]);
  });
});

describe('rippleDeleteRanges', () => {
  it('cuts a whole middle clip and closes the gap', () => {
    const out = rippleDeleteRanges(baseSpec(), 'main', [[3, 6]]);
    const clips = vis(out).clips;
    expect(clips).toHaveLength(2);
    expect(clips.map((c) => [c.at, c.duration])).toEqual([
      [0, 3],
      [3, 3], // clip C pulled left from 6→3
    ]);
    expect(totalDurationSec(out)).toBe(6);
  });

  it('cuts inside one clip, splitting it and advancing trimStart on the right piece', () => {
    const out = rippleDeleteRanges(baseSpec(), 'main', [[1, 2]]);
    const clips = vis(out).clips;
    expect(clips).toHaveLength(4); // A split into [0,1)+[1,2 closed], then B, C shifted
    // First piece keeps source start 0; second piece begins 2s into source A.
    expect(clips[0]).toMatchObject({ at: 0, duration: 1 });
    expect(clips[1]).toMatchObject({ at: 1, duration: 1 });
    expect((clips[1]!.media as { trimStart?: number }).trimStart).toBeCloseTo(2);
    // Everything after the 1s cut shifts left by 1s.
    expect(clips[2]).toMatchObject({ at: 2, duration: 3 });
    expect(clips[3]).toMatchObject({ at: 5, duration: 3 });
    expect(totalDurationSec(out)).toBe(8);
  });

  it('merges multiple ranges and is order-independent', () => {
    const a = rippleDeleteRanges(baseSpec(), 'main', [[0, 1], [4, 5]]);
    const b = rippleDeleteRanges(baseSpec(), 'main', [[4, 5], [0, 1]]);
    expect(vis(a).clips.map((c) => [c.at, c.duration])).toEqual(
      vis(b).clips.map((c) => [c.at, c.duration]),
    );
    expect(totalDurationSec(a)).toBe(7); // 9 - 2s removed
  });

  it('keeps the first surviving piece id stable, re-mints split pieces', () => {
    const spec = baseSpec();
    const firstId = vis(spec).clips[0]!.id;
    const out = rippleDeleteRanges(spec, 'main', [[1, 2]]);
    expect(vis(out).clips[0]!.id).toBe(firstId);
    expect(new Set(vis(out).clips.map((c) => c.id)).size).toBe(vis(out).clips.length);
  });

  it('cuts a linked audio partner on the same span', () => {
    const spec = normalizeSpec({
      version: 1,
      output: { width: 1920, height: 1080, fps: 30 },
      tracks: [
        {
          type: 'visual',
          id: 'main',
          clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 6, linkId: 'g1' }],
        },
        { type: 'audio', id: 'a1', items: [{ source: 'a.mp3', at: 0, in: 0, out: 6, linkId: 'g1' }] },
      ],
    });
    const out = rippleDeleteRanges(spec, 'main', [[2, 4]]);
    // Visual clip cut 2-4 → two pieces; audio item cut on the same source window.
    expect(vis(out).clips).toHaveLength(2);
    const items = aud(out).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ at: 0, in: 0, out: 2 });
    expect(items[1]).toMatchObject({ at: 2, in: 4, out: 6 });
    expect(totalDurationSec(out)).toBe(4);
  });

  it('is a no-op for empty ranges (same reference)', () => {
    const spec = baseSpec();
    expect(rippleDeleteRanges(spec, 'main', [])).toBe(spec);
  });
});

describe('rippleInsertGap', () => {
  it('opens a gap at a clip boundary, shifting later clips right', () => {
    const out = rippleInsertGap(baseSpec(), 'main', 3, 2);
    expect(vis(out).clips.map((c) => [c.at, c.duration])).toEqual([
      [0, 3],
      [5, 3], // B shifted 3→5
      [8, 3], // C shifted 6→8
    ]);
    expect(totalDurationSec(out)).toBe(11);
  });

  it('splits a clip straddling the insertion point', () => {
    const out = rippleInsertGap(baseSpec(), 'main', 1.5, 2);
    const clips = vis(out).clips;
    // A splits at 1.5 → [0,1.5) + [3.5, 1.5) (right piece pushed past the 2s gap).
    expect(clips[0]).toMatchObject({ at: 0, duration: 1.5 });
    expect(clips[1]).toMatchObject({ at: 3.5, duration: 1.5 });
    expect((clips[1]!.media as { trimStart?: number }).trimStart).toBeCloseTo(1.5);
  });
});
