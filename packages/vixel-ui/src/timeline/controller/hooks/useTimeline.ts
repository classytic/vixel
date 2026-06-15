/**
 * Timeline hooks — geometry access + spec→rows derivation.
 */
'use client';

import { use } from 'react';
import { TimelineContext, type TimelineGeometry } from '../context/TimelineContext.js';
import { useEditorState } from '../../../editor/controller/hooks/useEditorStore.js';
import {
  isVideoTrack,
  isOverlayTrack,
  isAudioTrack,
  layoutVideoTrack,
} from '../../../shared/utils/spec.js';
import type { TrackView, TimelineItem } from '../../types.js';

/** Access the timeline geometry (must be inside a {@link Timeline}). */
export function useTimelineGeometry(): TimelineGeometry {
  const geometry = use(TimelineContext);
  if (!geometry) throw new Error('useTimelineGeometry must be used within a <Timeline>');
  return geometry;
}

/** Derive renderable rows (tracks + laid-out items) from the current spec. */
export function useTimelineTracks(): TrackView[] {
  const tracks = useEditorState((s) => s.spec.tracks);

  return tracks.map((track, trackIndex): TrackView => {
    if (isVideoTrack(track)) {
      const items: TimelineItem[] = layoutVideoTrack(track).map((l) => ({
        selectionKind: 'clip',
        trackIndex,
        index: l.index,
        startSec: l.startSec,
        durationSec: l.durationSec,
        endSec: l.endSec,
      }));
      return { index: trackIndex, type: 'video', items };
    }

    if (isOverlayTrack(track)) {
      const items: TimelineItem[] = track.items.map((it, index) => ({
        selectionKind: 'overlay',
        trackIndex,
        index,
        startSec: it.at,
        durationSec: it.duration,
        endSec: it.at + it.duration,
      }));
      return { index: trackIndex, type: 'overlay', items };
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
      return { index: trackIndex, type: 'audio', items };
    }

    return { index: trackIndex, type: (track as { type: TrackView['type'] }).type, items: [] };
  });
}
