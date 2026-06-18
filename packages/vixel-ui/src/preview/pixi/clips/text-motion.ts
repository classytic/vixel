/**
 * Per-token KINETIC TYPOGRAPHY renderer — the `TextMedia.motion` path. Splits the
 * line with Pixi v8 `SplitText` (word / char / line tokens) and, each frame, applies
 * the schema's pure {@link textTokenSampleAt} delta to every token (staggered
 * opacity / offset / scale). The schema owns the TIMING + delta; this owns only the
 * LAYOUT (SplitText) + applying the delta — so preview == export by construction.
 *
 * Full design stack under motion: the FRONT split carries the fill + stroke + shadow;
 * each BACK fill layer (3D extrude / stacked) is its OWN SplitText, offset behind and
 * staggered with the SAME per-token delta — so a word's 3D shadow pops in with it.
 * The per-token entrance/exit REPLACES the whole-block `clip.enter/exit`; the clip's
 * transform + `loop` still drive the block.
 */
import type * as PIXINS from 'pixi.js';
import { textTokenSampleAt, type TextMotion, type ResolvedTextDesign } from '@classytic/vixel-schema';
import type { Pixi, RetainedNode, ElementLayout } from '../types.js';
import { buildFrontTextStyle, buildLayerTextStyle, type TextStyleBase, type TextureResolver } from './text-style.js';
import { getTextureEpoch } from './text-texture.js';

/** Block-level transform (transform + loop, NOT the block entrance — tokens own that). */
export interface MotionFrame {
  cx: number;
  cy: number;
  W: number;
  H: number;
  localT: number;
  dur: number;
  alpha: number;
  scale: number;
  rotation: number;
}

const anchorField = (by: TextMotion['by']): 'charAnchor' | 'lineAnchor' | 'wordAnchor' =>
  by === 'char' ? 'charAnchor' : by === 'line' ? 'lineAnchor' : 'wordAnchor';

/** The token containers for the split unit (chars are Text, words/lines are Container). */
function tokensOf(split: PIXINS.SplitText, by: TextMotion['by']): PIXINS.Container[] {
  return (by === 'char' ? split.chars : by === 'line' ? split.lines : split.words) as PIXINS.Container[];
}

export function reconcileTextMotion(
  PIXI: Pixi,
  node: RetainedNode,
  lineText: string,
  design: ResolvedTextDesign,
  base: TextStyleBase,
  motion: TextMotion,
  f: MotionFrame,
  getTexture?: TextureResolver,
): ElementLayout {
  const by = motion.by ?? 'word';
  const backFills = design.fills.slice(0, -1); // 3D extrude / stacked, behind the front
  const sig = `${lineText}|${by}|${JSON.stringify(base)}|${JSON.stringify(design.fills)}|${JSON.stringify(design.strokes[0])}|${JSON.stringify(design.shadows[0])}|${getTextureEpoch()}`;

  if (node.splitSig !== sig || !node.split) {
    node.split?.destroy();
    for (const l of node.splitLayers ?? []) l.destroy();
    const anchor: Partial<Record<'charAnchor' | 'wordAnchor' | 'lineAnchor', { x: number; y: number }>> = {
      [anchorField(by)]: { x: 0.5, y: 0.5 },
    };
    // Back fill layers FIRST (z below the front), each its own SplitText.
    node.splitLayers = backFills.map((layer, i) => {
      const s = new PIXI.SplitText({ text: lineText, style: buildLayerTextStyle(PIXI, layer.fill, base, getTexture), ...anchor });
      node.container.addChild(s);
      s.zIndex = i + 1;
      return s;
    });
    node.split = new PIXI.SplitText({ text: lineText, style: buildFrontTextStyle(PIXI, design, base, getTexture), ...anchor });
    node.container.addChild(node.split);
    node.split.zIndex = 1000;
    node.container.sortableChildren = true;
    // Layout is identical across layers (same text/font/size) → capture base once.
    const tokens = tokensOf(node.split, by);
    node.splitBase = tokens.map((t) => ({ x: t.x, y: t.y }));
    node.splitW = node.split.width;
    node.splitH = node.split.height;
    node.split.pivot.set(node.splitW / 2, node.splitH / 2);
    for (const s of node.splitLayers) s.pivot.set(node.splitW / 2, node.splitH / 2);
    node.splitSig = sig;
  }

  const base0 = node.splitBase!;
  const fontSize = base.fontSize;
  // Apply the staggered per-token delta to a split, offset to (cx+ox, cy+oy).
  const applySplit = (split: PIXINS.SplitText, ox: number, oy: number) => {
    split.visible = true;
    const tokens = tokensOf(split, by);
    const n = tokens.length;
    for (let i = 0; i < n; i++) {
      const tok = tokens[i]!;
      const b = base0[i] ?? { x: tok.x, y: tok.y };
      const d = textTokenSampleAt(motion, i, n, f.localT, f.dur);
      tok.x = b.x + d.dx * f.W;
      tok.y = b.y + d.dy * f.H;
      tok.alpha = d.opacity;
      tok.scale.set(d.scale);
    }
    split.position.set(f.cx + ox, f.cy + oy);
    split.alpha = f.alpha;
    split.scale.set(f.scale);
    split.rotation = f.rotation;
  };

  (node.splitLayers ?? []).forEach((s, i) => {
    const layer = backFills[i]!;
    applySplit(s, (layer.dx ?? 0) * fontSize * f.scale, (layer.dy ?? 0) * fontSize * f.scale);
  });
  applySplit(node.split, 0, 0);

  const w = (node.splitW ?? node.split.width) * f.scale;
  const h = (node.splitH ?? node.split.height) * f.scale;
  return { x: (f.cx - w / 2) / f.W, y: (f.cy - h / 2) / f.H, w: w / f.W, h: h / f.H, rotation: (f.rotation * 180) / Math.PI };
}

/** Tear down the SplitText(s) when a clip stops using motion (back to the single-Text path). */
export function clearTextMotion(node: RetainedNode): void {
  if (node.split) {
    node.split.destroy();
    node.split = undefined;
    node.splitBase = undefined;
    node.splitSig = undefined;
  }
  if (node.splitLayers) {
    for (const l of node.splitLayers) l.destroy();
    node.splitLayers = undefined;
  }
}
