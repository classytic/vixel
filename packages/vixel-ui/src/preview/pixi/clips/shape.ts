/**
 * Vector SHAPE clip reconciler (rect/roundedRect/ellipse/line/triangle/polygon/
 * star/path) + the media PLACEHOLDER frame for a sourceless image/video clip. Both
 * draw via Pixi Graphics. Polygonal geometry comes from the schema's shared
 * `shapeVertices` so the preview matches the server SVG raster exactly.
 */
import type * as PIXINS from 'pixi.js';
import type { VisualClip } from '@classytic/vixel-schema';
import { entranceAt, resolveEntranceOptions, shapeVertices } from '@classytic/vixel-schema';
import type { Pixi, ElementLayout, RetainedScene } from '../types.js';
import { ensureNode, boxOf, applyNodeRotation, composeNodeFilters, disposeEffectFilters, setZ } from '../node.js';
import { applyBoxStyle } from '../graphics/boxstyle.js';

/**
 * Draw a vector SHAPE clip (rect/roundedRect/ellipse/line) via Pixi Graphics. The
 * shape is built around its own center so `rotation` pivots correctly. fill/stroke/
 * cornerRadius render now; frosted-glass backdrop blur uses pixi-filters'
 * BackdropBlurFilter when the host bundles it. Returns the rendered box.
 */
export function reconcileShapeClip(
  PIXI: Pixi,
  scene: RetainedScene,
  stage: PIXINS.Container,
  key: string,
  z: number,
  clip: VisualClip,
  W: number,
  H: number,
  localT: number,
  dur: number,
): ElementLayout | null {
  if (clip.media.kind !== 'shape') return null;
  const media = clip.media;
  const node = ensureNode(PIXI, scene, stage, key, 'shape');
  setZ(node, z);
  const g = node.content as PIXINS.Graphics;

  const transform = clip.transform;
  const { bx, by, bw: w, bh: h } = boxOf(transform ?? { frame: { x: 0.25, y: 0.4, w: 0.5, h: 0.2 } }, W, H);
  const cx = w / 2;
  const cy = h / 2;
  const kind = media.shape ?? 'roundedRect';

  const e = entranceAt(clip.enter, clip.exit, localT, dur, resolveEntranceOptions(clip.motionTiming));
  const alpha = (transform?.opacity ?? 1) * e.opacity;

  const shapeSig = JSON.stringify([
    kind, w, h, media.cornerRadius, media.sides, media.points, media.innerRatio,
    media.path, media.pathViewBox, media.fill, media.stroke, media.backdrop,
  ]);
  if (node.shapeSig !== shapeSig) {
    g.clear();
    if (kind === 'line') {
      // A horizontal rule across the frame's vertical centre (rotate for other angles).
      g.moveTo(-cx, 0).lineTo(cx, 0);
    } else if (kind === 'ellipse') {
      g.ellipse(0, 0, cx, cy);
    } else if (kind === 'rect') {
      g.rect(-cx, -cy, w, h);
    } else if (kind === 'triangle' || kind === 'polygon' || kind === 'star') {
      const pts = shapeVertices(kind, w, h, { sides: media.sides, points: media.points, innerRatio: media.innerRatio });
      g.poly(pts.flat(), true);
    } else if (kind === 'path') {
      // Arbitrary SVG path, authored in `pathViewBox` coords, scaled to fill the
      // frame and centred on the node origin (so rotation pivots correctly).
      const vb = media.pathViewBox ?? { w: 100, h: 100 };
      const sx = w / (vb.w || 100);
      const sy = h / (vb.h || 100);
      const m = new PIXI.Matrix(sx, 0, 0, sy, -cx, -cy);
      if (media.path) g.path(new PIXI.GraphicsPath(media.path).transform(m));
    } else {
      // roundedRect — unset radius defaults to a visible proportional round.
      const def = Math.min(cx, cy) * 0.24;
      const r = Math.max(0, Math.min(media.cornerRadius ?? def, cx, cy));
      g.roundRect(-cx, -cy, w, h, r);
    }
    if (kind !== 'line' && media.fill) {
      const grad = media.fill.gradient;
      if (grad) {
        // Linear gradient (schema: 0deg = left→right), mirrors the text-gradient
        // path — `textureSpace: 'local'` maps the stops to the shape's 0..1 bounds.
        const a = ((grad.angle ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        g.fill(
          new PIXI.FillGradient({
            type: 'linear',
            start: { x: 0.5 - 0.5 * cos, y: 0.5 - 0.5 * sin },
            end: { x: 0.5 + 0.5 * cos, y: 0.5 + 0.5 * sin },
            colorStops: [
              { offset: 0, color: grad.from },
              { offset: 1, color: grad.to },
            ],
            textureSpace: 'local',
          }),
        );
      } else if (media.fill.color) {
        g.fill({ color: media.fill.color, alpha: media.fill.opacity ?? 1 });
      }
    }
    if (media.stroke) {
      g.stroke({ color: media.stroke.color, width: media.stroke.width, alpha: media.stroke.opacity ?? 1 });
    }
    // Frosted-glass backdrop blur lives in the node's effectFilters slot (not raw
    // `g.filters`), so composeNodeFilters keeps it alongside a BoxStyle shadow
    // instead of clobbering it.
    disposeEffectFilters(node);
    if (media.backdrop?.blur) {
      const Ctor = (PIXI as unknown as {
        BackdropBlurFilter?: new (o: { strength: number }) => PIXINS.Filter;
      }).BackdropBlurFilter;
      if (Ctor) node.effectFilters = [new Ctor({ strength: media.backdrop.blur })];
    }
    composeNodeFilters(node);
    node.shapeSig = shapeSig;
  }

  // Draw in container-local canvas coords + rotate the WRAPPER (not the leaf), so
  // the shape AND its BoxStyle mask/border/shadow rotate together as one rigid unit
  // (the bug: rotating only `g` left the decorations axis-aligned). Mirrors the
  // media-clip path.
  g.x = bx + cx + e.dx * W;
  g.y = by + cy + e.dy * H;
  g.alpha = alpha;
  g.scale.set(e.scale);
  g.rotation = 0;
  // BoxStyle on a shape clip styles its bounding box (rounded mask / border / shadow).
  applyBoxStyle(PIXI, node, transform?.style, { bx, by, bw: w, bh: h });
  applyNodeRotation(node, bx + cx, by + cy, transform?.rotation ?? 0);
  return { x: bx / W, y: by / H, w: w / W, h: h / H, rotation: transform?.rotation ?? 0 };
}

/**
 * Draw a media PLACEHOLDER frame — a rounded "drop media here" slot for an
 * image/video clip with no source yet. Editor-only; the engine skips a sourceless
 * clip. Returns its exact box so the gizmo frames it.
 */
export function reconcilePlaceholder(
  PIXI: Pixi,
  scene: RetainedScene,
  stage: PIXINS.Container,
  key: string,
  z: number,
  clip: VisualClip,
  W: number,
  H: number,
  alphaMul: number,
): ElementLayout {
  const node = ensureNode(PIXI, scene, stage, key, 'shape');
  setZ(node, z);
  const g = node.content as PIXINS.Graphics;
  const transform = clip.transform;
  const { bx, by, bw, bh } = boxOf(transform?.frame ? transform : { frame: { x: 0.3, y: 0.35, w: 0.4, h: 0.3 } }, W, H);
  const r = Math.min(24, bw / 2, bh / 2);
  const sig = `ph:${bx},${by},${bw},${bh}`;
  if (node.shapeSig !== sig) {
    g.clear();
    g.roundRect(bx, by, bw, bh, r)
      .fill({ color: 0xffffff, alpha: 0.06 })
      .stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const s = Math.min(bw, bh) * 0.1;
    g.rect(cx - s, cy - 2, s * 2, 4).fill({ color: 0xffffff, alpha: 0.75 });
    g.rect(cx - 2, cy - s, 4, s * 2).fill({ color: 0xffffff, alpha: 0.75 });
    node.shapeSig = sig;
  }
  g.x = 0;
  g.y = 0;
  g.alpha = (clip.transform?.opacity ?? 1) * alphaMul;
  g.scale.set(1);
  const rotDeg = transform?.rotation ?? 0;
  applyNodeRotation(node, bx + bw / 2, by + bh / 2, rotDeg);
  return { x: bx / W, y: by / H, w: bw / W, h: bh / H, rotation: rotDeg };
}
