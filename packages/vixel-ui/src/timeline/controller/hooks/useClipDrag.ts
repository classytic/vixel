/**
 * Clip drag interactions — move + trim, via Pointer Events with capture.
 * =======================================================
 * Every visual lane item is a clip; behavior:
 *  - **sequential lane** ("main track"): body drag = REORDER (a visual offset shows
 *    during the drag, committed on release); trim handles adjust source-trim/duration.
 *  - **free lane**: body drag = reposition `at` live (magnetic snapping); trim
 *    handles adjust `at`/duration.
 *  - **audio**: body drag = reposition `at` live (no trim handles).
 *
 * Dragging a clip onto a DIFFERENT lane moves it there (changing only its lane +
 * `at` — its `media.kind` never changes); dragging onto empty space creates a NEW
 * lane. There is no cross-type conversion — a clip is a clip.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTimelineGeometry } from './useTimeline.js';
import { useEditorActions, useEditorState } from '../../../editor/controller/hooks/useEditorStore.js';
import {
  layoutLane,
  withClipMovedToLane,
  withClipMovedToNewLane,
} from '../../../shared/utils/spec.js';
import { stackingLaneIndex } from '../lane-math.js';
import type { ClipPatch } from '../../../types.js';
import { useTimelineDnd } from '../DndContext.js';
import { autoScrollTimelineEdge } from '../autoScroll.js';
import type { TimelineItem } from '../../types.js';

const MIN_DURATION_S = 0.1;

type Mode = 'idle' | 'move' | 'trim-start' | 'trim-end';

export interface ClipDragHandle {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface UseClipDrag {
  dragging: boolean;
  mode: Mode;
  /** Visual x-offset (px) to apply while reordering / moving a clip. */
  offsetPx: number;
  body: ClipDragHandle;
  startHandle: ClipDragHandle;
  endHandle: ClipDragHandle;
}

const SNAP_PX = 8;
// A body "move" only begins past this much pointer travel — so a CLICK (select, then
// e.g. press Delete) never turns into an accidental lane move / new-layer drop.
const DRAG_THRESHOLD_PX = 4;

export function useClipDrag(item: TimelineItem): UseClipDrag {
  const { pxToSec, secToPx } = useTimelineGeometry();
  const actions = useEditorActions();
  const dnd = useTimelineDnd();

  const isVisual = item.selectionKind === 'clip';
  // Select the lane's STABLE track ref (a fresh object selector would loop
  // useSyncExternalStore), then derive clips + sequential from it.
  const lane = useEditorState((s) => {
    const t = s.spec.tracks[item.trackIndex];
    return t && t.type === 'visual' ? t : null;
  });
  const clips = lane?.clips ?? null;
  const sequential = lane?.sequential ?? false;
  const playheadSec = useEditorState((s) => s.playheadSec);
  const kind: 'visual' | 'audio' = isVisual ? 'visual' : 'audio';

  const [mode, setMode] = useState<Mode>('idle');
  const [offsetPx, setOffsetPx] = useState(0);
  const modeRef = useRef<Mode>('idle');
  // `origDur` = the DISPLAYED width (butt-joined for transitions) — drives move-center.
  // `origRealDur` = the clip's REAL duration — drives TRIM.
  const session = useRef({ startX: 0, startY: 0, moved: false, origStart: 0, origDur: 0, origRealDur: 0 });

  // Coalesce trim commits to one per animation frame (high-frequency gesture).
  const trimRaf = useRef<number | null>(null);
  const trimPending = useRef<(() => void) | null>(null);
  const flushTrim = () => {
    trimRaf.current = null;
    const fn = trimPending.current;
    trimPending.current = null;
    fn?.();
  };
  const scheduleTrim = (fn: () => void) => {
    trimPending.current = fn;
    if (typeof requestAnimationFrame === 'undefined') {
      fn();
      trimPending.current = null;
    } else if (trimRaf.current == null) {
      trimRaf.current = requestAnimationFrame(flushTrim);
    }
  };
  useEffect(() => () => { if (trimRaf.current != null) cancelAnimationFrame(trimRaf.current); }, []);

  const begin = (m: Mode, e: ReactPointerEvent<HTMLDivElement>) => {
    // PRIMARY button only. A right-click (button 2) must fall through to the context
    // menu — capturing the pointer here would swallow the menu's clicks (the "context
    // Delete does nothing, panel Delete works" bug). Same for middle-click.
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    const clip = clips?.[item.index];
    session.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      origStart: item.startSec,
      origDur: item.durationSec,
      origRealDur: clip ? clip.duration : item.durationSec,
    };
    modeRef.current = m;
    setMode(m);
    setOffsetPx(0);
  };

  // Magnetic snapping: pull the dragged item's start/end to 0, the playhead, or any
  // other item edge within SNAP_PX. Returns the snapped start + the snapped edge.
  const snapStart = (start: number, dur: number): { start: number; edge: number | null } => {
    const thr = pxToSec(SNAP_PX);
    const spec = actions.getSpec();
    const edges: number[] = [0, playheadSec];
    spec.tracks.forEach((t, ti) => {
      if (t.type === 'visual') {
        t.clips.forEach((c, i) => {
          if (ti === item.trackIndex && i === item.index) return;
          edges.push(c.at, c.at + c.duration);
        });
      } else {
        t.items.forEach((it, i) => {
          if (ti === item.trackIndex && i === item.index) return;
          const s = it.at ?? 0;
          edges.push(s, s + (it.out != null ? Math.max(0, it.out - (it.in ?? 0)) : 0));
        });
      }
    });
    let best = start;
    let bestDist = thr;
    let snapEdge: number | null = null;
    for (const edge of edges) {
      if (Math.abs(start - edge) < bestDist) { best = edge; bestDist = Math.abs(start - edge); snapEdge = edge; }
      if (Math.abs(start + dur - edge) < bestDist) { best = edge - dur; bestDist = Math.abs(start + dur - edge); snapEdge = edge; }
    }
    return { start: Math.max(0, best), edge: snapEdge };
  };

  /** Sequential-lane reorder: the boundary (sec) the dragged clip would insert at. */
  const laneInsertSec = (droppedCenter: number): number => {
    if (!clips) return 0;
    const others = layoutLane({ type: 'visual', clips, sequential: true })
      .filter((l) => l.index !== item.index)
      .sort((a, b) => a.startSec - b.startSec);
    let insertSec = 0;
    for (const l of others) if (l.startSec + l.durationSec / 2 < droppedCenter) insertSec = l.endSec;
    return insertSec;
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = modeRef.current;
    if (m === 'idle') return;
    const dSec = pxToSec(e.clientX - session.current.startX);
    const { origStart, origDur, origRealDur } = session.current;

    if (m === 'move') {
      // Ignore sub-threshold travel so a click-to-select doesn't become a move.
      if (!session.current.moved) {
        if (Math.hypot(e.clientX - session.current.startX, e.clientY - session.current.startY) < DRAG_THRESHOLD_PX) return;
        session.current.moved = true;
      }
      autoScrollTimelineEdge(e.clientY); // reach off-screen lanes mid-drag
      const tgt = dnd.resolve(e.clientX, e.clientY);
      const onOtherLane = tgt && tgt.trackIndex !== item.trackIndex && tgt.trackType === 'visual';
      if (sequential && !onOtherLane && !tgt?.newLayer) {
        // Same sequential lane: raw offset, reorder on release; show insertion marker.
        setOffsetPx(e.clientX - session.current.startX);
        dnd.publish({
          source: 'move',
          trackIndex: item.trackIndex,
          kind,
          startSec: origStart + dSec,
          durationSec: origDur,
          snapSec: null,
          insertSec: laneInsertSec(origStart + dSec + origDur / 2),
          dropTrackIndex: null,
          laneInsertIndex: null,
        });
      } else {
        const { start: snapped, edge } = snapStart(origStart + dSec, origDur);
        // Leaving the lane (cross-lane / new layer): keep the source clip PUT (it stays
        // dimmed in place) and let the cursor ghost + landing-rectangle preview carry the
        // destination — translating it sideways in the WRONG lane is the confusing "only
        // moves in the same line" feel. Same free lane → translate live as before.
        const leavingLane = onOtherLane || (isVisual && !!tgt?.newLayer);
        setOffsetPx(leavingLane ? 0 : secToPx(snapped - origStart));
        const clip = clips?.[item.index];
        dnd.publish({
          source: 'move',
          trackIndex: item.trackIndex,
          kind,
          startSec: snapped,
          durationSec: origDur,
          snapSec: edge,
          insertSec: null,
          dropTrackIndex: onOtherLane ? tgt!.trackIndex : null,
          newLayer: isVisual && !!tgt?.newLayer,
          laneInsertIndex: isVisual ? (tgt?.laneInsertIndex ?? null) : null,
          // Cursor ghost (CapCut-style) — only shown while LEAVING the lane.
          ghostX: e.clientX,
          ghostY: e.clientY,
          label: isVisual ? (clip?.media.kind ?? 'clip') : 'audio',
        });
      }
      return;
    }

    if (m === 'trim-start') {
      const newDur = Math.max(MIN_DURATION_S, origRealDur - dSec);
      const applied = origRealDur - newDur;
      scheduleTrim(() => {
        const clip = clips?.[item.index];
        if (isVisual && clip) {
          const patch: Partial<ClipPatch> = { duration: newDur };
          if (!sequential) patch.at = Math.max(0, origStart + applied);
          if (clip.media.kind === 'video') {
            patch.media = { ...clip.media, trimStart: Math.max(0, (clip.media.trimStart ?? 0) + applied) };
          }
          actions.updateClip(item.trackIndex, item.index, patch);
        } else if (!isVisual) {
          actions.updateAudioItem(item.trackIndex, item.index, { at: Math.max(0, origStart + applied) });
        }
      });
      return;
    }

    // trim-end
    const newDur = Math.max(MIN_DURATION_S, origRealDur + dSec);
    scheduleTrim(() => {
      if (isVisual) actions.updateClip(item.trackIndex, item.index, { duration: newDur });
    });
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    if (trimRaf.current != null) {
      cancelAnimationFrame(trimRaf.current);
      flushTrim();
    }
    if (modeRef.current === 'move' && session.current.moved) {
      const dSec = pxToSec(e.clientX - session.current.startX);
      const tgt = dnd.resolve(e.clientX, e.clientY);
      const onOtherLane = tgt && tgt.trackIndex !== item.trackIndex && tgt.trackType === 'visual';
      if (isVisual && tgt?.newLayer) {
        // Drop onto empty space → a brand-new visual lane. The shared lane-math converts
        // the DISPLAY-order drop index (0 = top = FRONT) to a stacking index (+ accounts
        // for the source lane pruning when it held only this clip).
        const spec = actions.getSpec();
        const stack = stackingLaneIndex(spec, tgt.laneInsertIndex ?? 0, item.trackIndex);
        actions.setSpec(withClipMovedToNewLane(spec, item.trackIndex, item.index, stack, tgt.sec));
      } else if (isVisual && onOtherLane) {
        // Move to another existing lane — media.kind untouched.
        actions.setSpec(withClipMovedToLane(actions.getSpec(), item.trackIndex, item.index, tgt!.trackIndex, tgt!.sec));
      } else if (sequential) {
        // Same sequential lane: reorder by where the dragged center landed.
        const droppedCenter = session.current.origStart + dSec + session.current.origDur / 2;
        const layout = layoutLane({ type: 'visual', clips: clips ?? [], sequential: true });
        let target = 0;
        for (const l of layout) {
          if (l.index === item.index) continue;
          if (l.startSec + l.durationSec / 2 < droppedCenter) target++;
        }
        if (target !== item.index) actions.moveClip(item.trackIndex, item.index, target);
      } else {
        // Same free lane: commit the snapped `at`.
        const { start: snapped } = snapStart(session.current.origStart + dSec, session.current.origDur);
        if (isVisual) actions.updateClip(item.trackIndex, item.index, { at: Math.max(0, snapped) });
        else actions.updateAudioItem(item.trackIndex, item.index, { at: Math.max(0, snapped) });
      }
    }
    dnd.publish(null);
    modeRef.current = 'idle';
    setMode('idle');
    setOffsetPx(0);
  };

  const makeHandle = (m: Mode, isHandle: boolean): ClipDragHandle => ({
    onPointerDown: (e) => {
      if (isHandle) e.stopPropagation();
      begin(m, e);
    },
    onPointerMove: (e) => {
      if (isHandle) e.stopPropagation();
      move(e);
    },
    onPointerUp: (e) => {
      if (isHandle) e.stopPropagation();
      end(e);
    },
  });

  return {
    dragging: mode !== 'idle',
    mode,
    offsetPx,
    body: makeHandle('move', false),
    startHandle: makeHandle('trim-start', true),
    endHandle: makeHandle('trim-end', true),
  };
}
