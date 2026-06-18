/**
 * Text DESIGN → Pixi mapping — turns the schema's normalized {@link ResolvedTextDesign}
 * (the SVG-like layer stack) into Pixi v8 `TextStyle` props. The FRONT fill + first
 * stroke + first shadow map onto a single `PIXI.Text` (covers solid/gradient/texture
 * + one stroke + one drop-shadow); BACK fill layers (3D offset / stacked) render as
 * extra Text nodes behind it (see `reconcileFillLayers` in the text clip).
 *
 * Invariant: a PLAIN solid style (the common case — `fillColor` lifted to a single
 * solid fill, one stroke from `stroke`, one shadow from `shadow`/`glow`) maps to
 * EXACTLY what the renderer drew before, so this is a zero-regression upgrade.
 */
import type * as PIXINS from 'pixi.js';
import type { ResolvedTextDesign, TextFill, TextShadow } from '@classytic/vixel-schema';
import type { Pixi } from '../types.js';

/** A Pixi fill input — a color, a v8 `FillGradient`, or a texture `FillPattern` (in a FillStyle). */
export type PixiFill = string | { color: string; alpha?: number } | PIXINS.FillGradient | PIXINS.FillStyle;

/** Resolves a texture URL → loaded Texture (or null while loading). See `text-texture.ts`. */
export type TextureResolver = (url: string) => PIXINS.Texture | null;

/**
 * Map one {@link TextFill} to a Pixi fill. Gradients use `textureSpace: 'local'`
 * (coords 0..1 of the glyph bounds); a texture fill becomes a `FillPattern` scaled to
 * the glyphs (the distress-grunge look) once `getTexture` resolves the source — until
 * then it falls back to white (the renderer re-runs when the texture loads).
 */
export function pixiFill(PIXI: Pixi, fill: TextFill, getTexture?: TextureResolver): PixiFill {
  switch (fill.type) {
    case 'solid':
      return fill.opacity != null ? { color: fill.color, alpha: fill.opacity } : fill.color;
    case 'linear': {
      const a = ((fill.angle ?? 90) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return new PIXI.FillGradient({
        type: 'linear',
        start: { x: 0.5 - 0.5 * cos, y: 0.5 - 0.5 * sin },
        end: { x: 0.5 + 0.5 * cos, y: 0.5 + 0.5 * sin },
        colorStops: fill.stops.map((s) => ({ offset: s.offset, color: s.color })),
        textureSpace: 'local',
      });
    }
    case 'radial':
      return new PIXI.FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: fill.stops.map((s) => ({ offset: s.offset, color: s.color })),
        textureSpace: 'local',
      });
    case 'texture': {
      const tex = getTexture?.(fill.source) ?? null;
      if (!tex) return fill.opacity != null ? { color: '#ffffff', alpha: fill.opacity } : '#ffffff';
      // `local` scales the texture to each glyph-run's bounds so the pattern maps onto
      // the letters (vs tiling at native px). Opacity rides on the FillStyle wrapper.
      const pattern = new PIXI.FillPattern({ texture: tex, repetition: 'no-repeat', textureSpace: 'local' });
      return { fill: pattern, alpha: fill.opacity ?? 1 } as PIXINS.FillStyle;
    }
  }
}

/** Map a {@link TextShadow} to Pixi's single `dropShadow` (distance+angle from dx/dy). */
export function pixiDropShadow(sh: TextShadow | undefined): PIXINS.TextDropShadow | undefined {
  if (!sh) return undefined;
  const dx = sh.dx ?? 0;
  const dy = sh.dy ?? 0;
  return {
    color: sh.color,
    alpha: sh.opacity ?? 1,
    blur: sh.blur ?? 0,
    distance: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx),
  } as PIXINS.TextDropShadow;
}

/** Base (non-design) text props the caller already resolved. */
export interface TextStyleBase {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  wrapWidth: number;
}

/**
 * Build the Pixi `TextStyle` object for the FRONT (visible) text: the front-most
 * fill, the first stroke, and the first shadow as `dropShadow`. Back fill layers and
 * extra strokes/shadows are handled by the caller's stacked-layer pass.
 */
export function buildFrontTextStyle(
  PIXI: Pixi,
  design: ResolvedTextDesign,
  base: TextStyleBase,
  getTexture?: TextureResolver,
): PIXINS.TextStyleOptions {
  const front = design.fills[design.fills.length - 1]!.fill;
  const stroke = design.strokes[0];
  // Pixi `Text` supports ONE dropShadow, so a multi-halo design (e.g. neon bloom's two
  // glows) can only show one here — pick the DOMINANT shadow (largest blur+offset)
  // rather than blindly taking shadows[0], which may be the faint inner halo. Believable
  // glow either way; true multi-halo stacking (blurred Text layers) is a follow-up.
  const shadowWeight = (s: TextShadow) => (s.blur ?? 0) + Math.hypot(s.dx ?? 0, s.dy ?? 0);
  const dropShadow = pixiDropShadow(
    design.shadows.length
      ? design.shadows.reduce((best, s) => (shadowWeight(s) > shadowWeight(best) ? s : best))
      : undefined,
  );
  return {
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    fontWeight: base.bold ? 'bold' : 'normal',
    fontStyle: base.italic ? 'italic' : 'normal',
    fill: pixiFill(PIXI, front, getTexture) as PIXINS.FillInput,
    align: base.align,
    letterSpacing: base.letterSpacing,
    wordWrap: true,
    wordWrapWidth: base.wrapWidth,
    breakWords: true,
    // Honor explicit `\n` (the panel Textarea's Enter) AND auto-wrap long lines —
    // a text box's contract. (Pixi's default whiteSpace doesn't preserve newlines.)
    whiteSpace: 'pre-line',
    lineHeight: Math.round(base.fontSize * 1.25),
    ...(stroke ? { stroke: { color: stroke.color, width: stroke.width } } : {}),
    ...(dropShadow ? { dropShadow } : {}),
  };
}

/** Style for ONE back fill layer (3D extrude / stacked) — just its fill + the base
 *  font (no stroke/shadow; those belong to the front). Shared by the static layer
 *  compositor and the per-token motion layers. */
export function buildLayerTextStyle(
  PIXI: Pixi,
  fill: TextFill,
  base: TextStyleBase,
  getTexture?: TextureResolver,
): PIXINS.TextStyleOptions {
  return {
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    fontWeight: base.bold ? 'bold' : 'normal',
    fontStyle: base.italic ? 'italic' : 'normal',
    fill: pixiFill(PIXI, fill, getTexture) as PIXINS.FillInput,
    align: base.align,
    letterSpacing: base.letterSpacing,
    wordWrap: true,
    wordWrapWidth: base.wrapWidth,
    breakWords: true,
    // Honor explicit `\n` (the panel Textarea's Enter) AND auto-wrap long lines —
    // a text box's contract. (Pixi's default whiteSpace doesn't preserve newlines.)
    whiteSpace: 'pre-line',
    lineHeight: Math.round(base.fontSize * 1.25),
  };
}
