import { describe, it, expect } from 'vitest';
import { normalizeSpec, totalDurationSec, type VixelSpec, type AudioTrack } from '@classytic/vixel-schema';
import { applyCommand, commandLabel } from './commands.js';

function spec(): VixelSpec {
  // Normalized so every clip/item carries a stable id.
  return normalizeSpec({
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      {
        type: 'visual',
        sequential: true,
        clips: [
          { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
          { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 2 },
        ],
      },
      { type: 'audio', items: [{ source: 'vo.mp3', at: 0 }] },
    ],
  });
}

const visual = (s: VixelSpec) => {
  const t = s.tracks[0];
  if (t.type !== 'visual') throw new Error('expected visual');
  return t;
};

describe('applyCommand (headless, id-addressed)', () => {
  it('updateClip targets a clip by id regardless of position', () => {
    const s = spec();
    const id = visual(s).clips[1]!.id!;
    const next = applyCommand(s, { type: 'updateClip', clipId: id, patch: { duration: 5 } });
    expect(next).not.toBe(s); // immutable
    expect(visual(next).clips[1]!.duration).toBe(5);
    expect(visual(s).clips[1]!.duration).toBe(2); // original untouched
  });

  it('removeClip deletes the targeted clip', () => {
    const s = spec();
    const id = visual(s).clips[0]!.id!;
    const next = applyCommand(s, { type: 'removeClip', clipId: id });
    expect(visual(next).clips).toHaveLength(1);
    expect(visual(next).clips[0]!.id).toBe(visual(s).clips[1]!.id); // the OTHER clip remains
  });

  it('a command targeting a missing id is a no-op (same reference)', () => {
    const s = spec();
    expect(applyCommand(s, { type: 'removeClip', clipId: 'nope' })).toBe(s);
  });

  it('newly created clips get ids (so the next command can address them)', () => {
    const s = spec();
    const id = visual(s).clips[0]!.id!;
    const next = applyCommand(s, { type: 'duplicateClip', clipId: id });
    expect(visual(next).clips).toHaveLength(3);
    expect(visual(next).clips.every((c) => !!c.id)).toBe(true);
  });

  it('setTransition writes an id-based seam after the target clip', () => {
    const s = spec();
    const id = visual(s).clips[0]!.id!;
    const next = applyCommand(s, {
      type: 'setTransition',
      afterClipId: id,
      ref: { id: 'fade', duration: 0.5 },
    });
    const tr = visual(next).transitions![0]!;
    expect(tr.between[0]).toBe(visual(next).clips[0]!.id);
    expect(tr.between[1]).toBe(visual(next).clips[1]!.id);
  });

  it('commandLabel gives a human-readable default', () => {
    expect(commandLabel({ type: 'splitClip', clipId: 'x', atSec: 1 })).toBe('Split clip');
    expect(commandLabel({ type: 'setTransition', afterClipId: 'x', ref: null })).toBe('Remove transition');
  });
});

describe('applyCommand — ripple / markers / links / loop', () => {
  const main = (): VixelSpec =>
    normalizeSpec({
      version: 1,
      output: { width: 1080, height: 1920, fps: 30 },
      tracks: [
        {
          type: 'visual',
          id: 'main',
          clips: [
            { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
            { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 3 },
            { media: { kind: 'video', source: 'c.mp4' }, at: 6, duration: 3 },
          ],
        },
        { type: 'audio', id: 'a1', items: [{ source: 'm.mp3', at: 0, in: 0, out: 9 }] },
      ],
    });
  const aud = (s: VixelSpec) => s.tracks[1] as AudioTrack;

  it('rippleDelete cuts a range and closes the gap', () => {
    const out = applyCommand(main(), { type: 'rippleDelete', trackId: 'main', ranges: [[3, 6]] });
    expect(visual(out).clips.map((c) => [c.at, c.duration])).toEqual([
      [0, 3],
      [3, 3],
    ]);
  });

  it('addMarker / removeMarker round-trip with minted ids', () => {
    let s = applyCommand(main(), { type: 'addMarker', marker: { at: 4, label: 'Hook', kind: 'chapter' } });
    expect(s.markers).toHaveLength(1);
    const id = s.markers![0]!.id!;
    s = applyCommand(s, { type: 'removeMarker', markerId: id });
    expect(s.markers).toEqual([]);
  });

  it('linkClips couples a clip + audio item; unlinkClips parts them', () => {
    const s0 = main();
    const c0 = visual(s0).clips[0]!.id!;
    const a0 = aud(s0).items[0]!.id!;
    const linked = applyCommand(s0, { type: 'linkClips', ids: [c0, a0] });
    expect(visual(linked).clips[0]!.linkId).toBeTruthy();
    expect(aud(linked).items[0]!.linkId).toBe(visual(linked).clips[0]!.linkId);
    const unlinked = applyCommand(linked, { type: 'unlinkClips', ids: [c0, a0] });
    expect(visual(unlinked).clips[0]!.linkId).toBeUndefined();
  });

  it('audio loop rides updateAudioItem and drives composition duration', () => {
    const s0 = main();
    const a0 = aud(s0).items[0]!.id!;
    const out = applyCommand(s0, { type: 'updateAudioItem', audioId: a0, patch: { loop: true, loopDuration: 20 } });
    expect(aud(out).items[0]).toMatchObject({ loop: true, loopDuration: 20 });
    expect(totalDurationSec(out)).toBe(20);
  });

  it('video loop rides an updateClip media patch', () => {
    const s0 = main();
    const c0 = visual(s0).clips[0]!.id!;
    const out = applyCommand(s0, {
      type: 'updateClip',
      clipId: c0,
      patch: { duration: 30, media: { kind: 'video', source: 'a.mp4', loop: true } },
    });
    expect(visual(out).clips[0]).toMatchObject({ duration: 30, media: { loop: true } });
  });

  it('new labels are human-readable', () => {
    expect(commandLabel({ type: 'rippleDelete', trackId: 'main', ranges: [] })).toBe('Ripple delete');
    expect(commandLabel({ type: 'linkClips', ids: [] })).toBe('Link');
  });
});
