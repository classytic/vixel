/**
 * sampleClipMotion — folds entrance/exit ⊗ loop into one MotionSample. Tests the
 * FOLD (it composes the two samplers), not the samplers' internals (covered by
 * entrance/text-animation tests).
 */
import { describe, it, expect } from 'vitest';
import { sampleClipMotion, entranceAt, loopAt, type VisualClip } from '../src/index.js';

const clip = (extra: Partial<VisualClip>): VisualClip => ({ media: { kind: 'text', text: 'x' }, at: 0, duration: 2, ...extra });

describe('sampleClipMotion', () => {
  it('neutral when no enter/exit/loop', () => {
    expect(sampleClipMotion(clip({}), 1, 2)).toEqual({ dx: 0, dy: 0, rotation: 0, opacity: 1, scale: 1 });
  });

  it('folds entrance ⊗ loop (offsets add, scale multiplies, rotation from loop)', () => {
    const t = 0.1;
    const c = clip({ enter: 'popIn', loop: 'pulse' });
    const e = entranceAt('popIn', undefined, t, 2);
    const lp = loopAt('pulse', t);
    const m = sampleClipMotion(c, t, 2);
    expect(m.dx).toBeCloseTo(e.dx + lp.dx, 6);
    expect(m.dy).toBeCloseTo(e.dy + lp.dy, 6);
    expect(m.scale).toBeCloseTo(e.scale * lp.scale, 6);
    expect(m.opacity).toBeCloseTo(e.opacity, 6);
    expect(m.rotation).toBeCloseTo(lp.rotation, 6);
  });

  it('fadeIn ramps opacity from 0 at the clip start', () => {
    expect(sampleClipMotion(clip({ enter: 'fadeIn' }), 0, 2).opacity).toBe(0);
  });

  it('a loop alone animates with neutral opacity (works on any clip kind)', () => {
    const c = clip({ media: { kind: 'image', source: 's' }, loop: 'pulse' });
    // Across the loop period the scale must deviate from 1 somewhere (it's animating).
    const scales = Array.from({ length: 12 }, (_, i) => sampleClipMotion(c, i * 0.25, 100).scale);
    expect(scales.some((s) => Math.abs(s - 1) > 1e-4)).toBe(true);
    expect(sampleClipMotion(c, 0.3, 100).opacity).toBe(1); // loop never changes opacity
  });
});
