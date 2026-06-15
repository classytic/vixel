/**
 * Clip drag interactions — move + trim, via Pointer Events with capture.
 * =======================================================
 * Behavior depends on the item kind:
 *  - **video clip** (auto-sequenced): body drag = REORDER (applied on drop;
 *    a visual offset shows during the drag); trim handles adjust `in`/`duration`.
 *  - **overlay** (free-positioned): body drag = reposition `at` live; trim
 *    handles adjust `at`/`duration`.
 *  - **audio**: body drag = reposition `at` live (no trim handles).
 *
 * Standard pointer-capture pattern (per modern-web-guidance): one element owns
 * the gesture for its full lifetime; `touch-action:none` on the targets.
 */
'use client';

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTimelineGeometry } from './useTimeline.js';
import { useEditorActions, useEditorState } from '../../../editor/controller/hooks/useEditorStore.js';
import { layoutVideoTrack } from '../../../shared/utils/spec.js';
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
  /** Visual x-offset (px) to apply while reordering a video clip. */
  offsetPx: number;
  /** Handlers for the clip body (move / reorder). */
  body: ClipDragHandle;
  /** Handlers for the left trim handle. */
  startHandle: ClipDragHandle;
  /** Handlers for the right trim handle. */
  endHandle: ClipDragHandle;
}

export function useClipDrag(item: TimelineItem): UseClipDrag {
  const { pxToSec } = useTimelineGeometry();
  const actions = useEditorActions();

  // Sibling clips when this item is on a video track (for reorder); else null.
  const clips = useEditorState((s) => {
    const t = s.spec.tracks[item.trackIndex];
    return t && t.type === 'video' ? t.clips : null;
  });

  const [mode, setMode] = useState<Mode>('idle');
  const [offsetPx, setOffsetPx] = useState(0);
  const modeRef = useRef<Mode>('idle');
  const session = useRef({ startX: 0, origStart: 0, origDur: 0, origIn: 0 });

  const begin = (m: Mode, e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer (e.g. synthetic) — capture is best-effort */
    }
    session.current = {
      startX: e.clientX,
      origStart: item.startSec,
      origDur: item.durationSec,
      origIn: clips?.[item.index]?.in ?? 0,
    };
    modeRef.current = m;
    setMode(m);
    setOffsetPx(0);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = modeRef.current;
    if (m === 'idle') return;
    const dSec = pxToSec(e.clientX - session.current.startX);
    const { origStart, origDur, origIn } = session.current;

    if (m === 'move') {
      if (clips) {
        setOffsetPx(e.clientX - session.current.startX); // visual only; reorder on up
      } else {
        actions.updateTrackItem(item.trackIndex, item.index, { at: Math.max(0, origStart + dSec) });
      }
      return;
    }

    if (m === 'trim-start') {
      const newDur = Math.max(MIN_DURATION_S, origDur - dSec);
      const applied = origDur - newDur;
      if (clips) {
        actions.updateClip(item.trackIndex, item.index, {
          in: Math.max(0, origIn + applied),
          duration: newDur,
        });
      } else {
        actions.updateTrackItem(item.trackIndex, item.index, {
          at: Math.max(0, origStart + applied),
          duration: newDur,
        });
      }
      return;
    }

    // trim-end
    const newDur = Math.max(MIN_DURATION_S, origDur + dSec);
    if (clips) actions.updateClip(item.trackIndex, item.index, { duration: newDur });
    else actions.updateTrackItem(item.trackIndex, item.index, { duration: newDur });
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* best-effort */
    }
    if (modeRef.current === 'move' && clips) {
      const dSec = pxToSec(e.clientX - session.current.startX);
      const droppedCenter = session.current.origStart + dSec + session.current.origDur / 2;
      const layout = layoutVideoTrack({ type: 'video', clips });
      let target = 0;
      for (const l of layout) {
        if (l.index === item.index) continue;
        if (l.startSec + l.durationSec / 2 < droppedCenter) target++;
      }
      if (target !== item.index) actions.moveClip(item.trackIndex, item.index, target);
    }
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
