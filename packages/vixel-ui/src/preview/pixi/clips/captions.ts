/**
 * Word-timed caption rendering for the preview (karaoke / highlight / highlight-box
 * / pop / word-by-word) — the browser mirror of the engine's libass `\k` / per-word
 * coloring. A cue is drawn as a centered row of individually-tinted glyphs; only
 * `tint` / `visible` / `scale` change per frame (no re-raster), so scrubbing stays
 * cheap. Single-line layout (no wrap) — adequate for short captions; the engine is
 * authoritative for multi-line wrapping on export.
 */
import type * as PIXINS from 'pixi.js';
import type { CaptionCue, TextStyle } from '@classytic/vixel-schema';
import type { Pixi, RetainedNode, ElementLayout } from '../types.js';
import { getFontEpoch } from '../media/fonts.js';

/** The cue covering `absMs` (absolute ms), or undefined in a gap between cues. */
export function activeCue(cues: readonly CaptionCue[], absMs: number): CaptionCue | undefined {
  for (const c of cues) if (absMs >= c.startMs && absMs < c.endMs) return c;
  return undefined;
}

/** Tear down the per-word caption row (when an overlay leaves word-caption mode). */
export function clearWordRow(node: RetainedNode): void {
  if (!node.wordRow) return;
  node.wordRow.destroy({ children: true });
  node.wordRow = undefined;
  node.words = undefined;
  node.wordBox = undefined;
  node.wordsSig = undefined;
}

/**
 * Render a word-timed caption cue as a centered row of individually-tinted glyphs.
 * Returns the row's exact box (normalized) so the transform gizmo can frame it.
 */
export function reconcileCaptionWords(
  PIXI: Pixi,
  node: RetainedNode,
  cue: CaptionCue,
  ts: TextStyle,
  anim: NonNullable<TextStyle['animation']>,
  absMs: number,
  fontSize: number,
  /** Box wrap width (px). Words wrap onto new lines past this — captions no longer
   *  overflow the frame as one runaway row. */
  wrapWidth: number,
  cx: number,
  cy: number,
  alpha: number,
  scale: number,
  rotation: number,
  rotDeg: number,
  W: number,
  H: number,
): ElementLayout {
  const words = cue.words ?? [];
  if (!node.wordRow) {
    node.wordRow = new PIXI.Container();
    node.container.addChild(node.wordRow);
  }
  const row = node.wordRow;
  const fill = ts.fillColor ?? '#ffffff';
  const highlight = ts.highlightColor ?? '#ffe600';
  const space = fontSize * 0.3;

  // (Re)build glyphs only when the cue text or style changes. Base fill is WHITE so
  // a per-frame `tint` (which doesn't re-rasterize) can paint fill/highlight exactly.
  const sig = `${cue.text}|${words.map((w) => w.text).join('')}|${fontSize}|${JSON.stringify(ts)}|${getFontEpoch()}`;
  if (node.wordsSig !== sig) {
    if (node.wordBox) { node.wordBox.destroy(); node.wordBox = undefined; }
    for (const t of node.words ?? []) t.destroy();
    const dropShadow = ts.glow
      ? { color: ts.glow.color, alpha: Math.min(1, ts.glow.intensity ?? 1), blur: ts.glow.sigma ?? 6, distance: 0, angle: 0 }
      : ts.shadow
        ? { color: ts.shadow.color, alpha: 1, blur: ts.shadow.blur ?? 0, distance: ts.shadow.depth ?? 2, angle: Math.PI / 4 }
        : undefined;
    const style = {
      fontFamily: ts.fontFamily ?? 'sans-serif',
      fontSize,
      fontWeight: ts.bold ? ('bold' as const) : ('normal' as const),
      fontStyle: ts.italic ? ('italic' as const) : ('normal' as const),
      fill: '#ffffff',
      letterSpacing: ts.letterSpacing ?? 0,
      ...(ts.stroke ? { stroke: { color: ts.stroke.color, width: ts.stroke.width } } : {}),
      ...(dropShadow ? { dropShadow } : {}),
    };
    // highlight-box: a rounded rect behind the active word, drawn first (lowest).
    if (anim === 'highlight-box') {
      node.wordBox = new PIXI.Graphics();
      row.addChild(node.wordBox);
    }
    node.words = words.map((w) => {
      const t = new PIXI.Text({ text: w.text, style });
      t.anchor.set(0.5);
      row.addChild(t);
      return t;
    });
    node.wordsSig = sig;
  }

  const glyphs = node.words ?? [];
  const widths = glyphs.map((t) => t.width);
  const lineHeight = fontSize * 1.4;

  // Greedily wrap words into lines bounded by `wrapWidth` (a long caption now flows
  // onto multiple lines inside the box instead of overrunning the frame as one row).
  const lines: number[][] = [];
  let line: number[] = [];
  let lineW = 0;
  glyphs.forEach((_, i) => {
    const add = (line.length ? space : 0) + widths[i];
    if (line.length && lineW + add > wrapWidth) { lines.push(line); line = []; lineW = 0; }
    line.push(i);
    lineW += (line.length > 1 ? space : 0) + widths[i];
  });
  if (line.length) lines.push(line);

  const totalH = lines.length * lineHeight;
  let maxLineW = 0;
  let activeIdx = -1;
  let lineY = cy - totalH / 2 + lineHeight / 2; // vertically center the block on cy
  for (const ln of lines) {
    const lw = ln.reduce((a, i) => a + widths[i], 0) + space * Math.max(0, ln.length - 1);
    maxLineW = Math.max(maxLineW, lw);
    let cursor = cx - lw / 2; // each line centered on cx
    for (const i of ln) {
      const w = widths[i];
      const t = glyphs[i];
      t.x = cursor + w / 2;
      t.y = lineY;
      const word = words[i];
      const past = word.endMs <= absMs;
      const active = absMs >= word.startMs && absMs < word.endMs;
      // Per-animation state. tint paints fill/highlight without re-rasterizing.
      let tint = fill;
      let visible = true;
      let popScale = 1;
      if (anim === 'karaoke') tint = past || active ? highlight : fill;
      else if (anim === 'highlight' || anim === 'highlight-box') tint = active ? highlight : fill;
      else if (anim === 'word-by-word') { visible = past || active; tint = active ? highlight : fill; }
      else if (anim === 'pop') { tint = active ? highlight : fill; popScale = active ? 1.15 : 1; }
      t.tint = tint;
      t.visible = visible;
      t.scale.set(popScale);
      if (active) activeIdx = i;
      cursor += w + space;
    }
    lineY += lineHeight;
  }

  // Highlight-box: position/size the pill behind the active word (line-aware y).
  if (node.wordBox) {
    if (activeIdx >= 0) {
      const padX = fontSize * 0.22;
      const padY = fontSize * 0.16;
      const bw = widths[activeIdx] + padX * 2;
      const bh = fontSize * 1.2 + padY * 2;
      node.wordBox.clear().roundRect(glyphs[activeIdx].x - bw / 2, glyphs[activeIdx].y - bh / 2, bw, bh, 8).fill(ts.box?.color ?? highlight);
      node.wordBox.visible = true;
    } else {
      node.wordBox.visible = false;
    }
  }

  // Center + rotate + (entrance) scale the whole block as a unit about (cx, cy).
  row.visible = true;
  row.alpha = alpha;
  row.position.set(cx, cy);
  row.pivot.set(cx, cy);
  row.rotation = rotation;
  row.scale.set(scale);

  // Box = the wrapped bounds (widest line × line count), so the gizmo frames the real
  // text and stays inside the canvas (width handle re-wraps via the authored frame.w).
  return { x: (cx - maxLineW / 2) / W, y: (cy - totalH / 2) / H, w: maxLineW / W, h: totalH / H, rotation: rotDeg };
}
