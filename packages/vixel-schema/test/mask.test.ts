/**
 * Clip mask — resolve a (possibly animated) mask to the concrete shape/frame the
 * renderer draws. Static fallback + keyframed channels reuse the keyframe sampler.
 */
import { describe, it, expect } from 'vitest';
import { resolveMaskAt, type ClipMask } from '../src/index.js';

const RECT = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

describe('resolveMaskAt', () => {
  it('static mask → its frame, defaults (rect / no feather / not inverted)', () => {
    const m: ClipMask = { frame: RECT };
    expect(resolveMaskAt(m, 0)).toEqual({ shape: 'rect', frame: RECT, feather: 0, invert: false });
  });

  it('carries shape / feather / invert through', () => {
    const m: ClipMask = { shape: 'ellipse', frame: RECT, feather: 0.1, invert: true };
    const r = resolveMaskAt(m, 5);
    expect(r.shape).toBe('ellipse');
    expect(r.feather).toBeCloseTo(0.1);
    expect(r.invert).toBe(true);
  });

  it('clamps negative feather to 0', () => {
    expect(resolveMaskAt({ frame: RECT, feather: -0.5 }, 0).feather).toBe(0);
  });

  it('animates the mask region from keyframed channels (a mask that travels)', () => {
    const m: ClipMask = {
      shape: 'ellipse',
      frame: RECT,
      keyframes: {
        x: [{ t: 0, value: 0, easing: 'linear' }, { t: 2, value: 0.5 }],
      },
    };
    expect(resolveMaskAt(m, 0).frame.x).toBeCloseTo(0); // start
    expect(resolveMaskAt(m, 1).frame.x).toBeCloseTo(0.25); // halfway
    expect(resolveMaskAt(m, 2).frame.x).toBeCloseTo(0.5); // end
    // un-keyframed channels fall back to the static frame
    expect(resolveMaskAt(m, 1).frame.w).toBe(RECT.w);
  });

  it('path mask carries its polygon points through (freeform / rotoscope)', () => {
    const points = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.3 }, { x: 0.5, y: 0.9 }];
    const m: ClipMask = { shape: 'path', frame: RECT, points };
    const r = resolveMaskAt(m, 0);
    expect(r.shape).toBe('path');
    expect(r.points).toEqual(points);
  });

  it('animated feather is sampled + clamped', () => {
    const m: ClipMask = {
      frame: RECT,
      feather: 0,
      keyframes: { feather: [{ t: 0, value: 0, easing: 'linear' }, { t: 1, value: 0.2 }] },
    };
    expect(resolveMaskAt(m, 0.5).feather).toBeCloseTo(0.1);
  });
});
