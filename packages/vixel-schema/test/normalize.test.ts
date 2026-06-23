/**
 * normalizeSpec — resolves agent shorthands (semantic `place` → `transform.frame`,
 * shape style preset → inline fields) on the UNIFIED model (VisualTrack/VisualClip).
 * Pure + idempotent; explicit values always win over shorthands.
 *
 * (The pre-refactor legacy folds — `type:'video'`/`type:'overlay'` tracks,
 * `clip.transition`, overlay `box`/`position`/`width`/`height` — are intentionally
 * gone with the clean break to the unified lane model, so they're no longer tested.)
 */
import { describe, it, expect } from 'vitest';
import { normalizeSpec, type VixelSpec, type Rect } from '../src/index.js';

const out = { width: 1080, height: 1920, fps: 30 };
const within01 = (r: Rect) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe('normalizeSpec — place → frame', () => {
  it('resolves a clip place:{region} into an in-bounds transform.frame', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [{ type: 'visual', clips: [{ media: { kind: 'text', text: 'hi' }, at: 0, duration: 2, place: { region: 'lower-third' } }] }],
    };
    const tr = normalizeSpec(spec).tracks[0]!;
    const clip = tr.type === 'visual' ? tr.clips[0] : null;
    expect(clip?.transform?.frame).toBeDefined();
    expect(within01(clip!.transform!.frame!)).toBe(true);
  });

  it('an explicit transform.frame wins over place', () => {
    const frame = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [{ type: 'visual', clips: [{ media: { kind: 'text', text: 'hi' }, at: 0, duration: 2, place: { region: 'top' }, transform: { frame } }] }],
    };
    const tr = normalizeSpec(spec).tracks[0]!;
    const clip = tr.type === 'visual' ? tr.clips[0] : null;
    expect(clip?.transform?.frame).toEqual(frame);
  });

  it('inlines a shape style preset + resolves grid placement', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [{ type: 'visual', clips: [{ media: { kind: 'shape', style: 'glass' }, at: 0, duration: 2, place: { col: [1, 6], row: [1, 6] } }] }],
    };
    const tr = normalizeSpec(spec).tracks[0]!;
    const clip = tr.type === 'visual' ? tr.clips[0] : null;
    expect(clip?.media.kind === 'shape' && clip.media.shape).toBe('roundedRect');
    expect(clip?.media.kind === 'shape' && (clip.media as { style?: string }).style).toBeUndefined(); // id dropped
    expect(clip?.transform?.frame).toBeDefined();
  });

  it('passes audio tracks through untouched and is idempotent', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', clips: [{ media: { kind: 'text', text: 'hi' }, at: 0, duration: 2, place: { region: 'center' } }] },
        { type: 'audio', items: [{ source: 'a.mp3', at: 0, in: 0, out: 2 }] },
      ],
    };
    const once = normalizeSpec(spec);
    const audio = once.tracks[1]!;
    expect(audio.type).toBe('audio');
    if (audio.type === 'audio') {
      // Content preserved (place/preset resolution doesn't touch audio); only a
      // stable id is minted on the track + item.
      expect(audio.items[0]).toMatchObject({ source: 'a.mp3', at: 0, in: 0, out: 2 });
      expect(audio.items[0]!.id).toBeTruthy();
    }
    expect(normalizeSpec(once)).toEqual(once); // idempotent
  });

  it('resolves transition `between` index shorthand to stable clip ids, drops stale pairs', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        {
          type: 'visual',
          sequential: true,
          clips: [
            { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 2 },
            { media: { kind: 'video', source: 'b.mp4' }, at: 2, duration: 2 },
          ],
          transitions: [
            { between: [0, 1], transition: { id: 'fade', duration: 0.5 } }, // valid → id pair
            { between: [0, 2], transition: { id: 'fade', duration: 0.5 } }, // non-adjacent → dropped
          ],
        },
      ],
    };
    const tr = normalizeSpec(spec).tracks[0]!;
    if (tr.type !== 'visual') throw new Error('expected visual');
    expect(tr.transitions).toHaveLength(1);
    const [a, b] = tr.transitions![0]!.between;
    expect(a).toBe(tr.clips[0]!.id);
    expect(b).toBe(tr.clips[1]!.id);
    expect(typeof a).toBe('string');
  });
});
