/**
 * Server-side shape rendering — rasterize a shape {@link VisualClip} to a transparent
 * PNG via SVG + resvg, then the compositor overlays it like a generated image.
 * ========================================================================
 * Why rasterize instead of native ffmpeg filters: rounded corners, gradients, and
 * shadows are trivial in SVG and gnarly/low-fidelity as `geq`/`drawbox`
 * expressions. resvg (a Rust SVG renderer, prebuilt binaries) gives pixel-quality
 * output that matches the Pixi preview. The motion (slide/pop) degrades to a fade
 * server-side (handled by the compositor's alpha chain) — same policy as overlays.
 *
 * NOT yet: `backdrop.blur` (frosted glass) needs the COMPOSITED CONTENT BEHIND the
 * card, which a standalone PNG can't see; the translucent fill is the honest
 * fallback (a tinted panel). True backdrop blur is a compositor follow-up
 * (crop→boxblur→underlay).
 *
 * resvg is an OPTIONAL dependency: only specs with shape overlays pull it, and a
 * missing install fails loud with an actionable message.
 */
import type { VisualClip, ShapeMedia } from './schema.js';

/** Where the rasterized PNG sits + how big it is, in canvas pixels. */
export interface RasterizedShape {
  /** PNG bytes (transparent background). */
  data: Buffer;
  /** Overlay top-left in canvas px (already accounts for the shadow padding). */
  xPx: number;
  yPx: number;
  /** PNG dimensions in px (frame size + shadow padding on each side). */
  wPx: number;
  hPx: number;
  /**
   * Frosted-glass backdrop: blur the composited content behind the card, masked
   * to its rounded silhouette. `mask` is a white-on-black PNG (the silhouette) and
   * `{x,y,w,h}` is the crop box (the UNPADDED frame in canvas px). Present only
   * when the shape sets `backdrop.blur`.
   */
  backdrop?: {
    blur: number;
    mask: Buffer;
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const safeColor = (c: string | undefined, fallback: string): string => (c && COLOR.test(c) ? c : fallback);
const num = (n: number | undefined, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : d);

/** Build the SVG document for a shape drawn into a `wpx`×`hpx` box at offset `pad`. */
function shapeSvg(ov: ShapeMedia, wpx: number, hpx: number, pad: number): string {
  const kind = ov.shape ?? 'roundedRect';
  const W = wpx + pad * 2;
  const H = hpx + pad * 2;

  const defs: string[] = [];
  let fillAttr = 'none';
  if (ov.fill?.gradient) {
    const a = (num(ov.fill.gradient.angle, 0) * Math.PI) / 180;
    const x1 = (0.5 - Math.cos(a) / 2).toFixed(4);
    const y1 = (0.5 - Math.sin(a) / 2).toFixed(4);
    const x2 = (0.5 + Math.cos(a) / 2).toFixed(4);
    const y2 = (0.5 + Math.sin(a) / 2).toFixed(4);
    defs.push(
      `<linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        `<stop offset="0" stop-color="${safeColor(ov.fill.gradient.from, '#000000')}"/>` +
        `<stop offset="1" stop-color="${safeColor(ov.fill.gradient.to, '#000000')}"/>` +
        `</linearGradient>`,
    );
    fillAttr = 'url(#g)';
  } else if (ov.fill?.color) {
    fillAttr = safeColor(ov.fill.color, '#000000');
  }
  const fillOpacity = num(ov.fill?.opacity, ov.fill ? 1 : 0);

  let shadowFilter = '';
  if (ov.shadow) {
    const dx = num(ov.shadow.x, 0);
    const dy = num(ov.shadow.y, 0);
    const blur = num(ov.shadow.blur, 0);
    defs.push(
      `<filter id="s" x="-50%" y="-50%" width="200%" height="200%">` +
        `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${(blur / 2).toFixed(2)}" ` +
        `flood-color="${safeColor(ov.shadow.color, '#000000')}" flood-opacity="${num(ov.shadow.opacity, 0.25)}"/>` +
        `</filter>`,
    );
    shadowFilter = ' filter="url(#s)"';
  }

  const sw = ov.stroke ? Math.max(0, ov.stroke.width) : 0;
  const strokeAttr = ov.stroke
    ? ` stroke="${safeColor(ov.stroke.color, '#FFFFFF')}" stroke-width="${sw}" stroke-opacity="${num(ov.stroke.opacity, 1)}"`
    : '';
  // Inset the geometry by half the stroke so the outline stays inside the box.
  const i = sw / 2;
  const x = pad + i;
  const y = pad + i;
  const w = Math.max(0, wpx - sw);
  const h = Math.max(0, hpx - sw);

  let body: string;
  if (kind === 'line') {
    body = `<line x1="${pad}" y1="${pad}" x2="${pad + wpx}" y2="${pad + hpx}"${strokeAttr}/>`;
  } else if (kind === 'ellipse') {
    body = `<ellipse cx="${pad + wpx / 2}" cy="${pad + hpx / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fillAttr}" fill-opacity="${fillOpacity}"${strokeAttr}${shadowFilter}/>`;
  } else if (kind === 'rect') {
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillAttr}" fill-opacity="${fillOpacity}"${strokeAttr}${shadowFilter}/>`;
  } else {
    const r = Math.max(0, Math.min(num(ov.cornerRadius, 0), w / 2, h / 2));
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fillAttr}" fill-opacity="${fillOpacity}"${strokeAttr}${shadowFilter}/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

/** White-on-black silhouette of the shape's fill region — the alpha mask for the frosted backdrop. */
function maskSvg(ov: ShapeMedia, wpx: number, hpx: number): string {
  const kind = ov.shape ?? 'roundedRect';
  let body: string;
  if (kind === 'ellipse') {
    body = `<ellipse cx="${wpx / 2}" cy="${hpx / 2}" rx="${wpx / 2}" ry="${hpx / 2}" fill="#FFFFFF"/>`;
  } else if (kind === 'rect') {
    body = `<rect x="0" y="0" width="${wpx}" height="${hpx}" fill="#FFFFFF"/>`;
  } else {
    const r = Math.max(0, Math.min(num(ov.cornerRadius, 0), wpx / 2, hpx / 2));
    body = `<rect x="0" y="0" width="${wpx}" height="${hpx}" rx="${r}" ry="${r}" fill="#FFFFFF"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" viewBox="0 0 ${wpx} ${hpx}"><rect width="${wpx}" height="${hpx}" fill="#000000"/>${body}</svg>`;
}

/**
 * Rasterize a shape clip to a PNG sized to its frame (+ shadow padding),
 * positioned in canvas px. `frame` is read from `clip.transform.frame`, defaulting
 * to a centered box. Throws an actionable error if resvg (optional dep) isn't
 * installed.
 */
export async function rasterizeShape(clip: VisualClip, canvasW: number, canvasH: number): Promise<RasterizedShape> {
  let Resvg: typeof import('@resvg/resvg-js').Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    throw new Error(
      "shape overlays need the optional '@resvg/resvg-js' dependency — run `npm i @resvg/resvg-js` to render shapes server-side (they already render in the browser export).",
    );
  }

  const ov = clip.media as ShapeMedia;
  const frame = clip.transform?.frame ?? { x: 0.25, y: 0.4, w: 0.5, h: 0.2 };
  const wpx = Math.max(2, Math.round(frame.w * canvasW));
  const hpx = Math.max(2, Math.round(frame.h * canvasH));
  const pad = ov.shadow
    ? Math.ceil(num(ov.shadow.blur, 0) + Math.max(Math.abs(num(ov.shadow.x, 0)), Math.abs(num(ov.shadow.y, 0))) + 2)
    : 0;

  const svg = shapeSvg(ov, wpx, hpx, pad);
  const png = new Resvg(svg).render().asPng();
  const fx = Math.round(frame.x * canvasW);
  const fy = Math.round(frame.y * canvasH);

  // Frosted glass: a silhouette mask + the crop box (unpadded frame) so the
  // compositor can blur the content behind the card, rounded to its shape. `line`
  // has no fill region to frost.
  let backdrop: RasterizedShape['backdrop'];
  const kind = ov.shape ?? 'roundedRect';
  if (ov.backdrop?.blur && kind !== 'line') {
    // The crop feeds a yuv420 chain (alphamerge), which requires EVEN dimensions —
    // an odd crop is silently rounded down and then mismatches the mask. Floor the
    // backdrop box to even and render the mask at the same size so they align.
    const ew = wpx - (wpx % 2);
    const eh = hpx - (hpx % 2);
    backdrop = {
      blur: ov.backdrop.blur,
      mask: new Resvg(maskSvg(ov, ew, eh)).render().asPng(),
      x: fx,
      y: fy,
      w: ew,
      h: eh,
    };
  }

  return {
    data: png,
    xPx: fx - pad,
    yPx: fy - pad,
    wPx: wpx + pad * 2,
    hPx: hpx + pad * 2,
    ...(backdrop ? { backdrop } : {}),
  };
}
