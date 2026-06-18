/**
 * Timeline hooks — geometry access + spec→rows derivation.
 */
'use client';

import { use } from 'react';
import { TimelineContext, type TimelineGeometry } from '../context/TimelineContext.js';
import { useEditorState } from '../../../editor/controller/hooks/useEditorStore.js';
import { isVisualTrack, isAudioTrack, layoutLane } from '../../../shared/utils/spec.js';
import type { TrackView, TimelineItem } from '../../types.js';

/** Access the timeline geometry (must be inside a {@link Timeline}). */
export function useTimelineGeometry(): TimelineGeometry {
  const geometry = use(TimelineContext);
  if (!geometry) throw new Error('useTimelineGeometry must be used within a <Timeline>');
  return geometry;
}

/**
 * Greedy interval partitioning — pack items into the fewest lanes such that no
 * two items in a lane overlap in time. Used for audio (a track may carry several
 * overlapping items); visual lanes are kept 1:1 with their spec track.
 */
function packLanes(items: TimelineItem[]): TimelineItem[][] {
  const lanes: TimelineItem[][] = [];
  for (const it of [...items].sort((a, b) => a.startSec - b.startSec)) {
    const lane = lanes.find((l) => it.startSec >= l[l.length - 1]!.endSec - 1e-3);
    if (lane) lane.push(it);
    else lanes.push([it]);
  }
  return lanes;
}

/**
 * Derive renderable rows from the current spec. Each VISUAL track is one lane (a
 * row) — lanes ARE tracks now, so a clip's row is its lane, full stop. A
 * sequential ("main") lane butt-joins its clips' displayed widths (a transition
 * makes the next clip start before this one ends; we shrink the display so blocks
 * sit edge-to-edge and the transition shows as a seam badge — the REAL duration
 * stays in the spec). Audio tracks are lane-packed so overlapping items get rows.
 */
export function useTimelineTracks(): TrackView[] {
  const tracks = useEditorState((s) => s.spec.tracks);

  const rows = tracks.flatMap((track, trackIndex): TrackView[] => {
    if (isVisualTrack(track)) {
      const layout = layoutLane(track);
      const items: TimelineItem[] = layout.map((l, i) => {
        const next = track.sequential ? layout[i + 1] : undefined;
        const displaySec = next ? Math.max(0.05, next.startSec - l.startSec) : l.durationSec;
        return {
          selectionKind: 'clip',
          trackIndex,
          index: l.index,
          mediaKind: l.clip.media.kind,
          startSec: l.startSec,
          durationSec: displaySec,
          endSec: l.startSec + displaySec,
        };
      });
      return [{ index: trackIndex, lane: 0, type: 'visual', sequential: track.sequential, items }];
    }

    if (isAudioTrack(track)) {
      const items: TimelineItem[] = track.items.map((it, index) => {
        const startSec = it.at ?? 0;
        const durationSec = it.out != null ? Math.max(0, it.out - (it.in ?? 0)) : 0;
        return {
          selectionKind: 'audio',
          trackIndex,
          index,
          startSec,
          durationSec,
          endSec: startSec + durationSec,
        };
      });
      return packLanes(items).map((laneItems, lane) => ({
        index: trackIndex,
        lane,
        type: 'audio',
        items: laneItems,
      }));
    }

    return [{ index: trackIndex, lane: 0, type: (track as { type: TrackView['type'] }).type, items: [] }];
  });

  // Order rows top→bottom = FRONT→BACK, matching the renderer's compositing: lanes
  // composite in tracks[] order (index 0 = back/background), so the TOP timeline row
  // is the FRONT-most (highest-index) visual lane and the base/main lane sits at the
  // bottom of the visual stack. Audio rows go last. Stable within each group.
  const visual = rows.filter((r) => r.type === 'visual').sort((a, b) => b.index - a.index);
  const audio = rows.filter((r) => r.type === 'audio');
  const other = rows.filter((r) => r.type !== 'visual' && r.type !== 'audio');
  return [...visual, ...other, ...audio];
}
