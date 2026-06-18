import { describe, it, expect } from 'vitest';
import type { VixelSpec } from '@classytic/vixel-schema';
import { collectScheduledAudio, effectiveGainDb, gainToLinear, audioFrameAt } from './schedule.js';

function spec(): VixelSpec {
  return {
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      { type: 'visual', clips: [{ media: { kind: 'text', text: 'x' }, at: 0, duration: 5 }] },
      {
        type: 'audio',
        items: [
          // music with a duck envelope: full (0 dB) → −18 dB at 2s → back to 0 at 4s
          {
            source: 'music.mp3',
            at: 0,
            in: 0,
            out: 6,
            gain: -3,
            gainKeyframes: [
              { t: 0, value: 0 },
              { t: 2, value: -18 },
              { t: 4, value: 0 },
            ],
          },
          { source: { url: 'voice.mp3' }, at: 1, in: 0, out: 4, gain: 0 }, // object source
          { source: '', at: 0, in: 0, out: 2 }, // no src → dropped
        ],
      },
    ],
  };
}

describe('collectScheduledAudio', () => {
  it('gathers audio-track items with resolvable sources (drops empty), skips visual tracks', () => {
    const got = collectScheduledAudio(spec());
    expect(got.map((g) => g.src)).toEqual(['music.mp3', 'voice.mp3']);
    expect(got[0]).toMatchObject({ at: 0, inSec: 0, dur: 6, gain: -3 });
    expect(got[0].gainKeyframes).toHaveLength(3);
    expect(got[1]).toMatchObject({ src: 'voice.mp3', at: 1, dur: 4 }); // {url} resolved
  });
});

describe('effectiveGainDb — envelope IS the volume', () => {
  const m = collectScheduledAudio(spec())[0];
  it('samples the envelope at the element-relative time (ducks under voice)', () => {
    expect(effectiveGainDb(m, 0)).toBeCloseTo(0, 5); // base
    expect(effectiveGainDb(m, 2)).toBeCloseTo(-18, 5); // ducked
    expect(effectiveGainDb(m, 3)).toBeCloseTo(-9, 1); // ramping back up (linear-ish midpoint)
    expect(effectiveGainDb(m, 4)).toBeCloseTo(0, 5);
  });
  it('falls back to static gain when there is no envelope', () => {
    expect(effectiveGainDb({ key: 'k', src: 's', at: 0, inSec: 0, dur: 5, gain: -6 }, 2)).toBe(-6);
  });
});

describe('gainToLinear', () => {
  it('0 dB → 1, −6 dB ≈ 0.5, −∞ floor at 0, clamps boost to 1', () => {
    expect(gainToLinear(0)).toBeCloseTo(1, 5);
    expect(gainToLinear(-6)).toBeCloseTo(0.501, 2);
    expect(gainToLinear(-100)).toBeCloseTo(0, 3);
    expect(gainToLinear(12)).toBe(1); // no boost via <audio>.volume
  });
});

describe('audioFrameAt — play/volume/seek target', () => {
  const m = collectScheduledAudio(spec())[0];
  it('plays only inside [at, at+dur) while isPlaying, ducked volume + correct source-time', () => {
    const f = audioFrameAt(m, 2, true);
    expect(f.shouldPlay).toBe(true);
    expect(f.volume).toBeCloseTo(gainToLinear(-18), 5); // ducked
    expect(f.seekTo).toBe(2); // inSec 0 + (playhead 2 − at 0)
  });
  it('does not play when paused, before start, or after end', () => {
    expect(audioFrameAt(m, 2, false).shouldPlay).toBe(false);
    expect(audioFrameAt(m, 7, true).shouldPlay).toBe(false); // past out
  });
});
