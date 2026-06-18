/**
 * Server-side BoxStyle rendering — rasterize a clip's `transform.style`
 * (rounded corners + border + drop shadow) to transparent PNGs via SVG + resvg,
 * so the ffmpeg export matches the Pixi preview's `applyBoxStyle`.
 * ========================================================================
 * The compositor (graph.ts) uses these PNGs to:
 *  - alphamerge the `mask` onto the clip → rounded corners (radius>0);
 *  - overlay the `border` stroke PNG on top of the rounded clip;
 *  - underlay the blurred `shadow` PNG behind the clip at its offset.
 *
 * All metrics are FRACTIONS of the box's SHORTER side (`min(w,h)`), matching the
 * preview: radius px = `radius·short` (clamped to `short/2`), border width px =
 * `border.width·short`, shadow offset/blur px = `fraction·short`.
 *
 * resvg is an OPTIONAL dependency (shapes already require it). A clip with a
 * `transform.style` but no resvg DEGRADES GRACEFULLY — render.ts catches the
 * throw and composites the clip unstyled, rather than crashing.
 */
import type { BoxStyle } from './schema.js';

/** PNG buffers + geometry for the styling layers of one box (canvas px). */
export interface RasterizedBoxStyle {
  /** White rounded-rect on transparent, box-sized — the `alphamerge` mask. Present when radius>0. */
  mask?: Buffer;
  /** Transparent fill + rounded-rect stroke (inset by half the stroke), box-sized. Present when `style.border`. */
  border?: Buffer;
  /**
   * Blurred dark rounded-rect on a PADDED canvas. `pad` is the per-side padding
   * (blur + |offset|), `offX`/`offY` the shadow offset in px. The compositor
   * underlays it at `boxX - pad + offX`, `boxY - pad + offY`. Present when `style.shadow`.
   */
  shadow?: { data: Buffer; pad: number; offX: number; offY: number };
}

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const safeColor = (c: string | undefined, fallback: string): string => (c && COLOR.test(c) ? c : fallback);
const num = (n: number | undefined, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : d);

/** Resolve the px metrics from fractions of the shorter side (mirrors the preview). */
function metrics(style: BoxStyle, wpx: number, hpx: number) {
  const short = Math.min(wpx, hpx);
  const radiusPx = style.radius ? Math.min(style.radius * short, short / 2) : 0;
  const borderPx = style.border?.width ? Math.max(0, style.border.width * short) : 0;
  return { short, radiusPx, borderPx };
}

/** A white rounded-rect (radius px) on transparent, box-sized — for `alphamerge`. */
function maskSvg(wpx: number, hpx: number, radiusPx: number): string {
  const r = Math.max(0, Math.min(radiusPx, wpx / 2, hpx / 2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="0 0 ${wpx} ${hpx}">` +
    `<rect x="0" y="0" width="${wpx}" height="${hpx}" rx="${r}" ry="${r}" fill="#FFFFFF"/></svg>`
  );
}

/** A rounded-rect stroke (inset by half the width so it stays inside the box) on transparent. */
function borderSvg(wpx: number, hpx: number, radiusPx: number, sw: number, color: string): string {
  const i = sw / 2;
  const w = Math.max(0, wpx - sw);
  const h = Math.max(0, hpx - sw);
  // Keep the corner radius on the stroke centerline consistent with the inset box.
  const r = Math.max(0, Math.min(radiusPx - i, w / 2, h / 2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="0 0 ${wpx} ${hpx}">` +
    `<rect x="${i}" y="${i}" width="${w}" height="${h}" rx="${r}" ry="${r}" ` +
    `fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`
  );
}

/** A soft-blurred rounded-rect (the shadow silhouette) on a padded transparent canvas. */
function shadowSvg(
  wpx: number,
  hpx: number,
  radiusPx: number,
  pad: number,
  blurPx: number,
  color: string,
  opacity: number,
): string {
  const W = wpx + pad * 2;
  const H = hpx + pad * 2;
  const r = Math.max(0, Math.min(radiusPx, wpx / 2, hpx / 2));
  // `stdDeviation = blur/2` mirrors the preview's `blur: blurPx/2` (pixi-filters
  // and feGaussianBlur both take a std-dev-like radius). The box is drawn UNOFFSET
  // at `pad,pad`; the compositor applies the offset when underlaying the PNG.
  const std = (blurPx / 2).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feGaussianBlur stdDeviation="${std}"/></filter></defs>` +
    `<rect x="${pad}" y="${pad}" width="${wpx}" height="${hpx}" rx="${r}" ry="${r}" ` +
    `fill="${color}" fill-opacity="${opacity}" filter="url(#b)"/></svg>`
  );
}

/**
 * Rasterize a clip's {@link BoxStyle} to PNG layers for a `boxWpx`×`boxHpx` box.
 * Returns only the layers the style requests (mask if radius>0, border if set,
 * shadow if set). Throws an actionable error if resvg (optional dep) isn't
 * installed — the caller degrades to an unstyled clip. Pure / buffer-returning;
 * the caller writes the temp files.
 */
export async function rasterizeBoxStyle(
  style: BoxStyle,
  boxWpx: number,
  boxHpx: number,
): Promise<RasterizedBoxStyle> {
  let Resvg: typeof import('@resvg/resvg-js').Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    throw new Error(
      "transform.style (rounded corners / border / shadow) needs the optional '@resvg/resvg-js' dependency — run `npm i @resvg/resvg-js` to render it server-side (it already renders in the browser export).",
    );
  }

  const wpx = Math.max(2, Math.round(boxWpx));
  const hpx = Math.max(2, Math.round(boxHpx));
  const { short, radiusPx, borderPx } = metrics(style, wpx, hpx);
  const render = (svg: string): Buffer => Buffer.from(new Resvg(svg).render().asPng());

  const out: RasterizedBoxStyle = {};

  if (radiusPx > 0.5) {
    out.mask = render(maskSvg(wpx, hpx, radiusPx));
  }

  if (borderPx > 0.25 && style.border?.color) {
    out.border = render(borderSvg(wpx, hpx, radiusPx, borderPx, safeColor(style.border.color, '#FFFFFF')));
  }

  if (style.shadow) {
    // Match the preview's defaults: y=0.04, blur=0.04 of the shorter side, x=0.
    const offX = Math.round(num(style.shadow.x, 0) * short);
    const offY = Math.round(num(style.shadow.y, 0.04) * short);
    const blurPx = Math.max(0, num(style.shadow.blur, 0.04) * short);
    const pad = Math.ceil(blurPx + Math.max(Math.abs(offX), Math.abs(offY)) + 2);
    const data = render(shadowSvg(wpx, hpx, radiusPx, pad, blurPx, safeColor(style.shadow.color, '#000000'), 0.5));
    out.shadow = { data, pad, offX, offY };
  }

  return out;
}
