/**
 * `<TimelineTransitions>` — the CapCut/Premiere-style transition layer for a visual
 * lane. A transition SITS ON the seam between two ADJACENT clips (any lane, not just
 * the sequential main track — see {@link laneSeams}); its on-timeline width represents
 * the overlap `duration`, centered on the cut, and dragging EITHER edge scales that
 * duration (symmetrically, so it stays centered on the seam — the "grab an end and
 * distribute time" gesture). Tapping a seam selects it (the inspector/Transitions
 * panel then picks or tunes the transition).
 *
 * Headless, like {@link TimelineClip}: this primitive owns positioning + the
 * resize/select interaction and exposes state via `data-*` (`data-selected`,
 * `data-empty`, `data-dragging`) + a render-prop, while the visible skin (badge,
 * icon, handle bars) is the consumer's `className`/`handleClassName`/`children`.
 *
 * The overlap math (a transition pulls the next clip — and everything after —
 * earlier by `duration`, shortening the timeline) lives in `reflowSequential`;
 * here we only read the laid-out geometry and write `duration` back via
 * `setTransition`. Max overlap is bounded by the shorter adjacent clip.
 */
'use client';

import { useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { TransitionRef } from '@classytic/vixel-schema';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';
import { isVisualTrack, laneSeams, MIN_TRANSITION_DURATION } from '../../shared/utils/spec.js';
import type { TrackView } from '../types.js';

/** Smallest visible width (px) for a seam, so an empty/very-short one stays grabbable. */
const MIN_WIDTH_PX = 16;
const MIN_DURATION = MIN_TRANSITION_DURATION;
const DRAG_THRESHOLD_PX = 4;

export interface SeamState {
  /** Index into `spec.tracks` of the lane this seam belongs to. */
  trackIndex: number;
  /** The lower clip index of the gap (`between: [gap, gap + 1]`). */
  gap: number;
  selected: boolean;
  dragging: boolean;
  /** No transition placed yet — render an "add" affordance. */
  empty: boolean;
  transition: TransitionRef | null;
}

export interface TimelineTransitionsProps {
  /** The lane to draw seams for — any visual lane with adjacent clips (see {@link laneSeams}). */
  track: TrackView;
  /** Class applied to each seam's root element (carries the `data-*` state). */
  className?: string;
  /** Class applied to BOTH resize handles (`data-resize="start|end"`). */
  handleClassName?: string;
  /**
   * Class on the OUTER overlay container — the place to declare theming CSS vars
   * (e.g. an accent the seam skin reads) so every seam inherits them.
   */
  containerClassName?: string;
  /**
   * Style on the OUTER overlay container — the idiomatic theming hook: set CSS
   * custom properties here (e.g. `{ ['--vixel-transition']: 'var(--brand)' }`) and
   * the seam skin's classes inherit them. Merged after the primitive's own layout
   * style (it can't override `position`/`inset`/`pointerEvents`).
   */
  style?: CSSProperties;
  /** Skin: a node, or a render-prop receiving the seam's live {@link SeamState}. */
  children?: ReactNode | ((state: SeamState) => ReactNode);
}

interface SeamGeom {
  gap: number;
  /** Display seam position (s) — where the two clips butt-join on the timeline. */
  seamSec: number;
  /** Largest overlap (s) this gap allows, bounded by the shorter adjacent clip. */
  maxDuration: number;
  transition: TransitionRef | null;
}

const HANDLE_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 10,
  cursor: 'ew-resize',
  touchAction: 'none',
  pointerEvents: 'auto', // the root is pointer-events:none; handles opt back in
  zIndex: 1,
};

export function TimelineTransitions({ track, className, handleClassName, containerClassName, style, children }: TimelineTransitionsProps) {
  // Select the STABLE track ref (changes identity only when this lane changes), then
  // derive seam geometry in a memo — a selector that returned a fresh array would
  // churn the useSyncExternalStore snapshot and loop.
  const specTrack = useEditorState((s) => s.spec.tracks[track.index]);
  const seams = useMemo<SeamGeom[]>(() => {
    if (!specTrack || !isVisualTrack(specTrack)) return EMPTY;
    // ONE shared seam model (adjacency-based) — identical to what the drop resolver uses.
    return laneSeams(specTrack).map((s) => ({
      gap: s.gap,
      seamSec: s.seamSec,
      maxDuration: s.maxDuration,
      transition: s.transition ?? null,
    }));
  }, [specTrack]);

  if (seams.length === 0) return null;

  return (
    <div
      className={containerClassName ? `vixel-transitions ${containerClassName}` : 'vixel-transitions'}
      style={{ ...style, position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {seams.map((seam) => (
        <Seam
          key={seam.gap}
          trackIndex={track.index}
          seam={seam}
          className={className}
          handleClassName={handleClassName}
        >
          {children}
        </Seam>
      ))}
    </div>
  );
}

const EMPTY: SeamGeom[] = [];

function Seam({
  trackIndex,
  seam,
  className,
  handleClassName,
  children,
}: {
  trackIndex: number;
  seam: SeamGeom;
  className?: string;
  handleClassName?: string;
  children?: ReactNode | ((state: SeamState) => ReactNode);
}) {
  const { secToPx, pxToSec } = useTimelineGeometry();
  const actions = useEditorActions();
  const selected = useEditorState(
    (s) => s.selectedSeam?.trackIndex === trackIndex && s.selectedSeam.gap === seam.gap,
  );
  const drag = useRef<{ startX: number; startDur: number; edge: 'start' | 'end'; moved: boolean } | null>(null);
  const dragging = useRef(false);
  // A transient render trigger for the drag flag — kept out of the store (it's
  // pure UI state, not document state) so a resize doesn't churn the spec history.
  const [, bump] = useState(0);
  const forceRender = useCallback(() => bump((n) => n + 1), []);

  const { transition, maxDuration, seamSec, gap } = seam;
  const empty = !transition;

  // Unselected → a compact badge sitting ON the cut (doesn't dominate the clips,
  // keeps trim handles clear). Selected → expand to the overlap WIDTH so the span is
  // visible and the edge handles land inside the clips, away from the trim edges.
  const durPx = transition ? secToPx(transition.duration) : 0;
  const width = selected ? Math.max(MIN_WIDTH_PX, durPx) : MIN_WIDTH_PX;
  const left = secToPx(seamSec) - width / 2;

  const onHandleDown = useCallback(
    (edge: 'start' | 'end') => (e: ReactPointerEvent<HTMLElement>) => {
      if (!transition) return;
      e.stopPropagation();
      e.preventDefault();
      drag.current = { startX: e.clientX, startDur: transition.duration, edge, moved: false };

      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const dxSec = pxToSec(ev.clientX - d.startX);
        if (!d.moved && Math.abs(ev.clientX - d.startX) < DRAG_THRESHOLD_PX) return;
        if (!d.moved) {
          d.moved = true;
          dragging.current = true;
          forceRender();
        }
        // Symmetric scale about the seam: dragging the END edge outward (right, +dx)
        // OR the START edge outward (left, −dx) both LENGTHEN the transition.
        const delta = d.edge === 'end' ? dxSec : -dxSec;
        const next = Math.max(MIN_DURATION, Math.min(maxDuration, d.startDur + delta * 2));
        actions.setTransition(trackIndex, gap, { ...transition, duration: next });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const wasDrag = drag.current?.moved;
        drag.current = null;
        if (dragging.current) {
          dragging.current = false;
          forceRender();
        }
        if (!wasDrag) actions.selectSeam({ trackIndex, gap }); // a tap on the handle = select
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [transition, maxDuration, pxToSec, actions, trackIndex, gap, forceRender],
  );

  const state: SeamState = { trackIndex, gap, selected, dragging: dragging.current, empty, transition };
  const content = typeof children === 'function' ? children(state) : children;

  const select = useCallback(() => actions.selectSeam({ trackIndex, gap }), [actions, trackIndex, gap]);

  return (
    // ROOT spans the overlap (so the badge sits ON the cut) but is pointer-events:NONE
    // so it NEVER blankets the adjacent clips' trim handles — only the small centered
    // core (always) and the resize handles (once selected) opt back into hit-testing.
    // This is why a clip stays trimmable right up to the seam, CapCut-style.
    <div
      data-vixel-transition=""
      data-selected={selected || undefined}
      data-empty={empty || undefined}
      data-dragging={dragging.current || undefined}
      className={className}
      style={{
        position: 'absolute',
        left,
        width,
        top: 0,
        bottom: 0,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: selected ? 21 : 20,
      }}
    >
      {selected && !empty && (
        <div data-resize="start" aria-hidden="true" className={handleClassName} style={{ ...HANDLE_STYLE, left: 0 }} onPointerDown={onHandleDown('start')} />
      )}
      {/* The only always-interactive target: a compact, content-sized badge centered
          on the cut. Small + auto-height, so the full-height clip trim handles stay
          grabbable above and below it. */}
      <div
        data-vixel-transition-core=""
        role="button"
        tabIndex={0}
        aria-label={transition ? `Transition between clip ${gap + 1} and ${gap + 2}` : `Add transition after clip ${gap + 1}`}
        style={{ pointerEvents: 'auto', cursor: 'pointer', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select();
          } else if (transition && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            actions.setTransition(trackIndex, gap, null);
          }
        }}
      >
        {content}
      </div>
      {selected && !empty && (
        <div data-resize="end" aria-hidden="true" className={handleClassName} style={{ ...HANDLE_STYLE, right: 0 }} onPointerDown={onHandleDown('end')} />
      )}
    </div>
  );
}
