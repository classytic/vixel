/**
 * Text design → SVG — the THIRD output of the one text-design model (Pixi renders it
 * live in vixel-ui, ffmpeg burns it in vixel, this draws a faithful SVG string). It
 * is the one output that needs NO runtime — pure data in, string out — so it lives
 * here in the zero-dep core (peer to {@link resolveTextDesign} and {@link
 * describeCatalog}), reusable by the editor gallery, server-side thumbnail/social-card
 * rendering, and the agent's previews alike. SVG's native `paint-order` + gradients +
 * `feDropShadow` map onto the layer stack 1:1, so the SVG matches the renderers.
 */
import { resolveTextDesign } from './text-design.js';
import type { TextFill } from './text-design.js';
import type { TextStyle } from './captions.js';

export interface TextSvgOptions {
  /** Unique id prefix for this SVG's gradient/filter defs (they share the page). */
  idPrefix: string;
  /** Sample text to render. Default `'Aa'`. */
  text?: string;
  width?: number;
  height?: number;
  /** Font size in the SVG's user units. Default 46. */
  fontSize?: number;
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);

/** A fill → an SVG paint ref (+ any `<def>` it needs). Gradient coords are objectBoundingBox (0..1). */
function fillPaint(fill: TextFill, id: string): { def: string; ref: string } {
  switch (fill.type) {
    case 'solid':
      return { def: '', ref: fill.color };
    case 'linear': {
      const a = ((fill.angle ?? 90) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const stops = fill.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
      const def = `<linearGradient id="${id}" x1="${(0.5 - 0.5 * cos).toFixed(3)}" y1="${(0.5 - 0.5 * sin).toFixed(3)}" x2="${(0.5 + 0.5 * cos).toFixed(3)}" y2="${(0.5 + 0.5 * sin).toFixed(3)}">${stops}</linearGradient>`;
      return { def, ref: `url(#${id})` };
    }
    case 'radial': {
      const stops = fill.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
      return { def: `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`, ref: `url(#${id})` };
    }
    case 'texture':
      return { def: '', ref: '#ffffff' }; // pattern fill TODO — mirror the Pixi fallback
  }
}

/**
 * Render a {@link TextStyle} (flat or layered) as an SVG string: a background card
 * ({@link TextStyle.box}), back fill layers (3D offset duplicates), then the front
 * fill with its first stroke (`paint-order: stroke` under fill) and drop shadows
 * (`feDropShadow`). Pure + deterministic.
 */
export function textDesignToSvg(style: TextStyle | undefined, opts: TextSvgOptions): string {
  const W = opts.width ?? 160;
  const H = opts.height ?? 88;
  const FS = opts.fontSize ?? 46;
  const d = resolveTextDesign(style);
  const cx = W / 2;
  const cy = H / 2;
  // Stroke width + shadow offset/blur are authored against the real font size — scale
  // them to FS. Fill offsets are fractions of the font size (→ * FS directly).
  const k = FS / (style?.fontSize ?? 120);
  const t = escapeXml(opts.text ?? 'Aa');
  const id = opts.idPrefix;

  const defs: string[] = [];
  let body = '';

  if (style?.box) {
    body += `<rect x="${(W * 0.06).toFixed(1)}" y="${(H * 0.18).toFixed(1)}" width="${(W * 0.88).toFixed(1)}" height="${(H * 0.64).toFixed(1)}" rx="6" fill="${style.box.color}" fill-opacity="${style.box.opacity ?? 1}"/>`;
  }

  let filterRef = '';
  if (d.shadows.length) {
    const prims = d.shadows
      .map(
        (s) =>
          `<feDropShadow dx="${((s.dx ?? 0) * k).toFixed(2)}" dy="${((s.dy ?? 0) * k).toFixed(2)}" stdDeviation="${(((s.blur ?? 0) * k) / 2).toFixed(2)}" flood-color="${s.color}" flood-opacity="${s.opacity ?? 1}"/>`,
      )
      .join('');
    defs.push(`<filter id="${id}-sh" x="-60%" y="-60%" width="220%" height="220%">${prims}</filter>`);
    filterRef = ` filter="url(#${id}-sh)"`;
  }

  d.fills.slice(0, -1).forEach((layer, i) => {
    const { def, ref } = fillPaint(layer.fill, `${id}-b${i}`);
    if (def) defs.push(def);
    body += `<text x="${(cx + (layer.dx ?? 0) * FS).toFixed(1)}" y="${(cy + (layer.dy ?? 0) * FS).toFixed(1)}" fill="${ref}">${t}</text>`;
  });

  const front = d.fills[d.fills.length - 1]!;
  const { def, ref } = fillPaint(front.fill, `${id}-f`);
  if (def) defs.push(def);
  const stroke = d.strokes[0];
  const strokeAttr = stroke
    ? ` stroke="${stroke.color}" stroke-width="${(stroke.width * k).toFixed(2)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  body += `<text x="${cx}" y="${cy}"${strokeAttr} fill="${ref}"${filterRef}>${t}</text>`;

  const fontFamily = escapeXml(style?.fontFamily ?? 'sans-serif');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    `<g font-family="${fontFamily}" font-size="${FS}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${body}</g>` +
    `</svg>`
  );
}
