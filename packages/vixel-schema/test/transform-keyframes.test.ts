/**
 * resolveTransformAt — bake a transform's keyframed channels into a concrete
 * transform the renderer applies (frame/rotation/opacity), per-frame, shared by
 * every Pixi renderer. Un-keyframed channels fall back to the static value.
 */
import { describe, it, expect } from 'vitest';
import { resolveTransformAt, type VisualTransform } from '../src/index.js';

describe('resolveTransformAt', () => {
  it('no keyframes → returns the input unchanged (zero overhead)', () => {
    const t: VisualTransform = { frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, opacity: 1 };
    expect(resolveTransformAt(t, 2)).toBe(t);
    expect(resolveTransformAt(undefined, 2)).toBeUndefined();
  });

  it('animates only the keyframed channels; others keep the static frame value', () => {
    const t: VisualTransform = {
      frame: { x: 0, y: 0.25, w: 0.5, h: 0.5 },
      keyframes: { x: [{ t: 0, value: 0, easing: 'linear' }, { t: 2, value: 0.5 }] },
    };
    const at1 = resolveTransformAt(t, 1)!;
    expect(at1.frame!.x).toBeCloseTo(0.25); // halfway across the x ramp
    expect(at1.frame!.y).toBe(0.25); // un-keyframed → static
    expect(at1.frame!.w).toBe(0.5);
  });

  it('keyframes rotation + opacity independently of the frame', () => {
    const t: VisualTransform = {
      frame: { x: 0, y: 0, w: 1, h: 1 },
      keyframes: {
        rotation: [{ t: 0, value: 0, easing: 'linear' }, { t: 1, value: 90 }],
        opacity: [{ t: 0, value: 1, easing: 'linear' }, { t: 1, value: 0 }],
      },
    };
    const at = resolveTransformAt(t, 0.5)!;
    expect(at.rotation).toBeCloseTo(45);
    expect(at.opacity).toBeCloseTo(0.5);
    expect(at.frame).toEqual({ x: 0, y: 0, w: 1, h: 1 }); // no frame channels → untouched
  });
});
