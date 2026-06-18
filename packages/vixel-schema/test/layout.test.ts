/**
 * Layout resolvers — regions/grid/auto-layout are pure, deterministic, in-bounds,
 * and (for stack/grid) overlap-free. This is the "agent makes sense of XY" core,
 * so it's pinned hard.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRegion,
  resolveGridArea,
  resolvePlacement,
  grid,
  stack,
  inset,
  SAFE_MARGIN,
  type Rect,
} from '../src/index.js';

const within01 = (r: Rect) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('resolveRegion', () => {
  it('full is the whole canvas; safe is inside the margin', () => {
    expect(resolveRegion('full')).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const safe = resolveRegion('safe');
    expect(safe.x).toBeCloseTo(SAFE_MARGIN);
    expect(safe.w).toBeCloseTo(1 - SAFE_MARGIN * 2);
  });

  it('every named region stays within the canvas', () => {
    const names = [
      'safe', 'top', 'center', 'bottom', 'upper-third', 'middle-third', 'lower-third',
      'left-column', 'right-column', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
      'title', 'subtitle', 'caption',
    ] as const;
    for (const n of names) expect(within01(resolveRegion(n))).toBe(true);
  });

  it('left/right columns split the width and do not overlap', () => {
    const l = resolveRegion('left-column');
    const r = resolveRegion('right-column');
    expect(overlaps(l, r)).toBe(false);
  });
});

describe('resolveGridArea', () => {
  it('a full-span area equals the safe box', () => {
    expect(resolveGridArea({ col: [1, 12], row: [1, 12] })).toEqual(resolveRegion('safe'));
  });

  it('clamps an out-of-range span back inside the grid', () => {
    const r = resolveGridArea({ col: [10, 99], row: [1, 1] }); // span 99 → clamped to 3 remaining cols
    expect(within01(r)).toBe(true);
  });
});

describe('resolvePlacement', () => {
  it('dispatches region / grid / explicit-frame', () => {
    expect(resolvePlacement({ region: 'center' })).toEqual(resolveRegion('center'));
    expect(resolvePlacement({ col: [1, 6], row: [1, 6] })).toEqual(resolveGridArea({ col: [1, 6], row: [1, 6] }));
    const frame = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(resolvePlacement({ frame })).toBe(frame);
  });
});

describe('grid / stack — auto-layout never overlaps', () => {
  const area = resolveRegion('safe');

  it('grid cells are disjoint and in-bounds', () => {
    const cells = grid(area, 2, 2, 0.03);
    expect(cells).toHaveLength(4);
    for (const c of cells) expect(within01(c)).toBe(true);
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
  });

  it('stack cells are disjoint along the chosen axis', () => {
    const rows = stack(area, 3, { direction: 'vertical', gap: 0.02 });
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) expect(overlaps(rows[i]!, rows[j]!)).toBe(false);
  });

  it('inset shrinks within the source rect', () => {
    const r = inset(area, 0.1);
    expect(within01(r)).toBe(true);
    expect(r.x).toBeGreaterThan(area.x);
    expect(r.w).toBeLessThan(area.w);
  });
});
