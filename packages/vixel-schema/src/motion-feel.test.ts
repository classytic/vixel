import { describe, it, expect } from 'vitest';
import { MOTION_FEELS, resolveEntranceOptions } from './motion-feel.js';
import { entranceAt } from './entrance.js';

describe('resolveEntranceOptions', () => {
  it('absent timing ⇒ {} (engine defaults, no behavior change)', () => {
    expect(resolveEntranceOptions(undefined)).toEqual({});
    expect(resolveEntranceOptions({})).toEqual({}); // feel defaults to "default" = {}
  });
  it('expands a named feel to its bundle', () => {
    const snappy = MOTION_FEELS.find((f) => f.id === 'snappy')!.options;
    expect(resolveEntranceOptions({ feel: 'snappy' })).toEqual(snappy);
  });
  it('explicit inDur/outDur override the feel', () => {
    const out = resolveEntranceOptions({ feel: 'snappy', inDur: 0.4 });
    expect(out.inDur).toBe(0.4); // override wins
    expect(out.outDur).toBe(0.18); // feel value kept
    expect(out.enterEasing).toBe('easeOutExpo'); // feel easing kept
  });
});

describe('entranceAt — easing wiring preserves the historical defaults', () => {
  const dur = 2;
  // Mid-entrance for a slideUp: at localT halfway through the default 0.35s ramp.
  it('no opts == easeOut enter / easeIn exit (the pre-refactor curve)', () => {
    const noOpts = entranceAt('slideUp', undefined, 0.175, dur);
    const explicit = entranceAt('slideUp', undefined, 0.175, dur, { enterEasing: 'easeOut' });
    expect(noOpts.dy).toBeCloseTo(explicit.dy, 10);
    // p=0.5 → easeOut(0.5)=1-0.5^3=0.875 → dy = -(-0.06)*(1-0.875) = ... just assert sign + nonzero.
    expect(noOpts.dy).toBeGreaterThan(0); // arriving from below (negative motion vec), residual +offset
  });
  it('a different enterEasing changes the MOTION but never the opacity (opacity stays linear)', () => {
    const a = entranceAt('slideUp', undefined, 0.175, dur, { enterEasing: 'linear' });
    const b = entranceAt('slideUp', undefined, 0.175, dur, { enterEasing: 'easeOutExpo' });
    expect(a.dy).not.toBeCloseTo(b.dy, 5); // easing affects slide offset
    expect(a.opacity).toBeCloseTo(b.opacity, 10); // opacity ramp is linear regardless
    expect(a.opacity).toBeCloseTo(0.5, 5); // p = 0.175/0.35
  });
});
