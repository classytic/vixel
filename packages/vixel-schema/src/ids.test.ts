import { describe, it, expect } from 'vitest';
import { mintIds, indexSpec, clipPosById, audioPosById } from './ids.js';
import { normalizeSpec } from './normalize.js';
import type { VixelSpec } from './spec.js';

const baseSpec = (): VixelSpec => ({
  version: 1,
  output: { width: 1080, height: 1920, fps: 30 },
  tracks: [
    {
      type: 'visual',
      clips: [
        { media: { kind: 'text', text: 'a' }, at: 0, duration: 2 },
        { media: { kind: 'text', text: 'b' }, at: 2, duration: 2 },
      ],
    },
    { type: 'audio', items: [{ source: 'vo.mp3', at: 0 }] },
  ],
});

describe('mintIds', () => {
  it('mints an id on every track, clip, and audio item that lacks one', () => {
    const s = mintIds(baseSpec());
    expect(s.tracks[0]!.id).toBeTruthy();
    expect(s.tracks[1]!.id).toBeTruthy();
    const vt = s.tracks[0] as Extract<VixelSpec['tracks'][number], { type: 'visual' }>;
    const at = s.tracks[1] as Extract<VixelSpec['tracks'][number], { type: 'audio' }>;
    expect(vt.clips.every((c) => !!c.id)).toBe(true);
    expect(at.items.every((i) => !!i.id)).toBe(true);
  });

  it('produces globally unique ids', () => {
    const s = mintIds(baseSpec());
    const ids: string[] = [];
    for (const t of s.tracks) {
      ids.push(t.id!);
      if (t.type === 'visual') t.clips.forEach((c) => ids.push(c.id!));
      else t.items.forEach((i) => ids.push(i.id!));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves author-provided ids and never collides with them', () => {
    const spec = baseSpec();
    // Pre-assign the exact value the counter would otherwise mint for the 2nd clip.
    (spec.tracks[0] as { clips: { id?: string }[] }).clips[1]!.id = 'cl1';
    const s = mintIds(spec);
    const vt = s.tracks[0] as Extract<VixelSpec['tracks'][number], { type: 'visual' }>;
    expect(vt.clips[1]!.id).toBe('cl1'); // preserved
    expect(vt.clips[0]!.id).not.toBe('cl1'); // minted one skipped the taken value
  });

  it('is deterministic — same spec yields the same ids', () => {
    expect(JSON.stringify(mintIds(baseSpec()))).toBe(JSON.stringify(mintIds(baseSpec())));
  });

  it('normalizeSpec mints ids and is idempotent on id VALUES', () => {
    const once = normalizeSpec(baseSpec());
    const twice = normalizeSpec(once);
    const ids = (s: VixelSpec) =>
      s.tracks.flatMap((t) => [t.id, ...(t.type === 'visual' ? t.clips.map((c) => c.id) : t.items.map((i) => i.id))]);
    expect(ids(twice)).toEqual(ids(once));
  });
});

describe('indexSpec / resolvers', () => {
  it('resolves track, clip, and audio positions by id', () => {
    const s = mintIds(baseSpec());
    const idx = indexSpec(s);
    const vt = s.tracks[0] as Extract<VixelSpec['tracks'][number], { type: 'visual' }>;
    const at = s.tracks[1] as Extract<VixelSpec['tracks'][number], { type: 'audio' }>;

    expect(idx.track.get(vt.id!)).toBe(0);
    expect(idx.clip.get(vt.clips[1]!.id!)).toEqual({ trackIndex: 0, clipIndex: 1 });
    expect(idx.audio.get(at.items[0]!.id!)).toEqual({ trackIndex: 1, itemIndex: 0 });

    expect(clipPosById(s, vt.clips[0]!.id!)).toEqual({ trackIndex: 0, clipIndex: 0 });
    expect(audioPosById(s, at.items[0]!.id!)).toEqual({ trackIndex: 1, itemIndex: 0 });
    expect(clipPosById(s, 'does-not-exist')).toBeUndefined();
  });
});
