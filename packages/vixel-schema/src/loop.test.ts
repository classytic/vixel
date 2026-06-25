import { describe, it, expect } from 'vitest';
import { audioItemDurationSec, audioWindowSec, loopAudioToFill } from './audio.js';
import { loopVideoToFill } from './visual.js';
import { totalDurationSec } from './timeline.js';
import { linkElements, unlinkElements, linkGroupOf, areLinked } from './link.js';
import { normalizeSpec } from './normalize.js';
import type { VixelSpec } from './spec.js';
import type { AudioItem } from './audio.js';
import type { VisualTrack } from './visual.js';
import type { AudioTrack } from './track.js';

describe('audio loop primitive', () => {
  const item = (over: Partial<AudioItem> = {}): AudioItem => ({ source: 'm.mp3', at: 0, in: 0, out: 4, ...over });

  it('non-looping length is the trimmed window', () => {
    expect(audioWindowSec(item())).toBe(4);
    expect(audioItemDurationSec(item())).toBe(4);
  });

  it('loopAudioToFill sets loop + loopDuration and drives the on-timeline length', () => {
    const looped = loopAudioToFill(item(), 30);
    expect(looped).toMatchObject({ loop: true, loopDuration: 30 });
    expect(audioItemDurationSec(looped)).toBe(30); // not the 4s source window
  });

  it('a looping item without loopDuration falls back to its window (host fills to comp)', () => {
    expect(audioItemDurationSec(item({ loop: true }))).toBe(4);
  });

  it('totalDurationSec respects a looped audio bed', () => {
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1080, height: 1920, fps: 30 },
      tracks: [
        { type: 'visual', clips: [{ media: { kind: 'image', source: 'a.png' }, at: 0, duration: 8 }] },
        { type: 'audio', items: [loopAudioToFill(item(), 20)] }, // 4s loop → 20s
      ],
    };
    expect(totalDurationSec(spec)).toBe(20); // the looped bed, not the 8s visual or 4s window
  });
});

describe('video loop primitive', () => {
  it('loopVideoToFill marks the video media loop and sets the fill duration', () => {
    const clip = { media: { kind: 'video' as const, source: 'b.mp4' }, at: 0, duration: 3 };
    const looped = loopVideoToFill(clip, 30);
    expect(looped.duration).toBe(30);
    expect(looped.media).toMatchObject({ kind: 'video', loop: true });
  });

  it('is a no-op for non-video clips', () => {
    const text = { media: { kind: 'text' as const, text: 'hi' }, at: 0, duration: 2 };
    expect(loopVideoToFill(text, 30)).toBe(text);
  });
});

describe('link mutators', () => {
  const spec = (): VixelSpec =>
    normalizeSpec({
      version: 1,
      output: { width: 1080, height: 1920, fps: 30 },
      tracks: [
        { type: 'visual', id: 'v', clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4 }] },
        { type: 'audio', id: 'a', items: [{ source: 'a.mp3', at: 0, in: 0, out: 4 }] },
      ],
    });
  const clipId = (s: VixelSpec) => (s.tracks[0] as VisualTrack).clips[0]!.id!;
  const itemId = (s: VixelSpec) => (s.tracks[1] as AudioTrack).items[0]!.id!;

  it('linkElements couples elements under a minted shared id', () => {
    const s = spec();
    const linked = linkElements(s, [clipId(s), itemId(s)]);
    expect(areLinked(linked, clipId(s), itemId(s))).toBe(true);
    expect(linkGroupOf(linked, clipId(s))).toHaveLength(2);
    const lid = (linked.tracks[0] as VisualTrack).clips[0]!.linkId;
    expect(lid).toMatch(/^ln\d+$/);
    expect((linked.tracks[1] as AudioTrack).items[0]!.linkId).toBe(lid);
  });

  it('honors an explicit link id and unlinkElements removes it', () => {
    const s = spec();
    const linked = linkElements(s, [clipId(s), itemId(s)], 'pair1');
    expect((linked.tracks[0] as VisualTrack).clips[0]!.linkId).toBe('pair1');
    const unlinked = unlinkElements(linked, [clipId(s), itemId(s)]);
    expect(areLinked(unlinked, clipId(s), itemId(s))).toBe(false);
    expect((unlinked.tracks[0] as VisualTrack).clips[0]!.linkId).toBeUndefined();
  });

  it('empty ids is a no-op (same ref)', () => {
    const s = spec();
    expect(linkElements(s, [])).toBe(s);
    expect(unlinkElements(s, [])).toBe(s);
  });
});
