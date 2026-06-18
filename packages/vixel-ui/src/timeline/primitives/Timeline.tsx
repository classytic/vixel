/**
 * `<Timeline>` — the scrollable track area. Measures its own width, computes
 * geometry from the editor's zoom (`pxPerSec`) + duration, and provides both via
 * {@link TimelineContext}. Children may be a render-function receiving the
 * derived {@link TrackView}[].
 *
 * @example
 * ```tsx
 * <Timeline className="relative h-40">
 *   {(tracks) => tracks.map((t) => <TimelineTrack key={t.index} track={t}>{…}</TimelineTrack>)}
 * </Timeline>
 * ```
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { TimelineContext, type TimelineGeometry } from '../controller/context/TimelineContext.js';
import { useTimelineTracks } from '../controller/hooks/useTimeline.js';
import { useEditorState, useShallowEditorState } from '../../editor/controller/hooks/useEditorStore.js';
import { useTimelineDnd } from '../controller/DndContext.js';
import { layoutLane, laneSeams } from '../../shared/utils/spec.js';
import type { TrackView } from '../types.js';

const SNAP_SEC_PX = 8; // snap threshold for drag-to-insert
const SEAM_PX = 14; // how close to a clip boundary counts as "on the seam"

export interface TimelineProps extends Omit<ComponentProps<'div'>, 'children'> {
  children?: ReactNode | ((tracks: TrackView[]) => ReactNode);
}

export function Timeline({ children, className, style, ...props }: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const dnd = useTimelineDnd();

  const { pxPerSec, durationSec } = useShallowEditorState((s) => ({
    pxPerSec: s.pxPerSec,
    durationSec: s.durationSec,
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidthPx(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo<TimelineGeometry>(
    () => ({
      pxPerSec,
      durationSec,
      widthPx,
      secToPx: (sec) => sec * pxPerSec,
      pxToSec: (px) => px / pxPerSec,
      clientXToSec: (clientX) => {
        const el = ref.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        // Subtract the scroll container's left padding: a host can pad the lane area
        // (a leading gutter so the playhead/clips don't hug the edge), and absolute
        // children position from that padded content box — so seek must too, else a
        // click lands `paddingLeft` px later than where it visually points.
        const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
        const x = clientX - rect.left - padLeft + el.scrollLeft;
        return x / pxPerSec;
      },
    }),
    [pxPerSec, durationSec, widthPx],
  );

  // Live refs so the (stable) drop resolver always reads current geometry + spec.
  const spec = useEditorState((s) => s.spec);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const geomRef = useRef(geometry);
  geomRef.current = geometry;
  const specRef = useRef(spec);
  specRef.current = spec;
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;

  // Register the panel→timeline drop resolver while mounted: map a viewport point
  // to a target lane + snapped time (+ base-track insertion index / nearest seam).
  useEffect(() => {
    dnd.registerResolver((clientX, clientY) => {
      if (typeof document === 'undefined') return null;
      // elementsFromPoint (stacked), not elementFromPoint: at a seam the seam-marker
      // button (a sibling of the track) sits on top, and over a clip the playhead /
      // indicators may too — walk the stack to the actual track lane underneath.
      let el: Element | null = null;
      let overTimeline = false;
      for (const cand of document.elementsFromPoint(clientX, clientY)) {
        if (!el) { const t = cand.closest('[data-vixel-track]'); if (t) el = t; }
        if (cand.closest('[data-vixel-timeline]')) overTimeline = true;
      }
      // Off the timeline entirely → no drop.
      if (!el && !overTimeline) return null;

      const g = geomRef.current;
      const s = specRef.current;
      const rawSec = Math.max(0, g.clientXToSec(clientX));

      // Magnetic snap to 0 / playhead / any clip edge.
      const thr = g.pxToSec(SNAP_SEC_PX);
      const edges: number[] = [0, playheadRef.current];
      s.tracks.forEach((t) => {
        if (t.type === 'visual') for (const l of layoutLane(t)) edges.push(l.startSec, l.endSec);
        else t.items.forEach((it) => { const a = it.at ?? 0; edges.push(a, a + (it.out != null ? Math.max(0, it.out - (it.in ?? 0)) : 0)); });
      });
      let sec = rawSec;
      let snapSec: number | null = null;
      let bestDist = thr;
      for (const e of edges) { const d = Math.abs(rawSec - e); if (d < bestDist) { bestDist = d; sec = e; snapSec = e; } }

      // Vertical lane-insertion index among the VISUAL lanes (0 = above the top lane,
      // N = below the bottom) — the cursor's position between lane midpoints. This is
      // what powers the moving insertion line + "drop here = a new Nth lane".
      const laneMids = Array.from(document.querySelectorAll('[data-vixel-track][data-track-type="visual"]'))
        .map((e) => e.getBoundingClientRect())
        .sort((a, b) => a.top - b.top)
        .map((r) => r.top + r.height / 2);
      let laneInsertIndex = laneMids.length;
      for (let i = 0; i < laneMids.length; i++) {
        if (clientY < laneMids[i]) { laneInsertIndex = i; break; }
      }

      const ti = el ? Number(el.getAttribute('data-track-index')) : NaN;
      const trackType = el ? (el.getAttribute('data-track-type') as 'visual' | 'audio' | null) : null;

      // Over the timeline but not on a lane → NEW LANE (the dropped item gets its own
      // visual lane). This is what makes dragging into the empty area "just work".
      if (!el || !Number.isFinite(ti) || !trackType) {
        return { trackIndex: -1, trackType: null, sequential: false, sec, snapSec, insertIndex: null, insertSec: null, seamGap: null, newLayer: true, laneInsertIndex };
      }

      let insertIndex: number | null = null;
      let insertSec: number | null = null;
      let seamGap: number | null = null;
      const track = s.tracks[ti];
      const sequential = track?.type === 'visual' && !!track.sequential;
      if (trackType === 'visual' && track?.type === 'visual') {
        const layout = layoutLane(track).sort((a, b) => a.startSec - b.startSec);
        let idx = 0;
        insertSec = 0;
        for (const l of layout) if (l.startSec + l.durationSec / 2 < sec) { idx++; insertSec = l.endSec; }
        insertIndex = idx;
        // Seams a transition can land on — the SAME adjacency-based model the transition
        // primitive draws (`laneSeams`), so ANY visual lane with two touching clips is a
        // valid drop target, not only the sequential main track. The visible cut is the
        // next clip's start (`seam.seamSec`), which already accounts for an existing
        // transition's overlap, so a seam that ALREADY has a transition stays detectable
        // (you can drop a replacement onto it).
        const seamThr = g.pxToSec(SEAM_PX);
        for (const seam of laneSeams(track)) {
          if (Math.abs(rawSec - seam.seamSec) < seamThr) { seamGap = seam.gap; break; }
        }
      }
      return { trackIndex: ti, trackType, sequential, sec, snapSec, insertIndex, insertSec, seamGap, newLayer: false, laneInsertIndex };
    });
    return () => dnd.registerResolver(null);
  }, [dnd]);

  const tracks = useTimelineTracks();
  const content = typeof children === 'function' ? children(tracks) : children;

  return (
    <TimelineContext.Provider value={geometry}>
      <div
        ref={ref}
        className={className}
        data-vixel-timeline=""
        data-duration={durationSec}
        style={{ position: 'relative', overflowX: 'auto', ...style }}
        {...props}
      >
        {content}
      </div>
    </TimelineContext.Provider>
  );
}
