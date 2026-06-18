/**
 * `useTimelineItemActions` — the ONE behavior primitive for a timeline item.
 * ===========================================================================
 * Every per-item command (select / split / duplicate / hide / mute / delete) plus
 * the capability flags that gate them live HERE, derived once from the store. The
 * renderers — the right-click {@link ClipMenu}, the toolbar, a keyboard handler —
 * are then DUMB: they call these methods and read these flags, never re-deriving
 * "is this a clip or audio? can it split? is it muted?". This is the Base-UI-style
 * split (behavior in a hook, presentation in the consumer) and it stops the three
 * copies of delete/duplicate/split from drifting apart.
 *
 * Pass `null` (nothing selected) and everything is a safe no-op with `available`
 * false, so a toolbar can bind the buttons unconditionally and just disable them.
 */
'use client';

import { useMemo } from 'react';
import type { SelectionKind } from '../../../types.js';
import { useEditorState, useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';
import { useAnnounce } from '../../../a11y/live-region.js';
import { useTimelineTracks } from './useTimeline.js';
import type { TimelineItem } from '../../types.js';

/** What identifies the item to act on — the shape both a {@link TimelineItem}
 *  (`selectionKind`/`index`) and a `SelectionRef` (`kind`/`itemIndex`) adapt to. */
export interface ItemActionTarget {
  kind: SelectionKind;
  trackIndex: number;
  itemIndex: number;
}

export interface TimelineItemActions {
  /** The item resolves to a live clip / audio item (else everything is a no-op). */
  available: boolean;
  isClip: boolean;
  isAudio: boolean;
  /** Visual clip currently hidden (`clip.hidden`). */
  hidden: boolean;
  /** Has a mutable audio gain (a video clip's track or an audio item). */
  hasAudio: boolean;
  /** Currently muted (video `muted` flag, or audio gain ≤ −60 dB). */
  muted: boolean;
  /** The playhead sits strictly inside the item → a split is meaningful. */
  canSplit: boolean;
  select(): void;
  /** Split at the playhead (no-op unless {@link canSplit}). */
  split(): void;
  /** Duplicate the clip in place / clone the audio item just after it. */
  duplicate(): void;
  /** Toggle a visual clip's hidden flag (no-op for audio). */
  toggleHide(): void;
  /** Toggle mute for a video clip's track or an audio item (no-op otherwise). */
  toggleMute(): void;
  /** Remove the clip / audio item (the lane auto-prunes if it empties). */
  remove(): void;
  /** Keyboard MOVE: reorder on a sequential lane, or nudge `at` (free lane / audio)
   *  by one step, in the `dir` direction. Announced for assistive tech. */
  nudge(dir: -1 | 1): void;
}

const MUTE_DB = -60;
const NUDGE_STEP_SEC = 0.1;
const noop = () => {};

export function useTimelineItemActions(target: ItemActionTarget | null): TimelineItemActions {
  const spec = useEditorState((s) => s.spec);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const actions = useEditorActions();
  const announce = useAnnounce();
  const tracks = useTimelineTracks();

  return useMemo<TimelineItemActions>(() => {
    if (!target) return DISABLED;
    const { kind, trackIndex, itemIndex } = target;

    // Canonical display geometry (start/end) — the same rows the timeline renders,
    // so `canSplit` matches what the user sees (butt-joined sequential widths).
    const item: TimelineItem | undefined = tracks
      .flatMap((t) => t.items)
      .find((it) => it.selectionKind === kind && it.trackIndex === trackIndex && it.index === itemIndex);

    const track = spec.tracks[trackIndex];
    const clip = kind === 'clip' && track?.type === 'visual' ? track.clips[itemIndex] : undefined;
    const audioItem = kind === 'audio' && track?.type === 'audio' ? track.items[itemIndex] : undefined;
    if (!item || (!clip && !audioItem)) return DISABLED;

    const isClip = !!clip;
    const clipVideo = clip?.media.kind === 'video' ? clip : undefined;
    const hidden = clip?.hidden === true;
    const hasAudio = !!clipVideo || !!audioItem;
    const muted = clipVideo
      ? clipVideo.muted === true
      : audioItem
        ? (audioItem.gain ?? 0) <= MUTE_DB
        : false;
    const canSplit = isClip && playheadSec > item.startSec + 0.05 && playheadSec < item.endSec - 0.05;
    const sequential = track?.type === 'visual' && !!track.sequential;
    const laneLen = track?.type === 'visual' ? track.clips.length : track?.type === 'audio' ? track.items.length : 0;

    const select = () => actions.select({ kind, trackIndex, itemIndex });

    return {
      available: true,
      isClip,
      isAudio: !!audioItem,
      hidden,
      hasAudio,
      muted,
      canSplit,
      select,
      split: () => {
        if (canSplit) {
          actions.splitClip(trackIndex, itemIndex, playheadSec - item.startSec);
          announce('Clip split at playhead');
        }
      },
      duplicate: () => {
        if (clip) actions.duplicateClip(trackIndex, itemIndex);
        else if (audioItem) actions.addAudioItem({ ...audioItem, at: (audioItem.at ?? 0) + 0.3 });
        announce('Duplicated');
      },
      toggleHide: () => {
        if (clip) {
          actions.updateClip(trackIndex, itemIndex, { hidden: !hidden });
          announce(hidden ? 'Shown' : 'Hidden');
        }
      },
      toggleMute: () => {
        if (clipVideo) actions.updateClip(trackIndex, itemIndex, { muted: !muted });
        else if (audioItem) {
          const meta = (audioItem.metadata ?? {}) as Record<string, unknown>;
          actions.updateAudioItem(
            trackIndex,
            itemIndex,
            muted
              ? { gain: typeof meta._preMuteGain === 'number' ? (meta._preMuteGain as number) : 0 }
              : { gain: MUTE_DB, metadata: { ...meta, _preMuteGain: audioItem.gain ?? 0 } },
          );
        }
        if (hasAudio) announce(muted ? 'Unmuted' : 'Muted');
      },
      remove: () => {
        if (clip) actions.removeClip(trackIndex, itemIndex);
        else if (audioItem) actions.removeAudioItem(trackIndex, itemIndex);
        announce('Deleted');
      },
      nudge: (dir) => {
        if (sequential && clip) {
          const to = Math.max(0, Math.min(laneLen - 1, itemIndex + dir));
          if (to === itemIndex) return;
          actions.moveClip(trackIndex, itemIndex, to);
          announce(`Moved to position ${to + 1} of ${laneLen}`);
        } else {
          const cur = clip ? clip.at : (audioItem?.at ?? 0);
          const at = Math.max(0, cur + dir * NUDGE_STEP_SEC);
          if (clip) actions.updateClip(trackIndex, itemIndex, { at });
          else if (audioItem) actions.updateAudioItem(trackIndex, itemIndex, { at });
          announce(`Moved to ${at.toFixed(1)} seconds`);
        }
      },
    };
  }, [target, tracks, spec, playheadSec, actions, announce]);
}

const DISABLED: TimelineItemActions = {
  available: false,
  isClip: false,
  isAudio: false,
  hidden: false,
  hasAudio: false,
  muted: false,
  canSplit: false,
  select: noop,
  split: noop,
  duplicate: noop,
  toggleHide: noop,
  toggleMute: noop,
  remove: noop,
  nudge: noop,
};
