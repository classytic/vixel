/**
 * useTransformDrag — headless on-canvas move / resize / rotate gesture.
 * ====================================================================
 * The reusable math + pointer wiring behind direct-manipulation transform
 * handles, shared so any host (the reference editor, a custom app) gets identical
 * behavior instead of re-implementing the screen↔normalized mapping. The host
 * renders the affordances (selection box, 8 resize handles, rotate knob) and the
 * Pixi/DOM rect; this hook turns a pointer drag into `frame`/`rotation` patches
 * on the unified {@link VisualTransform}.
 *
 * Pure {@link applyResize} is exported for testing the resize/move geometry
 * without a DOM.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Rect } from '@classytic/vixel-schema';

/** Drag modes: body move, 8 edge/corner resizes, and the rotate knob. */
export type TransformMode = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'rotate';

const clampPos = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Apply a move/resize drag to a normalized {@link Rect}. `dx`/`dy` are the pointer
 * delta as a FRACTION of the canvas. West/north edges move the origin as they
 * resize so the opposite edge stays put. `minSize` floors width/height. Pure.
 */
export function applyResize(mode: Exclude<TransformMode, 'rotate'>, orig: Rect, dx: number, dy: number, minSize = 0.02): Rect {
  const clampSize = (v: number): number => Math.min(1, Math.max(minSize, v));
  const f: Rect = { ...orig };
  if (mode === 'move') {
    f.x = clampPos(orig.x + dx);
    f.y = clampPos(orig.y + dy);
    return f;
  }
  if (mode.includes('e')) f.w = clampSize(orig.w + dx);
  if (mode.includes('s')) f.h = clampSize(orig.h + dy);
  if (mode.includes('w')) {
    f.w = clampSize(orig.w - dx);
    f.x = clampPos(orig.x + (orig.w - f.w));
  }
  if (mode.includes('n')) {
    f.h = clampSize(orig.h - dy);
    f.y = clampPos(orig.y + (orig.h - f.h));
  }
  return f;
}

/**
 * Resize a ROTATED rect: the pointer delta is projected onto the element's local
 * (rotated) axes, the box grows/shrinks along those axes, and the OPPOSITE edge /
 * corner stays fixed in world space (so the handle you drag tracks the pointer and
 * the box stays put on the other side — CapCut behavior). `dx`/`dy` are the pointer
 * delta as a fraction of the canvas; `rotationDeg` is the element's rotation. For
 * `rotationDeg === 0` this is equivalent to {@link applyResize} (minus the [0,1]
 * position clamp, since a rotated box can legitimately extend off-canvas). Pure.
 */
export function applyResizeRotated(
  mode: Exclude<TransformMode, 'rotate'>,
  orig: Rect,
  dx: number,
  dy: number,
  rotationDeg: number,
  minSize = 0.02,
): Rect {
  if (mode === 'move' || rotationDeg === 0) return applyResize(mode, orig, dx, dy, minSize);
  const th = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  // Pointer delta in the element's local frame (rotate by −θ).
  const ldx = dx * c + dy * s;
  const ldy = -dx * s + dy * c;
  const ex = mode.includes('e') ? 1 : mode.includes('w') ? -1 : 0; // which x edge moves
  const ey = mode.includes('s') ? 1 : mode.includes('n') ? -1 : 0; // which y edge moves
  const nw = Math.max(minSize, orig.w + ex * ldx);
  const nh = Math.max(minSize, orig.h + ey * ldy);
  const c0 = { x: orig.x + orig.w / 2, y: orig.y + orig.h / 2 };
  // Anchor = the opposite edge/corner, fixed in world space.
  const ax = -ex * (orig.w / 2);
  const ay = -ey * (orig.h / 2);
  const anchorWorld = { x: c0.x + (ax * c - ay * s), y: c0.y + (ax * s + ay * c) };
  const axn = -ex * (nw / 2);
  const ayn = -ey * (nh / 2);
  const center = { x: anchorWorld.x - (axn * c - ayn * s), y: anchorWorld.y - (axn * s + ayn * c) };
  return { x: center.x - nw / 2, y: center.y - nh / 2, w: nw, h: nh };
}

/** Normalize degrees to (−180, 180] — matching the inspector's rotation range. */
export function normalizeAngle(deg: number): number {
  const m = ((deg % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

export interface TransformDragConfig {
  /** The element's current normalized frame (0..1). */
  frame: Rect;
  /** Current rotation in DEGREES (clockwise). */
  rotation: number;
  /** The canvas rect in client px — for screen↔normalized mapping + rotate pivot. */
  rect: { left: number; top: number; width: number; height: number };
  /** Commit a frame and/or rotation change (one or both per move tick). */
  onChange: (patch: { frame?: Rect; rotation?: number }) => void;
  /** Snap rotation to this increment (deg) while the Shift key is held (default 15). */
  rotateSnapDeg?: number;
  /** Minimum normalized width/height when resizing (default 0.02). */
  minSize?: number;
}

/**
 * Returns `startDrag(mode)` — a pointer-down handler that runs a move/resize/rotate
 * drag to completion (window-level move/up listeners), emitting `onChange` patches.
 * Reads the latest config at drag start, so a re-render mid-render is fine.
 */
export function useTransformDrag(config: TransformDragConfig): (mode: TransformMode) => (e: ReactPointerEvent) => void {
  const ref = useRef(config);
  ref.current = config;

  // Track the active gesture's listeners so we can tear them down if the host
  // unmounts mid-drag, or the pointer is cancelled / the window loses focus —
  // otherwise window listeners leak past the component's life.
  const activeRef = useRef<{ onMove: (e: PointerEvent) => void; onEnd: () => void } | null>(null);
  // Coalesce onChange (→ host store commit) to ONE per animation frame: a transform
  // gesture fires pointermove faster than it's worth committing the spec.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ frame?: Rect; rotation?: number } | null>(null);
  useEffect(() => {
    return () => {
      const a = activeRef.current;
      if (a) {
        window.removeEventListener('pointermove', a.onMove);
        window.removeEventListener('pointerup', a.onEnd);
        window.removeEventListener('pointercancel', a.onEnd);
        window.removeEventListener('blur', a.onEnd);
        activeRef.current = null;
      }
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return useCallback(
    (mode: TransformMode) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { frame, rotation, rect, rotateSnapDeg = 15, minSize = 0.02 } = ref.current;
      const sx = e.clientX;
      const sy = e.clientY;

      // rAF-batched commit: keep the latest patch, fire `onChange` once per frame.
      const flush = () => {
        rafRef.current = null;
        const p = pendingRef.current;
        pendingRef.current = null;
        if (p) ref.current.onChange(p);
      };
      const commit = (patch: { frame?: Rect; rotation?: number }) => {
        pendingRef.current = patch;
        if (typeof requestAnimationFrame === 'undefined') {
          flush();
        } else if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(flush);
        }
      };

      let onMove: (ev: PointerEvent) => void;
      if (mode === 'rotate') {
        // Pivot = the box center in client px; track the pointer's angle around it.
        const pivotX = rect.left + (frame.x + frame.w / 2) * rect.width;
        const pivotY = rect.top + (frame.y + frame.h / 2) * rect.height;
        const startAngle = Math.atan2(sy - pivotY, sx - pivotX);
        const orig = rotation;
        onMove = (ev) => {
          const ang = Math.atan2(ev.clientY - pivotY, ev.clientX - pivotX);
          let deg = orig + ((ang - startAngle) * 180) / Math.PI; // screen y-down ⇒ clockwise+
          if (ev.shiftKey) deg = Math.round(deg / rotateSnapDeg) * rotateSnapDeg;
          commit({ rotation: normalizeAngle(deg) });
        };
      } else {
        const orig: Rect = { ...frame };
        const rotDeg = rotation;
        onMove = (ev) => {
          const dx = (ev.clientX - sx) / rect.width;
          const dy = (ev.clientY - sy) / rect.height;
          commit({ frame: applyResizeRotated(mode, orig, dx, dy, rotDeg, minSize) });
        };
      }

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        window.removeEventListener('blur', onEnd);
        activeRef.current = null;
        // Commit the final transform value (a frame may still be pending).
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          flush();
        }
      };
      activeRef.current = { onMove, onEnd };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      window.addEventListener('blur', onEnd);
    },
    [],
  );
}
