import { describe, it, expect } from 'vitest';
import {
  channelKeyframeTimes,
  moveKeyframeTime,
  removeKeyframeTime,
  nearestKeyframeTime,
  transformToChannels,
  channelsToTransform,
  type KeyframeChannels,
} from './keyframe-channels.js';

const ch = (): KeyframeChannels => ({
  x: [
    { t: 0, value: 0 },
    { t: 1, value: 0.5 },
    { t: 2, value: 1 },
  ],
  opacity: [
    { t: 0, value: 1 },
    { t: 2, value: 0, easing: 'easeOut' },
  ],
});

describe('channelKeyframeTimes', () => {
  it('unions distinct times across channels, sorted (0 and 2 shared, 1 only on x)', () => {
    expect(channelKeyframeTimes(ch())).toEqual([0, 1, 2]);
  });
  it('ignores empty/absent channels', () => {
    expect(channelKeyframeTimes({ x: undefined, y: [] })).toEqual([]);
  });
});

describe('moveKeyframeTime — unified retime', () => {
  it('moves the key at t=2 on EVERY channel keyed there (x + opacity) to 1.5, preserving value+easing', () => {
    const out = moveKeyframeTime(ch(), 2, 1.5);
    expect(out.x!.map((k) => k.t)).toEqual([0, 1, 1.5]);
    expect(out.x!.find((k) => k.t === 1.5)!.value).toBe(1);
    const movedOpacity = out.opacity!.find((k) => k.t === 1.5)!;
    expect(movedOpacity.value).toBe(0);
    expect(movedOpacity.easing).toBe('easeOut'); // easing preserved
  });
  it('leaves a channel untouched (same ref) when it has no key at fromT', () => {
    const c = ch();
    const out = moveKeyframeTime(c, 1, 1.2); // only x is keyed at 1
    expect(out.opacity).toBe(c.opacity); // untouched reference
    expect(out.x!.map((k) => k.t)).toEqual([0, 1.2, 2]);
  });
  it('moved key wins on collision (drop the key already at toT)', () => {
    const out = moveKeyframeTime(ch(), 0, 1); // x already has a key at 1
    expect(out.x!.map((k) => k.t)).toEqual([1, 2]);
    expect(out.x!.find((k) => k.t === 1)!.value).toBe(0); // the moved (t=0→1) value, not the old t=1
  });
  it('is a no-op (same ref) when fromT≈toT', () => {
    const c = ch();
    expect(moveKeyframeTime(c, 2, 2)).toBe(c);
  });
});

describe('removeKeyframeTime', () => {
  it('removes the ◆ at t=2 from every channel keyed there', () => {
    const out = removeKeyframeTime(ch(), 2);
    expect(out.x!.map((k) => k.t)).toEqual([0, 1]);
    expect(out.opacity!.map((k) => k.t)).toEqual([0]);
  });
  it('keeps untouched channels by reference', () => {
    const c = ch();
    const out = removeKeyframeTime(c, 1); // only x keyed at 1
    expect(out.opacity).toBe(c.opacity);
  });
});

describe('nearestKeyframeTime', () => {
  it('finds the closest within maxDist, else null', () => {
    expect(nearestKeyframeTime([0, 1, 2], 1.1, 0.2)).toBe(1);
    expect(nearestKeyframeTime([0, 1, 2], 1.1, 0.05)).toBeNull();
  });
});

describe('transform adapters', () => {
  it('round-trips and drops emptied channels', () => {
    const tf = { x: [{ t: 0, value: 0 }], rotation: [{ t: 1, value: 90 }] };
    const c = transformToChannels(tf);
    expect(c.x).toBe(tf.x);
    const back = channelsToTransform(removeKeyframeTime(c, 1));
    expect(back.x).toEqual(tf.x);
    expect(back.rotation).toBeUndefined(); // emptied → dropped, no dangling []
  });
});
