/**
 * Shapes — vector primitives (the Canva/CapCut "design" layer).
 * ============================================================
 * A {@link ShapeOverlay} is a sibling of text/image/video: it carries the SAME
 * {@link VisualTransform}, `place`, `z`, `effects`, and enter/exit as every
 * overlay, so move/resize/rotate/opacity + keyframes come for free — a shape is
 * just "a thing to animate that isn't media or text". This module owns the
 * VISUAL look ({@link ShapeStyle}); geometry lives in the transform/layout layer.
 *
 * Ready-made looks (`glass`, `card`, `chip`…) live in `shape-presets.ts` and are
 * INLINED by `normalizeSpec` (no preset id persists), exactly like text-presets —
 * so specs stay self-contained and both renderers resolve the same field bag.
 */

/**
 * The drawable primitive. All but `line` fill the frame box:
 *  - `rect` / `roundedRect` / `ellipse` — axis-aligned, inscribed in the frame.
 *  - `triangle` / `polygon` / `star` — regular n-gons / stars inscribed in the frame
 *    (point-up), parameterised by {@link ShapeStyle.sides} / `points` / `innerRatio`.
 *  - `path` — an arbitrary SVG path (`d`) in {@link ShapeStyle.pathViewBox} coords,
 *    stretched to fill the frame. The escape hatch for any custom vector silhouette.
 *  - `line` — a horizontal rule across the frame's vertical centre (rotate via the
 *    transform for other angles); needs a `stroke` to be visible.
 */
export type ShapeKind = 'rect' | 'roundedRect' | 'ellipse' | 'line' | 'triangle' | 'polygon' | 'star' | 'path';

/** Fill of a shape — a flat color or a linear gradient. */
export interface ShapeFill {
  /** Flat fill `#RRGGBB`. */
  color?: string;
  /** Fill opacity 0..1 (default 1). Lets a `#RRGGBB` color be translucent (frosted glass). */
  opacity?: number;
  /** Linear gradient (overrides `color` when present). `angle` in degrees, 0 = left→right. */
  gradient?: { from: string; to: string; angle?: number };
}

/** Outline of a shape. */
export interface ShapeStroke {
  color: string;
  /** Stroke width in px. */
  width: number;
  /** Stroke opacity 0..1 (default 1). */
  opacity?: number;
}

/** Drop shadow under a shape. */
export interface ShapeShadow {
  color?: string;
  /** Gaussian blur radius in px. */
  blur?: number;
  /** Offset in px. */
  x?: number;
  y?: number;
  /** 0..1 (default ~0.25). */
  opacity?: number;
}

/** Frosted-glass backdrop: blur the COMPOSITED CONTENT BEHIND the shape within its frame. */
export interface ShapeBackdrop {
  /** Gaussian blur radius (px) applied to what's behind the shape. */
  blur: number;
}

/**
 * The visual style of a shape — everything EXCEPT geometry (geometry is the
 * overlay's `transform`/`place`). This is the field bag a preset resolves to and
 * an editor edits.
 */
export interface ShapeStyle {
  fill?: ShapeFill;
  stroke?: ShapeStroke;
  /** Corner radius in px (only meaningful for `roundedRect`). A large value → pill/chip.
   *  Unset on a `roundedRect` → a proportional default (~12% of the smaller side). */
  cornerRadius?: number;
  /** `polygon` side count (default 6). Ignored by `triangle` (always 3). */
  sides?: number;
  /** `star` point count (default 5). */
  points?: number;
  /** `star` inner-radius ratio 0..1 (default 0.5) — smaller = spikier. */
  innerRatio?: number;
  /** `path` kind: the SVG path data (`d`), in {@link pathViewBox} coords, stretched to the frame. */
  path?: string;
  /** Coordinate space the `path` is authored in (default 100×100); the path is scaled to the frame. */
  pathViewBox?: { w: number; h: number };
  shadow?: ShapeShadow;
  /** Frosted-glass blur of the content behind this shape. */
  backdrop?: ShapeBackdrop;
}

/** Kinds whose outline is a polygon ring computed by {@link shapeVertices}. */
export type PolygonalShapeKind = 'triangle' | 'polygon' | 'star';

/**
 * The outline vertices of a polygonal shape (`triangle`/`polygon`/`star`), inscribed
 * in a `w`×`h` box and CENTERED ON THE ORIGIN (range -w/2..w/2, -h/2..h/2), first
 * vertex pointing up. ONE source of truth so the Pixi preview and the server SVG
 * raster draw byte-identical geometry. Returns `[x, y]` pairs in draw order.
 */
export function shapeVertices(
  kind: PolygonalShapeKind,
  w: number,
  h: number,
  opts: { sides?: number | undefined; points?: number | undefined; innerRatio?: number | undefined } = {},
): Array<[number, number]> {
  const rx = w / 2;
  const ry = h / 2;
  const top = -Math.PI / 2; // first vertex points up
  const out: Array<[number, number]> = [];
  if (kind === 'star') {
    const p = Math.max(3, Math.round(opts.points ?? 5));
    const inner = Math.min(1, Math.max(0.05, opts.innerRatio ?? 0.5));
    for (let i = 0; i < p * 2; i++) {
      const a = top + (i * Math.PI) / p;
      const k = i % 2 === 0 ? 1 : inner;
      out.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
    }
  } else {
    const n = kind === 'triangle' ? 3 : Math.max(3, Math.round(opts.sides ?? 6));
    for (let i = 0; i < n; i++) {
      const a = top + (i * 2 * Math.PI) / n;
      out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
  }
  return out;
}
