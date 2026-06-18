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

/** The drawable primitive. `line` uses the frame's diagonal; the rest fill the frame. */
export type ShapeKind = 'rect' | 'roundedRect' | 'ellipse' | 'line';

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
  /** Corner radius in px (only meaningful for `roundedRect`). A large value → pill/chip. */
  cornerRadius?: number;
  shadow?: ShapeShadow;
  /** Frosted-glass blur of the content behind this shape. */
  backdrop?: ShapeBackdrop;
}
