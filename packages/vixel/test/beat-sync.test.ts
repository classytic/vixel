/**
 * Beat sync — golden unit tests (pure DSP + spec builder, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { pickOnsets, estimateBpm, beatSyncSpec } from '../src/compose/beat-sync.js';

describe('pickOnsets', () => {
  it('finds energy spikes as onsets (gaps respected)', () => {
    // flat energy with sharp spikes every 10 frames; hop = 0.1s → beats ~1s apart
    const energy = Array.from({ length: 60 }, (_, i) => (i % 10 === 0 ? 1 : 0.05));
    const beats = pickOnsets(energy, { hopSec: 0.1, minGapSec: 0.25, sensitivity: 1.0 });
    expect(beats.length).toBeGreaterThanOrEqual(4);
    // spikes sit near 1.0s, 2.0s, ...
    expect(beats[0]).toBeCloseTo(1.0, 1);
    expect(beats[1]! - beats[0]!).toBeCloseTo(1.0, 1);
  });

  it('respects the minimum gap (no double-triggers)', () => {
    const energy = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : 0.1));
    const beats = pickOnsets(energy, { hopSec: 0.05, minGapSec: 0.5, sensitivity: 0.5 });
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i]! - beats[i - 1]!).toBeGreaterThanOrEqual(0.5 - 1e-6);
    }
  });

  it('returns nothing for a near-silent / flat signal', () => {
    expect(pickOnsets(new Array(50).fill(0.01), { hopSec: 0.02, minGapSec: 0.25, sensitivity: 1.3 })).toEqual([]);
  });
});

describe('estimateBpm', () => {
  it('derives tempo from the median inter-beat interval', () => {
    const beats = [0, 0.5, 1.0, 1.5, 2.0]; // 0.5s apart → 120 BPM
    expect(estimateBpm(beats)).toBe(120);
  });
  it('returns 0 with too few beats', () => {
    expect(estimateBpm([1])).toBe(0);
  });
});

describe('beatSyncSpec', () => {
  const output = { width: 1080, height: 1920, fps: 30 };

  it('snaps clip durations to beat intervals and cycles sources', () => {
    const spec = beatSyncSpec({
      sources: ['a.mp4', 'b.mp4'],
      beats: [0, 1, 2, 3], // three 1s intervals
      output,
    });
    const track = spec.tracks[0] as { type: string; sequential?: boolean; clips: { media: { kind: string; source: string }; at: number; duration: number }[] };
    expect(track.type).toBe('visual');
    expect(track.sequential).toBe(true);
    expect(track.clips).toEqual([
      { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 1 },
      { media: { kind: 'video', source: 'b.mp4' }, at: 1, duration: 1 },
      { media: { kind: 'video', source: 'a.mp4' }, at: 2, duration: 1 }, // looped
    ]);
  });

  it('cuts every Nth beat and drops sub-min intervals', () => {
    const spec = beatSyncSpec({
      sources: ['a.mp4'],
      beats: [0, 0.1, 1, 1.1, 2], // every 2nd beat → boundaries 0,1,2
      output,
      everyNthBeat: 2,
    });
    const clips = (spec.tracks[0] as { clips: { duration: number }[] }).clips;
    expect(clips.map((c) => c.duration)).toEqual([1, 1]);
  });

  it('attaches the analyzed track as a music bed when given', () => {
    const spec = beatSyncSpec({ sources: ['a.mp4'], beats: [0, 1, 2], output, audioSource: 'song.mp3' });
    const audio = spec.tracks.find((t) => t.type === 'audio');
    expect(audio).toBeDefined();
    expect((audio as { items: { source: string; role: string }[] }).items[0]).toMatchObject({
      source: 'song.mp3',
      role: 'music',
    });
  });

  it('throws on no sources', () => {
    expect(() => beatSyncSpec({ sources: [], beats: [0, 1], output })).toThrow(/at least one source/);
  });
});
