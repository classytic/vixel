/**
 * Layout — resolution-independent positioning for overlays.
 * ========================================================
 * An agent positions overlays SEMANTICALLY — a named {@link Anchor} or a
 * normalized `{x,y}` in 0..1 — never raw pixels. vixel resolves that to ffmpeg
 * `overlay` x/y EXPRESSIONS using the filter's own `W,H` (main/canvas) and
 * `w,h` (overlay) variables, so placement adapts to both the canvas size and the
 * overlay's own size automatically — no probing, no pixel math by the caller.
 *
 *   anchor 'bottom-center', margin 5%  →  x=(W-w)/2          y=H-h-H*0.05
 *   normalized {x:0.5,y:0.9} (center)  →  x=(W*0.5)-(w/2)    y=(H*0.9)-(h/2)
 */

import type { Anchor } from './schema.js';

export interface OverlayXY {
  /** ffmpeg `overlay=x=` expression. */
  readonly x: string;
  /** ffmpeg `overlay=y=` expression. */
  readonly y: string;
}

const f = (n: number) => String(Number(n.toFixed(4)));

/**
 * Resolve a position to ffmpeg overlay x/y expressions.
 * @param marginFrac edge inset as a fraction of the canvas (default 5%).
 */
export function overlayXY(
  position: Anchor | { x: number; y: number } | undefined,
  marginFrac = 0.05,
): OverlayXY {
  // Normalized coordinate = the CENTER of the overlay box.
  if (position && typeof position === 'object') {
    return { x: `(W*${f(position.x)})-(w/2)`, y: `(H*${f(position.y)})-(h/2)` };
  }

  const m = f(marginFrac);
  const left = `W*${m}`;
  const right = `W-w-W*${m}`;
  const cx = `(W-w)/2`;
  const top = `H*${m}`;
  const bottom = `H-h-H*${m}`;
  const cy = `(H-h)/2`;

  const map: Record<Anchor, OverlayXY> = {
    'top-left': { x: left, y: top },
    top: { x: cx, y: top },
    'top-right': { x: right, y: top },
    'center-left': { x: left, y: cy },
    center: { x: cx, y: cy },
    'center-right': { x: right, y: cy },
    'bottom-left': { x: left, y: bottom },
    bottom: { x: cx, y: bottom },
    'bottom-right': { x: right, y: bottom },
  };
  return map[position ?? 'center'];
}

/**
 * Resolve an overlay's target width in pixels from a canvas-relative fraction
 * (and an optional scale multiplier). Height is left to `-1` (aspect-preserved).
 * Defaults to 25% of the canvas width when no width is given.
 */
export function overlayWidthPx(
  canvasWidth: number,
  widthFrac: number | undefined,
  scale: number | undefined,
): number {
  const frac = widthFrac ?? 0.25;
  return Math.max(2, Math.round(frac * canvasWidth * (scale ?? 1)));
}
