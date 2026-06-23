/**
 * `useTimelineTrackActions` — the ONE behavior primitive for a whole timeline LANE
 * (a track header). The lane-level sibling of {@link useTimelineItemActions}: it
 * derives the capability flags + current state (can-hide / hidden / has-audio /
 * muted) once from the store and exposes the lane commands (hide all / mute all),
 * so the gutter / header renderer is DUMB — it calls these and reads these flags,
 * never re-deriving "is every clip hidden?" or mutating only the head clip.
 *
 * This is exactly the bug that lived in app code before this hook existed: hiding a
 * lane toggled only its FIRST clip. Keeping the lane behavior here (over a many-clip
 * lane) means every consumer is correct by construction.
 */
'use client';

import { useMemo } from 'react';
import { useEditorState, useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';
import { useAnnounce } from '../../../a11y/live-region.js';

export interface TimelineTrackActions {
  /** The track index resolves to a live track (else everything is a no-op). */
  available: boolean;
  isVisual: boolean;
  isAudio: boolean;
  /** A visual lane with ≥1 clip → hide is meaningful. */
  canHide: boolean;
  /** The WHOLE lane is hidden (every clip `hidden`). */
  hidden: boolean;
  /** The lane carries audio (a visual lane with a video clip, or an audio lane). */
  hasAudio: boolean;
  /** The WHOLE lane is muted (every video clip muted / every audio item ≤ −60 dB). */
  muted: boolean;
  /** Hide/show the entire lane (no-op for audio). */
  toggleHide(): void;
  /** Mute/unmute the entire lane (no-op when it has no audio). */
  toggleMute(): void;
}

const MUTE_DB = -60;
const noop = () => {};

export function useTimelineTrackActions(trackIndex: number | null): TimelineTrackActions {
  const spec = useEditorState((s) => s.spec);
  const actions = useEditorActions();
  const announce = useAnnounce();

  return useMemo<TimelineTrackActions>(() => {
    const track = trackIndex == null ? undefined : spec.tracks[trackIndex];
    if (track == null || trackIndex == null) return DISABLED;

    const isVisual = track.type === 'visual';
    const isAudio = track.type === 'audio';
    const visualClips = isVisual ? track.clips : [];
    const videoClips = visualClips.filter((c) => c.media.kind === 'video');
    const audioItems = isAudio ? track.items : [];

    const canHide = isVisual && visualClips.length > 0;
    const hidden = canHide && visualClips.every((c) => c.hidden === true);
    const hasAudio = videoClips.length > 0 || audioItems.length > 0;
    const muted = hasAudio
      ? isVisual
        ? videoClips.every((c) => c.muted === true)
        : audioItems.every((it) => (it.gain ?? 0) <= MUTE_DB)
      : false;

    return {
      available: true,
      isVisual,
      isAudio,
      canHide,
      hidden,
      hasAudio,
      muted,
      toggleHide: () => {
        if (!canHide) return;
        actions.setTrackHidden(trackIndex, !hidden);
        announce(hidden ? 'Layer shown' : 'Layer hidden');
      },
      toggleMute: () => {
        if (!hasAudio) return;
        actions.setTrackMuted(trackIndex, !muted);
        announce(muted ? 'Layer unmuted' : 'Layer muted');
      },
    };
  }, [trackIndex, spec, actions, announce]);
}

const DISABLED: TimelineTrackActions = {
  available: false,
  isVisual: false,
  isAudio: false,
  canHide: false,
  hidden: false,
  hasAudio: false,
  muted: false,
  toggleHide: noop,
  toggleMute: noop,
};
