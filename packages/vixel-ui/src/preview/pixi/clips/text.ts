/**
 * TEXT clip reconciler — a single styled line OR a per-word caption row (karaoke /
 * highlight / pop / word-by-word). An unframed text clip centers on the canvas; a
 * framed one centers on its frame.
 */
import type * as PIXINS from 'pixi.js';
import type { VisualClip, TextStyle } from '@classytic/vixel-schema';
import { sampleClipMotion, resolveTextDesign } from '@classytic/vixel-schema';
import type { Pixi, ElementLayout, RetainedScene, RetainedNode } from '../types.js';
import { ensureNode, boxOf, setZ } from '../node.js';
import { getFontEpoch } from '../media/fonts.js';
import { updateFilters } from '../filters/registry.js';
import { activeCue, clearWordRow, reconcileCaptionWords } from './captions.js';
import { buildFrontTextStyle, buildLayerTextStyle, type TextStyleBase, type TextureResolver } from './text-style.js';
import { reconcileTextMotion, clearTextMotion } from './text-motion.js';
import { getFillTexture, getTextureEpoch } from './text-texture.js';

/**
 * Reconcile the BACK fill layers (every fill except the front) as Text nodes behind
 * `content` — the 3D-extrude / stacked-fill look. Rebuilt on signature change;
 * repositioned every frame to track the front text (offset = fraction of fontSize).
 */
function reconcileFillLayers(
  PIXI: Pixi,
  node: RetainedNode,
  base: TextStyleBase,
  lineText: string,
  backFills: ReturnType<typeof resolveTextDesign>['fills'],
  sig: string,
  getTexture: TextureResolver,
): void {
  if (node.layersSig !== sig) {
    for (const l of node.layers ?? []) l.destroy();
    node.layers = backFills.map((layer) => {
      const t = new PIXI.Text({ text: lineText, style: buildLayerTextStyle(PIXI, layer.fill, base, getTexture) });
      t.anchor.set(0.5);
      return t;
    });
    // Insert behind the front content (which is the last child of the container).
    node.layers.forEach((t, i) => node.container.addChildAt(t, i));
    node.layersSig = sig;
  }
}

/**
 * Reconcile a TEXT clip — single styled line OR a per-word caption row (karaoke /
 * highlight / pop / word-by-word). An unframed text clip centers on the canvas;
 * a framed one centers on its frame. Returns the rendered box for the gizmo.
 */
export function reconcileTextClip(
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
  if (clip.media.kind !== 'text') return null;
  const node = ensureNode(PIXI, scene, stage, key, 'text');
  setZ(node, z);
  const text = node.content as PIXINS.Text;

  const transform = clip.transform;
  const { bx, by, bw, bh } = boxOf(transform, W, H);
  // Whole-element motion (entrance/exit + continuous loop) folded once — the SAME
  // sampler every clip kind uses (see sampleClipMotion), so motion stays in lock-step
  // across text/image/video/shape. Word-mode captions inherit it via cx/cy/scale/rot.
  const m = sampleClipMotion(clip, localT, dur);
  const cx = bx + bw / 2 + m.dx * W;
  const cy = by + bh / 2 + m.dy * H;
  const alpha = (transform?.opacity ?? 1) * m.opacity;
  const scale = m.scale;
  const rotDeg = transform?.rotation ?? 0;
  const rotation = (rotDeg * Math.PI) / 180 + m.rotation;

  const ts = (clip.media.style ?? {}) as TextStyle;
  const fontSize = typeof ts.fontSize === 'number' ? ts.fontSize : Math.round(W * 0.05);
  // Wrap width = the authored box width, clamped to the canvas (a stale/oversized
  // frame.w still wraps). Drives BOTH the plain-text path AND the caption word-wrap.
  const wrapWidth = Math.max(Math.min(bw, W), fontSize);
  // Word-timed captions: cue timestamps are ABSOLUTE (timeline ms), so compare
  // against the absolute playhead. `at + localT` reconstructs it (localT = t − at).
  const absMs = (clip.at + localT) * 1000;
  const cues = clip.media.cues;
  const cue = cues && cues.length ? activeCue(cues, absMs) : undefined;
  const anim = ts.animation ?? (cue?.words?.length ? 'karaoke' : 'fade');
  const wordMode = !!(cue?.words?.length && anim !== 'fade' && anim !== 'none');
  if (cues && cues.length) {
    if (wordMode) {
      text.visible = false;
      if (node.box) node.box.visible = false;
      node.layers?.forEach((l) => (l.visible = false)); // design layers don't apply to caption rows
      return reconcileCaptionWords(PIXI, node, cue!, ts, anim, absMs, fontSize, wrapWidth, cx, cy, alpha, scale, rotation, rotDeg, W, H);
    }
    clearWordRow(node);
    text.visible = true;
  }
  const lineText = cues && cues.length ? (cue?.text ?? '') : clip.media.text;
  // The SVG-like layer stack (flat fields lifted, or layered fills/strokes/shadows).
  // Front fill + first stroke/shadow → the main Text; back fills → stacked layers.
  const design = resolveTextDesign(ts);
  const base: TextStyleBase = {
    fontFamily: ts.fontFamily ?? 'sans-serif',
    fontSize,
    bold: !!ts.bold,
    italic: !!ts.italic,
    align: ts.align ?? 'center',
    letterSpacing: ts.letterSpacing ?? 0,
    wrapWidth,
  };
  // Resolves a TextureFill source → loaded Texture (or null while loading; redraws
  // when ready). `getTextureEpoch()` rides the signature so a late texture rebuilds.
  const getTex: TextureResolver = (url) => getFillTexture(PIXI, url, scene.requestRender);
  // Per-token KINETIC motion (TextMedia.motion) — split into word/char/line tokens
  // that animate independently. Replaces the whole-block entrance; the block still
  // carries transform + loop. Only for plain text (not speech-timed caption rows).
  const motion = clip.media.motion;
  if (motion && !(cues && cues.length)) {
    text.visible = false;
    if (node.box) node.box.visible = false;
    node.layers?.forEach((l) => (l.visible = false));
    // The block carries transform + loop (the shared `sampleClipMotion` result `m`,
    // already folded into cx/cy/alpha/scale/rotation above). Tokens own enter/exit,
    // so motion clips normally set no clip.enter → `m` is loop-only here.
    return reconcileTextMotion(PIXI, node, lineText, design, base, motion, {
      cx,
      cy,
      W,
      H,
      localT,
      dur,
      alpha,
      scale,
      rotation,
    }, getTex);
  }
  clearTextMotion(node); // back to single-Text path → tear down any prior split

  const textSig = `${lineText}|${fontSize}|${JSON.stringify(ts)}|${getFontEpoch()}|${getTextureEpoch()}`;
  if (node.textSig !== textSig) {
    text.text = lineText;
    text.style = buildFrontTextStyle(PIXI, design, base, getTex);
    text.zIndex = 1000; // always in front of any back fill layers
    node.container.sortableChildren = true;
    node.textSig = textSig;
  }
  clearWordRow(node);
  text.visible = true;
  text.x = cx;
  text.y = cy;
  text.alpha = alpha;
  text.scale.set(scale);
  text.rotation = rotation;
  // Back fill LAYERS (3D extrude / stacked design fills) — every fill but the front.
  const backFills = design.fills.slice(0, -1);
  if (backFills.length) {
    reconcileFillLayers(PIXI, node, base, lineText, backFills, textSig, getTex);
    node.layers!.forEach((t, i) => {
      const lf = backFills[i]!;
      t.x = cx + (lf.dx ?? 0) * fontSize * scale;
      t.y = cy + (lf.dy ?? 0) * fontSize * scale;
      t.alpha = alpha;
      t.scale.set(scale);
      t.rotation = rotation;
      t.zIndex = i + 1; // behind the front text (z 1000), above the box (z 0)
      t.visible = true;
    });
  } else if (node.layers?.length) {
    for (const l of node.layers) l.destroy();
    node.layers = undefined;
    node.layersSig = undefined;
  }
  if (ts.box) {
    if (!node.box) {
      node.box = new PIXI.Graphics();
      node.container.addChildAt(node.box, 0); // behind the glyphs
      node.box.zIndex = 0; // backmost when sortableChildren is on (fill layers + text above)
      node.boxSig = undefined;
    }
    const boxSig = `${textSig}|${scale}|${cx}|${cy}|${ts.box.color}|${ts.box.padding}|${ts.box.radius}|${ts.box.opacity}`;
    if (node.boxSig !== boxSig) {
      const pad = (typeof ts.box.padding === 'number' ? ts.box.padding : fontSize * 0.3) * scale;
      const radius = typeof ts.box.radius === 'number' ? ts.box.radius * scale : 8;
      const tbw = text.width * scale + pad * 2;
      const tbh = text.height * scale + pad * 2;
      node.box.clear().roundRect(cx - tbw / 2, cy - tbh / 2, tbw, tbh, radius).fill({ color: ts.box.color, alpha: ts.box.opacity ?? 1 });
      node.boxSig = boxSig;
    }
    node.box.alpha = alpha;
    node.box.rotation = rotation;
    node.box.visible = true;
  } else if (node.box) {
    node.box.destroy();
    node.box = undefined;
    node.boxSig = undefined;
  }
  updateFilters(PIXI, node, clip.effects);
  // Publish the text BOX for the gizmo: WIDTH is the AUTHORED wrap width (stable —
  // it is what the side handles edit and what re-wraps the text), HEIGHT is MEASURED
  // (auto-fits the wrapped line count). Publishing the *measured* width here used to
  // feed a drag back into `frame.w`, which widened the wrap box, which un-wrapped the
  // text, which grew the measured width — a runaway loop that detached the box from
  // the glyphs and pushed `frame.w` past 100%. Authored-width breaks that loop; the
  // box stays centered on the glyphs because the text is centered within the box.
  const boxW = Math.min(bw, W);
  const th2 = text.height;
  return { x: (cx - boxW / 2) / W, y: (text.y - th2 / 2) / H, w: boxW / W, h: th2 / H, rotation: rotDeg };
}
