/**
 * Text DESIGN — the "look" of text as a declarative LAYER STACK (SVG / Photoshop
 * model), the half of the text system distinct from {@link TextMotion} (the
 * "motion"). A rich style (gradient + texture fill, multiple strokes, 3D offset,
 * neon) is DATA — a stack of fills + strokes + shadows with an SVG-like
 * `paint-order` — so built-in styles scale to hundreds without code and a host/agent
 * can BYO new ones (see {@link TextPreset}).
 *
 * The flat legacy fields (`fillColor`/`stroke`/`shadow`/`glow`) stay as sugar;
 * {@link resolveTextDesign} lifts EITHER form into ONE normalized {@link
 * ResolvedTextDesign} that every renderer consumes — so old specs render
 * identically and there is a single source of truth across Pixi / ffmpeg / the
 * SVG-thumbnail path.
 */
import type { TextStyle } from './captions.js';

/** A gradient color stop (`offset` 0..1). */
export interface ColorStop {
  offset: number;
  color: string;
}

export interface SolidFill {
  type: 'solid';
  color: string;
  opacity?: number;
}
export interface LinearGradientFill {
  type: 'linear';
  stops: ColorStop[];
  /** Gradient direction in degrees (0 = left→right, 90 = top→bottom). Default 90. */
  angle?: number;
  opacity?: number;
}
export interface RadialGradientFill {
  type: 'radial';
  stops: ColorStop[];
  opacity?: number;
}
/** A patterned/textured fill (e.g. a distressed-grunge PNG) — the screenshot look. */
export interface TextureFill {
  type: 'texture';
  /** Image/pattern URL (resolved against a pack baseUrl, like effect sources). */
  source: string;
  opacity?: number;
}
export type TextFill = SolidFill | LinearGradientFill | RadialGradientFill | TextureFill;

/** One fill LAYER — a paint plus its placement (offset = 3D/emboss/stacked look). */
export interface TextFillLayer {
  fill: TextFill;
  /** Offset as a fraction of the font size (for 3D / drop / emboss duplicates). Default 0. */
  dx?: number;
  dy?: number;
  /** Compositing against the layers beneath. Default `'normal'`. */
  blend?: 'normal' | 'multiply' | 'screen' | 'overlay';
  /** Gaussian blur in px (e.g. a soft glow fill behind the crisp top fill). */
  blur?: number;
}

export interface TextStroke {
  color: string;
  /** Stroke width in px. */
  width: number;
  opacity?: number;
}

export interface TextShadow {
  color: string;
  /** Offset in px (0,0 + blur = a centered glow/halo). */
  dx?: number;
  dy?: number;
  blur?: number;
  opacity?: number;
}

/** SVG `paint-order`: do the strokes sit OVER the fills, or under them? */
export type PaintOrder = 'fill-stroke' | 'stroke-fill';

/** The ONE normalized representation every renderer reads (flat OR layered → this). */
export interface ResolvedTextDesign {
  /** Fill layers, back → front (last paints on top). */
  fills: TextFillLayer[];
  /** Strokes, outermost → innermost. */
  strokes: TextStroke[];
  /** Drop shadows / glows, back → front. */
  shadows: TextShadow[];
  paintOrder: PaintOrder;
}

const DEFAULT_FILL = '#ffffff';

/**
 * Lift a {@link TextStyle} (flat legacy fields OR the layered `fills/strokes/shadows`)
 * into the ONE {@link ResolvedTextDesign} both renderers consume. Layered fields win
 * when present; otherwise the flat `fillColor`/`stroke`/`shadow`/`glow` are mapped to
 * an equivalent single-layer stack — so an existing spec resolves to exactly what the
 * renderer drew before. Pure.
 */
export function resolveTextDesign(style: TextStyle | undefined): ResolvedTextDesign {
  const s = style ?? {};

  const fills: TextFillLayer[] =
    s.fills && s.fills.length ? s.fills : [{ fill: { type: 'solid', color: s.fillColor ?? DEFAULT_FILL } }];

  const strokes: TextStroke[] =
    s.strokes && s.strokes.length ? s.strokes : s.stroke ? [{ color: s.stroke.color, width: s.stroke.width }] : [];

  let shadows: TextShadow[];
  if (s.shadows && s.shadows.length) {
    shadows = s.shadows;
  } else {
    shadows = [];
    if (s.shadow) shadows.push({ color: s.shadow.color, dx: s.shadow.depth, dy: s.shadow.depth, blur: s.shadow.blur });
    // Glow = a centered, blurred shadow (matches the current Pixi dropShadow mapping).
    if (s.glow) shadows.push({ color: s.glow.color, dx: 0, dy: 0, blur: s.glow.sigma ?? 6, opacity: s.glow.intensity });
  }

  return { fills, strokes, shadows, paintOrder: s.paintOrder ?? 'fill-stroke' };
}

/** True when the style needs the LAYERED compositor (gradients/textures/multi-layer)
 *  rather than the cheap single-`PIXI.Text` path. A fast renderer fork. */
export function isLayeredDesign(d: ResolvedTextDesign): boolean {
  return (
    d.fills.length > 1 ||
    d.strokes.length > 1 ||
    d.fills.some((f) => f.fill.type !== 'solid' || f.dx || f.dy || f.blur)
  );
}

/**
 * A representative SOLID color for a fill (a degrade for renderers that can't paint
 * gradients/patterns): gradients → the stop nearest the middle (the dominant tone);
 * texture → white. Pure.
 */
export function solidColorOf(fill: TextFill): string {
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'texture') return '#ffffff';
  let best = fill.stops[0];
  let bestD = Infinity;
  for (const s of fill.stops) {
    const dd = Math.abs(s.offset - 0.5);
    if (dd < bestD) {
      bestD = dd;
      best = s;
    }
  }
  return best?.color ?? '#ffffff';
}

/**
 * Degrade a (possibly layered) {@link TextStyle} to the FLAT model — a single
 * `fillColor` / `stroke` / `shadow` / `glow` — for the renderers WITHOUT the layer
 * compositor (the ffmpeg/libass tier): gradients/textures → a solid, multi-stroke →
 * the first, back 3D fills dropped, shadows split into one offset `shadow` + one
 * centered `glow`. The flat fields a renderer already understands; the layered ones
 * are cleared. Pure — so the degrade is identical wherever it runs.
 */
export function textDesignToFlatStyle(style: TextStyle | undefined): TextStyle {
  const d = resolveTextDesign(style);
  const front = d.fills[d.fills.length - 1]!.fill;
  const stroke = d.strokes[0] ? { width: d.strokes[0].width, color: d.strokes[0].color } : undefined;
  let shadow: { depth: number; color: string; blur?: number } | undefined;
  let glow: { color: string; sigma?: number; intensity?: number } | undefined;
  for (const s of d.shadows) {
    const centered = !(s.dx ?? 0) && !(s.dy ?? 0);
    if (centered) {
      if (!glow) glow = { color: s.color, sigma: s.blur, intensity: s.opacity };
    } else if (!shadow) {
      shadow = { depth: Math.round(Math.max(Math.abs(s.dx ?? 0), Math.abs(s.dy ?? 0))), color: s.color, blur: s.blur };
    }
  }
  return {
    ...style,
    fillColor: solidColorOf(front),
    stroke,
    shadow,
    glow,
    fills: undefined,
    strokes: undefined,
    shadows: undefined,
    paintOrder: undefined,
  };
}
