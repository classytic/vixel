import { describe, it, expect } from 'vitest';
import { normalizeSpec, type VixelSpec } from '@classytic/vixel-schema';
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
