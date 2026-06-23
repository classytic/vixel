/**
 * `<TransformOverlay>` — on-canvas direct manipulation for the editor preview.
 * ===========================================================================
 * A headless-but-styled primitive: render it as a SIBLING of {@link PixiPreview}
 * inside a `position:relative` container and it draws the selection gizmo (move /
 * resize / rotate) over the selected element plus hover-to-select hit regions for
 * the others — writing the SAME unified `transform` the inspector edits. The
 * gesture math is {@link useTransformDrag}; this component owns the geometry
 * (each element's on-screen box, incl. MEASURED text) and the affordances.
 *
 * UNIFIED MODEL: every visual-lane item is a {@link VisualClip} (its kind lives in
 * `clip.media.kind`) and selects as kind `'clip'`. All clips manipulate
 * `transform.frame` / `transform.rotation` via `actions.updateClip` — there is no
 * Clip vs Overlay split and no legacy `position`. Text uses the renderer's exact
 * published box (it hugs the glyphs); a drag writes `transform.frame`.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <PixiPreview />
 *   <TransformOverlay />
 * </div>
 * ```
 */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { VisualTransform, MediaKind, VisualClip } from '@classytic/vixel-schema';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';
import { layoutLane, isVisualTrack } from '../../shared/utils/spec.js';
import { resolveSelection } from '../../shared/utils/selection.js';
import { useTransformDrag, type TransformMode } from '../../shared/transform/useTransformDrag.js';
import { getElementLayouts, subscribeElementLayouts, type ElementLayout } from '../pixi/index.js';

type Box = { x: number; y: number; w: number; h: number };
type Sel = { kind: 'clip'; trackIndex: number; itemIndex: number };
type ClipRec = {
  media?: { kind?: MediaKind; text?: string; style?: { fontFamily?: string; fontSize?: number; bold?: boolean; letterSpacing?: number } };
  transform?: VisualTransform;
  hidden?: boolean;
  at?: number;
  duration?: number;
};

const HANDLES: { mode: TransformMode; cx: number; cy: number; cursor: string }[] = [
  { mode: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { mode: 'n', cx: 0.5, cy: 0, cursor: 'ns-resize' },
  { mode: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { mode: 'e', cx: 1, cy: 0.5, cursor: 'ew-resize' },
  { mode: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
  { mode: 's', cx: 0.5, cy: 1, cursor: 'ns-resize' },
  { mode: 'sw', cx: 0, cy: 1, cursor: 'sw-resize' },
  { mode: 'w', cx: 0, cy: 0.5, cursor: 'ew-resize' },
];

// Approximate the text BOX before the renderer publishes its exact one. WIDTH is the
// AUTHORED wrap width (`frame.w`, the box the side handles edit), HEIGHT is measured
// from the wrapped line count — mirroring what the Pixi renderer publishes, so the
// gizmo never jumps when the exact box arrives a frame later. A shared 2D context
// gives canvas `measureText` ≈ Pixi glyph metrics for the wrap + height estimate.
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextBox(rec: ClipRec, W: number, H: number): Box {
  const style = rec.media?.style;
  const fontSize = typeof style?.fontSize === 'number' ? style.fontSize : Math.round(W * 0.05);
  const family = style?.fontFamily ?? 'sans-serif';
  const weight = style?.bold ? '700' : '400';
  const frame = rec.transform?.frame;
  // Authored wrap width in px, clamped to the canvas (matches the renderer's clamp).
  const wrapPx = Math.min(frame ? frame.w * W : W * 0.8, W);
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  // Estimate wrapped line count by greedily packing words into `wrapPx`.
  let lineCount = 1;
  if (measureCtx) {
    measureCtx.font = `${weight} ${fontSize}px ${family}`;
    const measure = (s: string) => measureCtx!.measureText(s).width + (style?.letterSpacing ? Math.max(0, s.length - 1) * style.letterSpacing : 0);
    for (const para of String(rec.media?.text ?? '').split(/\r?\n/)) {
      let cur = '';
      let lines = 1;
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (measure(next) > wrapPx && cur) {
          lines++;
          cur = word;
        } else cur = next;
      }
      lineCount += lines - 1 + (para === '' ? 1 : 0);
    }
  }
  const hPx = fontSize * 1.25 * Math.max(1, lineCount);
  // Box width = authored wrap width; centered on the frame (or canvas center).
  const cxF = frame ? frame.x + frame.w / 2 : 0.5;
  const cyF = frame ? frame.y + frame.h / 2 : 0.5;
  return { x: cxF - wrapPx / W / 2, y: cyF - hPx / H / 2, w: wrapPx / W, h: hPx / H };
}

/** The on-screen normalized box + rotation for any clip (fallback to geometry). */
function boxOf(rec: ClipRec, W: number, H: number): { frame: Box; rotation: number } {
  const rotation = rec.transform?.rotation ?? 0;
  if (rec.media?.kind === 'text') return { frame: measureTextBox(rec, W, H), rotation };
  const explicit = rec.transform?.frame as Box | undefined;
  if (explicit) return { frame: explicit, rotation };
  // Unframed image/video/shape ⇒ full canvas.
  return { frame: { x: 0, y: 0, w: 1, h: 1 }, rotation };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface TransformOverlayProps {
  /** Class for the absolutely-positioned overlay root (covers the preview). */
  className?: string;
  /**
   * Bump whenever an ancestor viewport transform (canvas zoom/pan) changes, so the
   * gizmo recomputes its screen-space handle positions (derived from the canvas
   * `getBoundingClientRect()`). A CSS transform doesn't fire ResizeObserver.
   */
  recomputeKey?: string | number;
}

export function TransformOverlay({ className, recomputeKey }: TransformOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const selection = useEditorState((s) => s.selection);
  const spec = useEditorState((s) => s.spec);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const actions = useEditorActions();
  const [, force] = useState(0);
  // Base (frame + fontSize) captured at the START of a TEXT resize, so the drag
  // scales the font proportionally to the box (text has an absolute fontSize, not
  // a fit-to-frame size — so resizing must scale it to "feel" like a resize).
  const resizeBase = useRef<{ frame: Box; fontSize: number } | null>(null);

  // Recompute handle positions when the host's viewport transform changes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => force((n) => n + 1));
    return () => cancelAnimationFrame(raf);
  }, [recomputeKey]);
  // Exact rendered boxes published by the Pixi preview (text/shape/media); other
  // cases fall back to the geometric `boxOf`.
  const layouts = useSyncExternalStore(subscribeElementLayouts, getElementLayouts, getElementLayouts);

  // Reposition on container/canvas resize and once the Pixi canvas mounts.
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(parent);
    const canvas = parent.querySelector('canvas');
    if (canvas) ro.observe(canvas);
    const raf = requestAnimationFrame(() => force((n) => n + 1));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [selection]);

  const W = spec.output.width;
  const H = spec.output.height;
  // Render key for a visual clip — matches the Pixi renderer's `vis:<ti>:<ci>`.
  const keyFor = (s: { trackIndex: number; itemIndex: number }) => `vis:${s.trackIndex}:${s.itemIndex}`;
  // Prefer the renderer's exact box (if published for this element), else geometry.
  const resolveBox = (r: ClipRec, key: string): { frame: Box; rotation: number } => {
    const l: ElementLayout | undefined = layouts.get(key);
    return l ? { frame: { x: l.x, y: l.y, w: l.w, h: l.h }, rotation: l.rotation } : boxOf(r, W, H);
  };

  // The stored selection is id-keyed; resolve it to a live position + item once.
  const resolvedSel = selection?.kind === 'clip' ? resolveSelection(spec, selection) : null;
  const clip = resolvedSel && isVisualTrack(resolvedSel.track) ? (resolvedSel.item as VisualClip) : null;
  const rec = clip as unknown as ClipRec | null;
  const kind = rec?.media?.kind;
  const isText = kind === 'text';
  // A LINE shape is drawn as the frame's DIAGONAL, so only its two diagonal corners
  // (nw + se) are real endpoints — the other 6 box handles are meaningless. Show just
  // those two + rotate, so a line reads/edits as a line, not a rectangle.
  const isLine = kind === 'shape' && (rec?.media as { shape?: string } | undefined)?.shape === 'line';
  // Effect adjustment layers have no spatial box — no transform gizmo for them.
  const sel = rec && kind !== 'effect' && resolvedSel ? resolveBox(rec, keyFor(resolvedSel)) : null;
  const frame = sel?.frame ?? null;
  const rotation = sel?.rotation ?? 0;

  const layerEl = ref.current;
  const canvas = layerEl?.parentElement?.querySelector('canvas') as HTMLCanvasElement | null;
  const cr = canvas?.getBoundingClientRect();
  const lr = layerEl?.getBoundingClientRect();

  const startDrag = useTransformDrag({
    frame: frame ?? { x: 0, y: 0, w: 1, h: 1 },
    rotation,
    rect: cr ? { left: cr.left, top: cr.top, width: cr.width, height: cr.height } : { left: 0, top: 0, width: 1, height: 1 },
    onChange: (patch) => {
      if (!resolvedSel || !rec || selection?.kind !== 'clip') return;
      const next: VisualTransform = { ...(rec.transform ?? {}) };
      if (patch.frame) next.frame = patch.frame;
      if (patch.rotation !== undefined) next.rotation = Math.round(patch.rotation);
      const clipPatch: Parameters<typeof actions.updateClip>[2] = { transform: next };
      // Text: a box resize scales the font by the height ratio vs. the drag-start box
      // (corner / N-S handles resize; E-W just changes wrap width → height unchanged).
      if (isText && patch.frame && resizeBase.current && clip && clip.media.kind === 'text') {
        const ratio = patch.frame.h / resizeBase.current.frame.h;
        if (Number.isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 0.001) {
          const fontSize = Math.max(8, Math.round(resizeBase.current.fontSize * ratio));
          clipPatch.media = { ...clip.media, style: { ...(clip.media.style ?? {}), fontSize } };
        }
      }
      actions.updateClip(resolvedSel.trackIndex, resolvedSel.itemIndex, clipPatch);
    },
  });

  const rootCls = `pointer-events-none absolute inset-0${className ? ` ${className}` : ''}`;
  if (!layerEl || !canvas || !cr || !lr || cr.width < 2 || cr.height < 2) return <div ref={ref} className={rootCls} aria-hidden />;

  const ox = cr.left - lr.left;
  const oy = cr.top - lr.top;
  const toPx = (f: Box) => ({ left: ox + f.x * cr.width, top: oy + f.y * cr.height, width: f.w * cr.width, height: f.h * cr.height });

  // Hover-to-select: every visible clip except the selection gets a hit region.
  // STACKING is positional — composite (trackIndex, clipIndex) order, later = on
  // top — so a monotonic `order` reproduces the rendered stack for hit-priority.
  const hover: { sel: Sel; frame: Box; rotation: number; order: number }[] = [];
  let order = 0;
  let selOrder = -1; // the selected clip's positional order (for hit-priority layering)
  spec.tracks.forEach((t, trackIndex) => {
    if (!isVisualTrack(t)) return;
    for (const l of layoutLane(t)) {
      const itemIndex = l.index;
      const z = order++;
      const r = t.clips[itemIndex] as unknown as ClipRec;
      if (r.hidden || r.media?.kind === 'effect') continue; // effects aren't spatially selectable
      if (!(playheadSec >= l.startSec && playheadSec < l.endSec)) continue;
      if (resolvedSel && resolvedSel.trackIndex === trackIndex && resolvedSel.itemIndex === itemIndex) {
        selOrder = z; // capture, but don't add a hit region for the selected element
        continue;
      }
      const s: Sel = { kind: 'clip', trackIndex, itemIndex };
      hover.push({ sel: s, order: z, ...resolveBox(r, keyFor(s)) });
    }
  });
  // Lowest order first → highest LAST in the DOM, so the topmost visible element
  // wins the hover/click (matches the rendered stack).
  hover.sort((a, b) => a.order - b.order);

  const showGizmo = !!selection && !!clip && !!frame;
  const g = frame ? toPx(frame) : null;

  return (
    <div ref={ref} className={rootCls}>
      {hover.map((h, i) => {
        const p = toPx(h.frame);
        return (
          <button
            key={`${h.sel.trackIndex}-${h.sel.itemIndex}-${i}`}
            type="button"
            aria-label="Select element"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              actions.select(h.sel);
            }}
            className="pointer-events-auto absolute border-2 border-transparent bg-transparent transition-colors hover:border-primary/60"
            // Elements ABOVE the selected one (higher positional order) sit OVER the
            // selected gizmo (z-10) so they stay clickable even when the selection's
            // move-surface covers them (the "can't select the text behind the video"
            // bug); elements below stay under it.
            style={{ left: p.left, top: p.top, width: p.width, height: p.height, transform: `rotate(${h.rotation}deg)`, transformOrigin: 'center', zIndex: h.order > selOrder ? 25 : 5 }}
          />
        );
      })}

      {/* The gizmo is TWO stacked layers so it survives overlapping clips:
          - the MOVE surface stays at z-10 so a clip stacked IN FRONT (its hit region
            at z-25) can still be click-selected through the selected clip's body;
          - the precise HANDLES + ROTATE knob sit at z-30 (ABOVE those hit regions) so
            resize/rotate ALWAYS work, even when another clip overlaps the selection
            (otherwise a transparent z-25 region eats the handle clicks — you'd see the
            handles but dragging would do nothing). */}
      {showGizmo && g &&
        (() => {
          const boxStyle = { left: g.left, top: g.top, width: g.width, height: g.height, transform: `rotate(${rotation}deg)`, transformOrigin: 'center' } as const;
          return (
            <>
              {/* Move surface + selection box — z-10 (select-through-able body). */}
              <div className="absolute" style={{ ...boxStyle, zIndex: 10 }}>
                <div
                  onPointerDown={startDrag('move')}
                  className={`pointer-events-auto absolute inset-0 cursor-move ${isLine ? '' : 'shadow-[0_0_0_1px_rgba(0,0,0,0.45)]'}`}
                  // A LINE shows no rectangular border (it isn't a box) — just its two
                  // endpoint handles + rotate; the surface stays draggable to move it.
                  style={{ touchAction: 'none', border: isLine ? '2px solid transparent' : `2px ${isText ? 'dashed' : 'solid'} var(--color-primary, #6366f1)` }}
                />
              </div>
              {/* Handles + rotate — z-30, always interactive (above any hit region). */}
              <div className="pointer-events-none absolute" style={{ ...boxStyle, zIndex: 30 }}>
                <div className="absolute left-1/2 -translate-x-1/2" style={{ top: -22, height: 22, width: 2, background: 'var(--color-primary, #6366f1)' }} />
                <button
                  type="button"
                  aria-label="Rotate"
                  onPointerDown={startDrag('rotate')}
                  className="pointer-events-auto absolute left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full border-2 border-primary bg-white text-primary shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{ top: -44, cursor: 'grab', touchAction: 'none' }}
                >
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v6h-6" />
                  </svg>
                </button>
                {(isLine ? HANDLES.filter((h) => h.mode === 'nw' || h.mode === 'se') : HANDLES).map((h) => {
                  const isCorner = h.mode.length === 2;
                  const isVert = h.mode === 'e' || h.mode === 'w';
                  const shape = isCorner ? 'size-3.5 rounded-[4px]' : isVert ? 'h-6 w-1.5 rounded-full' : 'h-1.5 w-6 rounded-full';
                  const onDown = startDrag(h.mode);
                  return (
                    <button
                      key={h.mode}
                      type="button"
                      aria-label={`Resize ${h.mode}`}
                      onPointerDown={(e) => {
                        // Capture the text's pre-drag box + fontSize so the resize can scale
                        // the font proportionally (see the onChange handler above).
                        if (isText && frame) {
                          const fs = clip?.media.kind === 'text' ? clip.media.style?.fontSize : undefined;
                          resizeBase.current = { frame: { ...frame }, fontSize: typeof fs === 'number' ? fs : Math.round(W * 0.05) };
                        }
                        onDown(e);
                      }}
                      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-2 border-primary bg-white shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${shape}`}
                      style={{ left: h.cx * g.width, top: h.cy * g.height, cursor: h.cursor, touchAction: 'none' }}
                    />
                  );
                })}
              </div>
            </>
          );
        })()}
    </div>
  );
}
