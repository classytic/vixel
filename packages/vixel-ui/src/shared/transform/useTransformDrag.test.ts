import { describe, it, expect } from 'vitest';
import { applyResize, applyResizeRotated, normalizeAngle } from './useTransformDrag.js';

const F = { x: 0.2, y: 0.2, w: 0.5, h: 0.4 };

describe('applyResize', () => {
  it('move translates the origin and clamps into [0,1]', () => {
    const r = applyResize('move', F, 0.1, -0.1);
    expect(r.x).toBeCloseTo(0.3, 6);
    expect(r.y).toBeCloseTo(0.1, 6);
    expect(r.w).toBe(0.5);
    expect(r.h).toBe(0.4);
    expect(applyResize('move', F, -1, -1)).toMatchObject({ x: 0, y: 0 }); // clamped
  });

  it('east/south edges grow width/height from the fixed top-left', () => {
    const r = applyResize('se', F, 0.1, 0.1);
    expect(r.x).toBe(0.2);
    expect(r.y).toBe(0.2);
    expect(r.w).toBeCloseTo(0.6, 6);
    expect(r.h).toBeCloseTo(0.5, 6);
  });

  it('west/north edges move the origin so the opposite edge stays put', () => {
    const r = applyResize('nw', F, 0.1, 0.1); // shrink from top-left
    expect(r.w).toBeCloseTo(0.4, 6);
    expect(r.h).toBeCloseTo(0.3, 6);
    expect(r.x).toBeCloseTo(0.3, 6); // x + w stays at 0.7
    expect(r.y).toBeCloseTo(0.3, 6); // y + h stays at 0.6
  });

  it('honors the minimum size floor', () => {
    expect(applyResize('e', F, -1, 0, 0.05).w).toBe(0.05);
  });
});

describe('applyResizeRotated', () => {
  it('matches applyResize when rotation is 0', () => {
    for (const m of ['se', 'nw', 'e', 'n'] as const) {
      expect(applyResizeRotated(m, F, 0.1, 0.07, 0)).toEqual(applyResize(m, F, 0.1, 0.07));
    }
  });

  it('at 90° a screen-y drag changes width (local x), height unchanged', () => {
    // θ=90°: local-x axis points along screen +y. Dragging the east handle down by
    // 0.1 should grow width by ~0.1 and leave height alone.
    const r = applyResizeRotated('e', F, 0, 0.1, 90);
    expect(r.w).toBeCloseTo(0.6, 6);
    expect(r.h).toBeCloseTo(F.h, 6);
  });

  it('keeps the opposite (west) edge fixed in world space when resizing east', () => {
    const th = (37 * Math.PI) / 180;
    const c0 = { x: F.x + F.w / 2, y: F.y + F.h / 2 };
    const westWorld = (f: typeof F) => {
      const cc = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
      const ax = -f.w / 2;
      return { x: cc.x + ax * Math.cos(th), y: cc.y + ax * Math.sin(th) };
    };
    const before = { x: c0.x - F.w / 2 * Math.cos(th), y: c0.y - F.w / 2 * Math.sin(th) };
    const r = applyResizeRotated('e', F, 0.05, 0.03, 37);
    const after = westWorld(r);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('normalizeAngle', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(540)).toBe(180);
    expect(normalizeAngle(360)).toBe(0);
  });
});
