/**
 * `useDraggable` — make a panel item (media / audio / text / transition / effect)
 * draggable ONTO the timeline. Pointer-events based (custom ghost, touch-capable,
 * precise drop math — the model CapCut/Canva use), not native HTML5 DnD.
 *
 * A plain tap still fires the element's `onClick` (the "add at playhead" path):
 * the drag only begins past a small movement threshold, and the synthetic click
 * after a real drag is swallowed so it can't double-add.
 */
'use client';

import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';
import { useTimelineDnd } from '../DndContext.js';
import { autoScrollTimelineEdge } from '../autoScroll.js';
import type { DragPayload, DragKind } from '../dragStore.js';
import type { DropTarget } from '../dropResolver.js';
import {
  withClipInserted,
  withClipInNewLane,
  withAudioItemAppended,
} from '../../../shared/utils/spec.js';
import { stackingLaneIndex } from '../lane-math.js';

const DRAG_THRESHOLD_PX = 5;

export interface DraggableSpec {
  payload: DragPayload;
  /** Ghost label at the cursor. */
  label: string;
}

function kindOf(p: DragPayload): DragKind {
  return p.type === 'audio' ? 'audio' : p.type === 'transition' ? 'transition' : 'visual';
}

export function useDraggable(make: () => DraggableSpec) {
  const actions = useEditorActions();
  const dnd = useTimelineDnd();
  const session = useRef<{ spec: DraggableSpec; kind: DragKind; startX: number; startY: number; dragging: boolean } | null>(null);

  // Tear down the active gesture's window listeners + clear the live ghost if the
  // drag source unmounts mid-drag (otherwise the listeners + ghost leak).
  const activeRef = useRef<{
    onMove: (e: PointerEvent) => void;
    onUp: (e: PointerEvent) => void;
    onCancel: (e: PointerEvent) => void;
  } | null>(null);
  useEffect(() => {
    return () => {
      const a = activeRef.current;
      if (!a) return;
      window.removeEventListener('pointermove', a.onMove);
      window.removeEventListener('pointerup', a.onUp);
      window.removeEventListener('pointercancel', a.onCancel);
      activeRef.current = null;
      session.current = null;
      dnd.publish(null);
    };
  }, [dnd]);

  const commit = (s: DraggableSpec, target: DropTarget) => {
    const p = s.payload;
    const next = actions.getSpec();
    if (p.type === 'transition') {
      // Transitions apply on a seam between two adjacent clips — on ANY visual lane
      // (the resolver only reports `seamGap` where `laneSeams` finds a real cut).
      if (target.trackType === 'visual' && target.seamGap != null) {
        actions.setTransition(target.trackIndex, target.seamGap, p.transition);
      }
      return;
    }
    if (p.type === 'audio') {
      actions.setSpec(withAudioItemAppended(next, { ...p.audio, at: target.sec }));
      return;
    }
    // clip (any visual media — image/video/text/shape/effect, kind is in clip.media)
    if (target.newLayer || target.trackType !== 'visual') {
      // Dropped on empty space (or a non-visual lane) → a brand-new visual lane. Shared
      // lane-math converts the DISPLAY-order drop index (0 = top = FRONT) to the stacking
      // index, so "drop on top" lands in front (no source lane to prune on a fresh insert).
      const laneIndex = target.laneInsertIndex == null ? undefined : stackingLaneIndex(next, target.laneInsertIndex);
      actions.setSpec(withClipInNewLane(next, p.clip, target.sec, laneIndex));
    } else {
      // Insert onto the hovered visual lane at the drop time (sequential lanes re-flow).
      actions.setSpec(withClipInserted(next, target.trackIndex, p.clip, target.sec));
    }
  };

  const onMove = (e: PointerEvent) => {
    const s = session.current;
    if (!s) return;
    if (!s.dragging) {
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD_PX) return;
      s.dragging = true; // crossed the threshold → it's a drag, not a tap
    }
    autoScrollTimelineEdge(e.clientY); // reach off-screen lanes / the new-layer strip
    const t = dnd.resolve(e.clientX, e.clientY);
    // Transitions are only valid ON a seam; show the guide there (and nowhere else).
    const overSeam = s.kind === 'transition' && t?.seamGap != null;
    // A new-layer drop only applies to lane-creating payloads (not transitions, which
    // must land on a seam). `dropTrackIndex >= 0` = an existing lane is highlighted.
    const onLane = t && t.trackIndex >= 0;
    dnd.publish({
      source: 'insert',
      kind: s.kind,
      payload: s.spec.payload,
      label: s.spec.label,
      ghostX: e.clientX,
      ghostY: e.clientY,
      dropTrackIndex: s.kind === 'transition' ? (overSeam ? t!.trackIndex : null) : (onLane ? t!.trackIndex : null),
      snapSec: s.kind === 'transition' ? (overSeam ? t!.insertSec : null) : (t?.snapSec ?? null),
      insertSec: s.kind === 'visual' ? (t?.insertSec ?? null) : null,
      dropSeamGap: t?.seamGap ?? null,
      newLayer: s.kind !== 'transition' && !!t?.newLayer,
      laneInsertIndex: s.kind !== 'transition' ? (t?.laneInsertIndex ?? null) : null,
    });
  };

  const detach = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    activeRef.current = null;
  };

  // pointercancel (e.g. the OS/browser steals the pointer) or unmount: abandon the
  // gesture WITHOUT committing a drop.
  const onCancel = () => {
    detach();
    session.current = null;
    dnd.publish(null);
  };

  const onUp = (e: PointerEvent) => {
    detach();
    const s = session.current;
    session.current = null;
    dnd.publish(null);
    if (!s) return;
    if (s.dragging) {
      const t = dnd.resolve(e.clientX, e.clientY);
      if (t) commit(s.spec, t);
      // Swallow the click that follows a real drag so it can't also "add at playhead".
      window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
    }
  };

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      const spec = make();
      session.current = { spec, kind: kindOf(spec.payload), startX: e.clientX, startY: e.clientY, dragging: false };
      activeRef.current = { onMove, onUp, onCancel };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onCancel, { once: true });
    },
  };
}
