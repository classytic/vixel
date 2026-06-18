/**
 * Entrance compiler — fade ramps 0→1, slides arrive from the motion direction and
 * settle at zero offset, pop scales up, and a fully-settled element is identity.
 */
import { describe, it, expect } from 'vitest';
import { entranceAt } from '../src/index.js';

describe('entranceAt', () => {
  it('fadeIn ramps opacity 0→1 over the in-window and holds at 1 after', () => {
    expect(entranceAt('fadeIn', undefined, 0, 4).opacity).toBeCloseTo(0);
    expect(entranceAt('fadeIn', undefined, 0.175, 4).opacity).toBeCloseTo(0.5); // half of 0.35
    expect(entranceAt('fadeIn', undefined, 1, 4).opacity).toBe(1);
  });

  it('slideUp starts offset BELOW (dy>0) and settles to zero', () => {
    const start = entranceAt('slideUp', undefined, 0, 4);
    expect(start.dy).toBeGreaterThan(0); // comes from below
    expect(start.dx).toBe(0);
    const settled = entranceAt('slideUp', undefined, 1, 4);
    expect(settled.dy).toBe(0);
  });

  it('slideLeft starts offset to the RIGHT (dx>0)', () => {
    expect(entranceAt('slideLeft', undefined, 0, 4).dx).toBeGreaterThan(0);
  });

  it('popIn scales up from <1 to 1', () => {
    expect(entranceAt('popIn', undefined, 0, 4).scale).toBeLessThan(1);
    expect(entranceAt('popIn', undefined, 1, 4).scale).toBeCloseTo(1);
  });

  it('a settled element with no exit is identity', () => {
    expect(entranceAt('slideUp', 'fadeOut', 2, 4)).toEqual({ opacity: 1, dx: 0, dy: 0, scale: 1 });
  });

  it('fadeOut ramps opacity back to 0 at the very end', () => {
    expect(entranceAt(undefined, 'fadeOut', 4, 4).opacity).toBeCloseTo(0);
  });

  it('clamps ramps to half the (short) duration without overshoot', () => {
    const s = entranceAt('fadeIn', undefined, 0.2, 0.4); // inDur clamped to 0.2
    expect(s.opacity).toBeCloseTo(1);
  });
});
