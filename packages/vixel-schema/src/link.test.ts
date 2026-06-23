import { describe, it, expect } from 'vitest';
import { linkGroupOf, linkedPartners, areLinked, linkGroups } from './link.js';
import { normalizeSpec } from './normalize.js';
import type { VixelSpec } from './spec.js';
import type { VisualTrack } from './visual.js';
import type { AudioTrack } from './track.js';

const spec = (): VixelSpec =>
  normalizeSpec({
    version: 1,
    output: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        type: 'visual',
        id: 'main',
        clips: [
          { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4, linkId: 'g1' },
          { media: { kind: 'video', source: 'b.mp4' }, at: 4, duration: 4 },
        ],
      },
      { type: 'audio', id: 'a1', items: [{ source: 'a.mp3', at: 0, in: 0, out: 4, linkId: 'g1' }] },
    ],
  });

const clip0 = (s: VixelSpec) => (s.tracks[0] as VisualTrack).clips[0]!.id!;
const clip1 = (s: VixelSpec) => (s.tracks[0] as VisualTrack).clips[1]!.id!;
const item0 = (s: VixelSpec) => (s.tracks[1] as AudioTrack).items[0]!.id!;

describe('link', () => {
  it('groups elements that share a linkId', () => {
    const s = spec();
    expect(linkGroups(s).get('g1')).toHaveLength(2);
  });

  it('resolves the full group (incl. self) across lanes', () => {
    const s = spec();
    const group = linkGroupOf(s, clip0(s)).map((m) => m.id).sort();
    expect(group).toEqual([clip0(s), item0(s)].sort());
  });

  it('returns a group of one for an unlinked element', () => {
    const s = spec();
    expect(linkGroupOf(s, clip1(s))).toEqual([
      expect.objectContaining({ id: clip1(s), kind: 'clip' }),
    ]);
    expect(linkedPartners(s, clip1(s))).toEqual([]);
  });

  it('reports partners and pairwise linkage', () => {
    const s = spec();
    expect(linkedPartners(s, clip0(s)).map((m) => m.id)).toEqual([item0(s)]);
    expect(areLinked(s, clip0(s), item0(s))).toBe(true);
    expect(areLinked(s, clip0(s), clip1(s))).toBe(false);
  });
});
