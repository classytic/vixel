/**
 * Shared retained-node primitives for the Pixi reconciler — the cheap, GPU-object
 * helpers every clip reconciler reuses across frames. Lives BELOW the clip
 * reconcilers in the import DAG (clips import this; this imports nothing from
 * clips/filters/scene) so the retained-scene helpers have exactly one home.
 *
 * The renderer keeps ONE persistent, keyed node per element and only MUTATES cheap
 * props each frame (position/scale/rotation/alpha/texture), rebuilding expensive
 * sub-resources (text rasterization, filters, vector geometry) solely when their
 * inputs change. Each node sits in a thin wrapper container whose `zIndex` drives
 * compositing order; element geometry stays in absolute canvas coords.
 */
import type * as PIXINS from 'pixi.js';
import type { VisualClip, VisualTransform, ClipMask } from '@classytic/vixel-schema';
import { resolveMaskAt } from '@classytic/vixel-schema';
import type { Pixi, RetainedNode, RetainedScene } from './types.js';
import { lutFilterCache } from './filters/lut.js';
import { untrackShaderFilter } from './filters/shader.js';

interface KenBurns {
  scale: number;
  dx: number;
  dy: number;
}

export function kenBurns(animation: VisualClip['animation'], p: number): KenBurns {
  if (!animation) return { scale: 1, dx: 0, dy: 0 };
  const amount = animation.amount ?? 0.12;
  const dir = animation.direction;
  let scale = 1;
  let dx = 0;
  let dy = 0;
  if (animation.preset === 'zoom' || animation.preset === 'kenBurns') {
    scale = dir === 'out' ? 1 + amount * (1 - p) : 1 + amount * p;
  }
  if (animation.preset === 'pan' || animation.preset === 'kenBurns') {
    const s = (p - 0.5) * amount;
    if (dir === 'left') dx = -s;
    else if (dir === 'right') dx = s;
    else if (dir === 'up') dy = -s;
    else if (dir === 'down') dy = s;
    else dx = s;
    if (animation.preset === 'kenBurns' && scale === 1) scale = 1 + amount * p;
  }
  return { scale, dx, dy };
}

/**
 * The clip's BOX on the canvas (px). A clip occupies its `transform.frame`
 * sub-region, or the whole canvas when unframed. (`place` is resolved to
 * `transform.frame` by `normalizeSpec` upstream, so we only read `frame`.)
 */
export function boxOf(transform: VisualTransform | undefined, W: number, H: number): { bx: number; by: number; bw: number; bh: number } {
  const frame = transform?.frame;
  return frame
    ? { bx: frame.x * W, by: frame.y * H, bw: frame.w * W, bh: frame.h * H }
    : { bx: 0, by: 0, bw: W, bh: H };
}

/** Get the keyed node, (re)creating it if missing or if its kind changed. */
export function ensureNode(
  PIXI: Pixi,
  scene: RetainedScene,
  stage: PIXINS.Container,
  key: string,
  kind: RetainedNode['kind'],
): RetainedNode {
  const existing = scene.nodes.get(key);
  if (existing && existing.kind === kind) return existing;
  if (existing) {
    disposeNodeFilters(existing); // Pixi's container.destroy doesn't free filters
    existing.container.destroy({ children: true });
    scene.nodes.delete(key);
  }
  const container = new PIXI.Container();
  let content: RetainedNode['content'];
  if (kind === 'text') {
    content = new PIXI.Text({ text: '' });
    (content as PIXINS.Text).anchor.set(0.5);
  } else if (kind === 'shape') {
    content = new PIXI.Graphics();
  } else {
    content = new PIXI.Sprite();
    (content as PIXINS.Sprite).anchor.set(0.5);
  }
  container.addChild(content);
  stage.addChild(container);
  const node: RetainedNode = { kind, container, content };
  scene.nodes.set(key, node);
  return node;
}

/** Apply / update / remove a rectangular cover-fit mask, rebuilt only on change. */
export function setSpriteMask(
  PIXI: Pixi,
  node: RetainedNode,
  rect: { x: number; y: number; w: number; h: number } | null,
): void {
  if (!rect) {
    if (node.mask) {
      (node.content as PIXINS.Sprite).mask = null;
      node.mask.destroy();
      node.mask = undefined;
      node.maskSig = undefined;
    }
    return;
  }
  if (!node.mask) {
    node.mask = new PIXI.Graphics();
    node.container.addChild(node.mask);
    node.maskSig = undefined;
  }
  const sig = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  if (node.maskSig !== sig) {
    node.mask.clear().rect(rect.x, rect.y, rect.w, rect.h).fill(0xffffff);
    node.maskSig = sig;
  }
  (node.content as PIXINS.Sprite).mask = node.mask;
}

/**
 * Apply / update / remove the user's CLIP mask (rect / ellipse / path) at time `t`.
 * Masks the whole `container` via its own child Graphics (the recommended Pixi v8
 * pattern) — a SEPARATE slot from the cover-fit `mask` (which masks `content`), so
 * the two never fight over one `.mask`. Rebuilt only when the resolved geometry
 * changes; `invert` keeps what's OUTSIDE the shape. Canvas-space (rotates with a
 * rotated clip — acceptable for v1 PiP masks).
 */
export function applyClipMask(PIXI: Pixi, node: RetainedNode, mask: ClipMask | undefined, t: number, W: number, H: number): void {
  if (!mask) {
    if (node.clipMask) {
      node.container.mask = null;
      node.clipMask.destroy();
      node.clipMask = undefined;
      node.clipMaskSig = undefined;
    }
    return;
  }
  const r = resolveMaskAt(mask, t);
  const pts = r.points ? r.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';') : '';
  const sig = `${r.shape}|${r.invert}|${r.frame.x},${r.frame.y},${r.frame.w},${r.frame.h}|${pts}`;
  if (!node.clipMask) {
    node.clipMask = new PIXI.Graphics();
    node.container.addChild(node.clipMask);
    node.clipMaskSig = undefined;
  }
  if (node.clipMaskSig !== sig) {
    const g = node.clipMask.clear();
    const bx = r.frame.x * W;
    const by = r.frame.y * H;
    const bw = r.frame.w * W;
    const bh = r.frame.h * H;
    if (r.shape === 'ellipse') g.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2);
    else if (r.shape === 'path' && r.points && r.points.length >= 3) g.poly(r.points.flatMap((p) => [p.x * W, p.y * H]));
    else g.rect(bx, by, bw, bh);
    g.fill(0xffffff); // colour is irrelevant — only the shape is used as a stencil
    node.clipMaskSig = sig;
  }
  // Re-assign each frame (same pattern as setSpriteMask). `setMask` for inverse.
  if (r.invert) node.container.setMask({ mask: node.clipMask, inverse: true });
  else node.container.mask = node.clipMask;
}

/**
 * Rotate a node — its content + masks/border/shadow as a unit — around a canvas-px
 * center by `deg` (clockwise). The container's pivot+position both sit at the
 * center, so at 0° it's identity and children stay in canvas coords.
 */
export function applyNodeRotation(node: RetainedNode, cx: number, cy: number, deg: number): void {
  node.container.position.set(cx, cy);
  node.container.pivot.set(cx, cy);
  node.container.rotation = (deg * Math.PI) / 180;
}

// ── Filter lifetime (one owner per slot; Pixi's destroy/reassign never frees) ──
// `content.filters` is composed from TWO independently-owned slots: the BoxStyle
// `shadowFilter` (boxstyle.ts) and the per-clip `effectFilters` (registry.ts).
// Composing in one place + destroying on swap is what stops the GL-program leak.

/** Set a node's stacking index, guarded — assigning `zIndex` (even the same value)
 *  re-flags the parent's `sortableChildren` sort, so skip the no-op write. */
export function setZ(node: RetainedNode, z: number): void {
  if (node.container.zIndex !== z) node.container.zIndex = z;
}

/** Re-assemble `content.filters` from the node's shadow + effect filter slots. */
export function composeNodeFilters(node: RetainedNode): void {
  const f: PIXINS.Filter[] = [];
  if (node.shadowFilter) f.push(node.shadowFilter); // first → renders behind content fx
  if (node.effectFilters) f.push(...node.effectFilters);
  node.content.filters = f.length ? f : [];
}

/** Destroy a filter array (skip cache-shared LUT filters; untrack animated shader
 *  filters so a freed filter isn't kept ticking). Used for per-node effect filters
 *  AND the stage adjustment-layer filters. */
export function disposeFilters(filters: readonly PIXINS.Filter[] | PIXINS.Filter | null | undefined): void {
  if (!filters) return;
  const arr = Array.isArray(filters) ? filters : [filters];
  const shared = new Set<PIXINS.Filter>(lutFilterCache.values());
  for (const f of arr) {
    if (shared.has(f)) continue; // LUT cache owns these — never destroy here
    untrackShaderFilter(f);
    f.destroy();
  }
}

/** Destroy the per-clip effect filters slot. */
export function disposeEffectFilters(node: RetainedNode): void {
  disposeFilters(node.effectFilters);
  node.effectFilters = undefined;
}

/** Destroy the BoxStyle drop-shadow filter, if any. */
export function disposeShadowFilter(node: RetainedNode): void {
  if (node.shadowFilter) {
    node.shadowFilter.destroy();
    node.shadowFilter = undefined;
  }
}

/** Free ALL of a node's filters (call before destroying the node — prune / kind-change). */
export function disposeNodeFilters(node: RetainedNode): void {
  disposeEffectFilters(node);
  disposeShadowFilter(node);
}
