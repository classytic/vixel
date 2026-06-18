/**
 * BoxStyle (`transform.style`) rendering — rounded-corner clip mask, border stroke,
 * and drop shadow on a retained node's box. ALL fractions are of the box's shorter
 * side, so the look survives any output size — the same convention the ffmpeg engine
 * uses (preview ≈ export).
 */
import type * as PIXINS from 'pixi.js';
import type { BoxStyle } from '@classytic/vixel-schema';
import type { Pixi, RetainedNode } from '../types.js';
import { resolveBoxStylePx } from '../calc.js';
import { composeNodeFilters, disposeShadowFilter } from '../node.js';

/**
 * Apply BoxStyle (`transform.style`) to a node's box: rounded-corner clip mask,
 * border stroke, and drop shadow. ALL fractions are of the box's shorter side, so
 * the look survives any output size — the same convention the ffmpeg engine uses.
 *
 * - `radius`  → a rounded-rect {@link PIXINS.Graphics} clip mask (px = radius·min(w,h)).
 * - `border`  → a rounded-rect outline drawn over the content (px = width·min(w,h)).
 * - `shadow`  → a {@link PIXINS.DropShadowFilter} when pixi-filters is bundled on the
 *               `PIXI` namespace (probed at runtime, like BackdropBlurFilter); else a
 *               soft offset rounded-rect {@link PIXINS.Graphics} BEHIND the box (honest
 *               fallback, not a fake). Filter shadow stacks AFTER content effects.
 *
 * The mask + border + shadow are children of the node container (canvas coords),
 * so they rotate as a unit with the content via `applyNodeRotation`. Rebuilt
 * only when the style or box geometry changes; nothing per-frame here.
 */
export function applyBoxStyle(
  PIXI: Pixi,
  node: RetainedNode,
  style: BoxStyle | undefined,
  box: { bx: number; by: number; bw: number; bh: number },
): void {
  const { bx, by, bw, bh } = box;
  const { radiusPx, borderPx, shadow: shadowPx } = resolveBoxStylePx(style, bw, bh);
  const sig = JSON.stringify([
    bx, by, bw, bh,
    radiusPx,
    borderPx, style?.border?.color ?? null,
    style?.shadow ?? null,
  ]);
  if (node.styleSig === sig) return;
  node.styleSig = sig;

  // ── rounded-corner clip mask ──
  if (radiusPx > 0.5) {
    if (!node.styleMask) {
      node.styleMask = new PIXI.Graphics();
      node.container.addChild(node.styleMask);
    }
    node.styleMask.clear().roundRect(bx, by, bw, bh, radiusPx).fill(0xffffff);
    // A rounded mask SUPERSEDES the rectangular cover-fit mask (both can't apply).
    if (node.mask) {
      node.mask.destroy();
      node.mask = undefined;
      node.maskSig = undefined;
    }
    (node.content as PIXINS.Sprite | PIXINS.Graphics).mask = node.styleMask;
  } else if (node.styleMask) {
    (node.content as PIXINS.Sprite | PIXINS.Graphics).mask = null;
    node.styleMask.destroy();
    node.styleMask = undefined;
  }

  // ── border stroke (drawn over the content edge, fully INSIDE the frame) ──
  if (borderPx > 0.25 && style?.border?.color) {
    if (!node.border) {
      node.border = new PIXI.Graphics();
      node.container.addChild(node.border); // above content
    }
    // Inset the stroke rect by half its width so the FULL border sits inside the box
    // edge. A centered stroke on the raw frame rect would straddle the edge — and on a
    // full-bleed (Full) clip half of it draws past the canvas and gets clipped, so the
    // border looks thin / missing at the very edges. Inset keeps it whole on both
    // full-frame and PiP clips. The radius shrinks by the same half to stay concentric.
    const half = borderPx / 2;
    node.border
      .clear()
      .roundRect(bx + half, by + half, bw - borderPx, bh - borderPx, Math.max(0, radiusPx - half))
      .stroke({ color: style.border.color, width: borderPx, alignment: 0.5 });
  } else if (node.border) {
    node.border.destroy();
    node.border = undefined;
  }

  // ── drop shadow ──
  const sh = style?.shadow;
  // pixi-filters' DropShadowFilter — only when the host bundles it onto PIXI.
  const DropShadowCtor = (PIXI as unknown as {
    DropShadowFilter?: new (o: Record<string, unknown>) => PIXINS.Filter;
  }).DropShadowFilter;
  if (sh && shadowPx) {
    const { ox, oy: oyPx, blur: blurPx } = shadowPx;
    const color = sh.color ?? '#000000';
    if (DropShadowCtor) {
      // Filter shadow renders softly under the content. Owned in `node.shadowFilter`
      // (its OWN slot, never the shared `content.filters` array) + composed there —
      // so it can't clobber / be clobbered by the per-clip effect filters, and is
      // destroyed on every restyle (the dual-owner leak the audit flagged).
      disposeShadowFilter(node); // free the previous shadow filter, if any
      node.shadowFilter = new DropShadowCtor({ offsetX: ox, offsetY: oyPx, blur: Math.max(1, blurPx / 2), color, alpha: 0.5 });
      composeNodeFilters(node);
      if (node.styleShadow) { node.styleShadow.destroy(); node.styleShadow = undefined; }
    } else {
      // Honest fallback: a soft offset rounded-rect BEHIND the box. Not a fake — a
      // real translucent shadow shape, just without a gaussian falloff.
      disposeShadowFilter(node); // drop a stale filter shadow if we fell back to graphics
      composeNodeFilters(node);
      if (!node.styleShadow) {
        node.styleShadow = new PIXI.Graphics();
        node.container.addChildAt(node.styleShadow, 0); // behind content
      }
      node.styleShadow
        .clear()
        .roundRect(bx + ox, by + oyPx, bw, bh, radiusPx)
        .fill({ color, alpha: 0.45 });
    }
  } else {
    // No shadow → drop both the filter and the graphics fallback.
    disposeShadowFilter(node);
    composeNodeFilters(node);
    if (node.styleShadow) {
      node.styleShadow.destroy();
      node.styleShadow = undefined;
    }
  }
}
