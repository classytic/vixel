/**
 * Layout — semantic placement so an agent positions elements by MEANING, not
 * pixel math. This is the "agent makes sense of XY" layer.
 * ========================================================================
 * LLMs are unreliable at raw `{x,y,w,h}` but fluent in layout language they've
 * seen everywhere (CSS grid, "lower third", "right column"). So an element
 * carries a {@link Placement} — a named {@link RegionName}, a 12×12 {@link GridArea},
 * or an explicit frame — and `normalizeSpec` resolves it, PURELY, to a
 * {@link Rect} that folds into `transform.frame`. The renderers (ffmpeg + Pixi)
 * therefore only ever see a resolved frame: zero layout logic downstream, so the
 * two backends can't disagree.
 *
 * The auto-layout helpers ({@link grid}/{@link stack}/{@link inset}) let templates
 * place N elements with NO overlap by construction — the other half of why an
 * agent never needs to reason about collisions.
 */
import type { Rect } from './transform.js';

/** Safe-area inset (fraction of canvas) kept clear of every region/grid edge — keeps content off the bleed + platform UI. */
export const SAFE_MARGIN = 0.05;

/** Canvas grid resolution. 12×12 mirrors the CSS-grid model agents already know. */
export const GRID_COLS = 12;
export const GRID_ROWS = 12;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * A CSS-grid-style area on the {@link GRID_COLS}×{@link GRID_ROWS} canvas grid.
 * `[start, span]` with a 1-based start (row 1 / col 1 = top-left cell).
 */
export interface GridArea {
  /** `[startColumn, columnSpan]`, 1-based. */
  col: [number, number];
  /** `[startRow, rowSpan]`, 1-based. */
  row: [number, number];
}

/** Named semantic zones — the agent's first-choice vocabulary (no numbers at all). */
export type RegionName =
  | 'full' // the entire canvas, ignoring the safe margin (full-bleed media)
  | 'safe' // the whole safe area (inside the margin)
  | 'top' | 'center' | 'bottom'
  | 'upper-third' | 'middle-third' | 'lower-third'
  | 'left-column' | 'right-column'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'title' // headline band near the top
  | 'subtitle' // sits just under `title`
  | 'caption'; // caption-safe band near the bottom (clear of platform UI)

/** The named regions, defined as grid areas (so they snap to the same grid as explicit `GridArea`s). */
const REGION_AREAS: Record<Exclude<RegionName, 'full'>, GridArea> = {
  safe: { col: [1, 12], row: [1, 12] },
  top: { col: [1, 12], row: [1, 4] },
  center: { col: [1, 12], row: [5, 4] },
  bottom: { col: [1, 12], row: [9, 4] },
  'upper-third': { col: [1, 12], row: [1, 4] },
  'middle-third': { col: [1, 12], row: [5, 4] },
  'lower-third': { col: [1, 12], row: [9, 4] },
  'left-column': { col: [1, 6], row: [1, 12] },
  'right-column': { col: [7, 6], row: [1, 12] },
  'top-left': { col: [1, 6], row: [1, 6] },
  'top-right': { col: [7, 6], row: [1, 6] },
  'bottom-left': { col: [1, 6], row: [7, 6] },
  'bottom-right': { col: [7, 6], row: [7, 6] },
  title: { col: [1, 12], row: [2, 3] },
  subtitle: { col: [1, 12], row: [5, 2] },
  caption: { col: [1, 12], row: [10, 2] },
};

/** Resolve a {@link GridArea} to a normalized {@link Rect}, inset by `margin`. Pure, clamped in-bounds. */
export function resolveGridArea(area: GridArea, margin = SAFE_MARGIN): Rect {
  const usable = 1 - margin * 2;
  const cw = usable / GRID_COLS;
  const rh = usable / GRID_ROWS;
  const cStart = clamp(area.col[0], 1, GRID_COLS);
  const rStart = clamp(area.row[0], 1, GRID_ROWS);
  const cSpan = clamp(area.col[1], 1, GRID_COLS - (cStart - 1));
  const rSpan = clamp(area.row[1], 1, GRID_ROWS - (rStart - 1));
  return {
    x: margin + (cStart - 1) * cw,
    y: margin + (rStart - 1) * rh,
    w: cSpan * cw,
    h: rSpan * rh,
  };
}

/** Resolve a named {@link RegionName} to a normalized {@link Rect}. Pure. */
export function resolveRegion(region: RegionName, margin = SAFE_MARGIN): Rect {
  if (region === 'full') return { x: 0, y: 0, w: 1, h: 1 };
  return resolveGridArea(REGION_AREAS[region], margin);
}

/**
 * Semantic placement for any visual element — the value of `OverlayBase.place`.
 * Resolved to a frame by {@link resolvePlacement} (and folded into `transform.frame`
 * by `normalizeSpec`). Precedence over the legacy spatial fields; an explicit
 * `transform.frame` still wins over `place`.
 */
export type Placement =
  | { region: RegionName }
  | GridArea
  | { frame: Rect };

/** Resolve any {@link Placement} to a normalized {@link Rect}. Pure. */
export function resolvePlacement(place: Placement, margin = SAFE_MARGIN): Rect {
  if ('frame' in place) return place.frame;
  if ('region' in place) return resolveRegion(place.region, margin);
  return resolveGridArea(place, margin);
}

/** Shrink a rect inward by `dx`/`dy` (fractions OF THE RECT). Used to pad content inside a card. Pure. */
export function inset(rect: Rect, dx: number, dy = dx): Rect {
  const px = rect.w * dx;
  const py = rect.h * dy;
  return { x: rect.x + px, y: rect.y + py, w: rect.w - px * 2, h: rect.h - py * 2 };
}

/** Lay a rect out into `count` evenly-sized cells along one axis with a `gap`. No overlap by construction. Pure. */
export function stack(
  area: Rect,
  count: number,
  opts: { direction?: 'vertical' | 'horizontal'; gap?: number } = {},
): Rect[] {
  const n = Math.max(1, Math.floor(count));
  const gap = opts.gap ?? 0.02;
  const vertical = (opts.direction ?? 'vertical') === 'vertical';
  const total = vertical ? area.h : area.w;
  const cell = (total - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) =>
    vertical
      ? { x: area.x, y: area.y + i * (cell + gap), w: area.w, h: cell }
      : { x: area.x + i * (cell + gap), y: area.y, w: cell, h: area.h },
  );
}

/**
 * Lay a rect out into a `rows`×`cols` grid (row-major) with a uniform `gap`. The
 * one-call auto-layout templates use to place N cards without computing a single
 * coordinate. Returns `rows*cols` cells; callers take the first N. Pure.
 */
export function grid(area: Rect, rows: number, cols: number, gap = 0.025): Rect[] {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const cw = (area.w - gap * (c - 1)) / c;
  const ch = (area.h - gap * (r - 1)) / r;
  const cells: Rect[] = [];
  for (let ri = 0; ri < r; ri++) {
    for (let ci = 0; ci < c; ci++) {
      cells.push({ x: area.x + ci * (cw + gap), y: area.y + ri * (ch + gap), w: cw, h: ch });
    }
  }
  return cells;
}
