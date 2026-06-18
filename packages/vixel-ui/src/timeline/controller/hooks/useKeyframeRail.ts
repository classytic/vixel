/**
 * `useKeyframeRail` — the BEHAVIOR primitive behind {@link KeyframeRail}: it turns a
 * clip's keyframes into a draggable, seekable, deletable set of ◆ markers on the
 * timeline (the CapCut/Premiere interaction the display-only diamonds were missing).
 *
 * It is the composable core — `<KeyframeRail>` is just a default skin over it, and a
 * host can call this hook directly to render its own markers. All the timeline-specific
 * wiring (geometry px↔sec, the editor store, dispatching the right patch for a visual
 * clip vs. an audio item) lives here; the pure retime/remove MATH lives in
 * `@classytic/vixel-schema` (`moveKeyframeTime`/`removeKeyframeTime`), unit-tested there.
 */
'use client';

import { useCallback, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { VisualClip, AudioItem, KeyframeChannels } from '@classytic/vixel-schema';
import {
  channelKeyframeTimes,
  moveKeyframeTime,
  removeKeyframeTime,
  nearestKeyframeTime,
  transformToChannels,
  channelsToTransform,
} from '@classytic/vixel-schema';
import { useTimelineGeometry } from './useTimeline.js';
import { useEditorState, useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';
import type { TimelineItem } from '../../types.js';

const DRAG_THRESHOLD_PX = 4;
const EPS = 1e-4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Per-marker render state (drives styling + the default ◆ skin). */
export interface KeyframeMarkerState {
  /** Clip-local time (seconds) of this keyframe. */
  t: number;
  /** Under (or nearest, within snap) the playhead → highlight. */
  active: boolean;
  /** This marker is being dragged right now. */
  dragging: boolean;
}

/** Everything a marker element needs — spread onto the ◆: positioning + interaction. */
export interface KeyframeMarkerBinding {
  key: number;
  state: KeyframeMarkerState;
  /** `left: %` so markers track the clip width at any zoom. */
  leftPct: number;
  /** Pointer/keyboard/mouse handlers: drag-to-retime, click-to-seek, dbl/alt-click-to-remove. */
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onDoubleClick: (e: ReactMouseEvent) => void;
    onKeyDown: (e: ReactKeyboardEvent) => void;
  };
}

export interface UseKeyframeRail {
  /** Whether this clip is keyframable (false ⇒ render nothing). */
  enabled: boolean;
  /** Distinct keyframe times, sorted — one ◆ each. */
  times: number[];
  /** Clip on-screen duration (seconds) — the rail's denominator. */
  durationSec: number;
  /** Bindings to render the default or a custom marker per time. */
  markers: KeyframeMarkerBinding[];
}

function clipChannels(item: TimelineItem, clip: VisualClip | AudioItem): KeyframeChannels {
  return item.selectionKind === 'audio'
    ? { gain: (clip as AudioItem).gainKeyframes }
    : transformToChannels((clip as VisualClip).transform?.keyframes);
}

export function useKeyframeRail(item: TimelineItem): UseKeyframeRail {
  const { pxToSec } = useTimelineGeometry();
  const actions = useEditorActions();
  const playheadSec = useEditorState((s) => s.playheadSec);

  // The live clip (identity changes only when it's edited → cheap re-renders).
  const clip = useEditorState((s) => {
    const track = s.spec.tracks[item.trackIndex];
    if (!track) return undefined;
    return track.type === 'visual' ? track.clips[item.index] : track.items[item.index];
  }) as VisualClip | AudioItem | undefined;

  const audio = item.selectionKind === 'audio';
  const clipAt = clip?.at ?? 0;
  const durationSec = !clip
    ? 0
    : audio
      ? Math.max(0, ((clip as AudioItem).out ?? 0) - ((clip as AudioItem).in ?? 0))
      : (clip as VisualClip).duration;

  const channels = useMemo(() => (clip ? clipChannels(item, clip) : {}), [clip, item]);
  const times = useMemo(() => channelKeyframeTimes(channels), [channels]);

  // Persist an edited channel map back to the spec via the right typed action. Reads
  // the FRESH clip each call (so a live drag composes correctly across moves).
  const commit = useCallback(
    (next: KeyframeChannels) => {
      if (audio) {
        actions.updateAudioItem(item.trackIndex, item.index, { gainKeyframes: next.gain ?? [] });
      } else {
        const cur = (actions.getSpec().tracks[item.trackIndex] as { clips: VisualClip[] } | undefined)?.clips[item.index];
        actions.updateClip(item.trackIndex, item.index, {
          transform: { ...(cur?.transform ?? {}), keyframes: channelsToTransform(next) },
        });
      }
    },
    [actions, audio, item.trackIndex, item.index],
  );

  const readChannels = useCallback((): KeyframeChannels => {
    const track = actions.getSpec().tracks[item.trackIndex];
    if (!track) return {};
    const live = track.type === 'visual' ? track.clips[item.index] : track.items[item.index];
    return live ? clipChannels(item, live as VisualClip | AudioItem) : {};
  }, [actions, item]);

  const remove = useCallback((t: number) => commit(removeKeyframeTime(readChannels(), t)), [commit, readChannels]);
  const seek = useCallback((t: number) => actions.setPlayhead(clipAt + t), [actions, clipAt]);

  // One window-driven drag gesture (survives the re-renders that live retiming triggers).
  const drag = useRef<{ originT: number; lastT: number; startX: number; pxToSec: (px: number) => number; dur: number; moved: boolean } | null>(null);

  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
      }
      const target = clamp(d.originT + d.pxToSec(e.clientX - d.startX), 0, d.dur);
      if (Math.abs(target - d.lastT) <= EPS) return;
      commit(moveKeyframeTime(readChannels(), d.lastT, target));
      d.lastT = target;
    },
    [commit, readChannels],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      window.removeEventListener('pointermove', onWindowMove);
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) seek(d.originT); // a tap (no real drag) seeks to the keyframe
      // Swallow the click that follows a real drag so it can't bubble to clip-select.
      if (d && d.moved) window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      void e;
    },
    [onWindowMove, seek],
  );

  const startDrag = useCallback(
    (t: number, e: ReactPointerEvent) => {
      // Diamonds live INSIDE the draggable clip body — stop the event so grabbing a
      // keyframe doesn't also select/drag the whole clip.
      e.stopPropagation();
      e.preventDefault();
      drag.current = { originT: t, lastT: t, startX: e.clientX, pxToSec, dur: durationSec, moved: false };
      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', endDrag, { once: true });
      window.addEventListener('pointercancel', endDrag, { once: true });
    },
    [pxToSec, durationSec, onWindowMove, endDrag],
  );

  const near = times.length ? nearestKeyframeTime(times, playheadSec - clipAt, 0.06) : null;

  const markers: KeyframeMarkerBinding[] = times.map((t) => {
    const dragging = drag.current?.originT === t && drag.current.moved === true;
    return {
      key: t,
      state: { t, active: near != null && Math.abs(t - near) < EPS, dragging },
      leftPct: durationSec > 0 ? clamp((t / durationSec) * 100, 0, 100) : 0,
      handlers: {
        onPointerDown: (e) => startDrag(t, e),
        onDoubleClick: (e) => {
          e.stopPropagation();
          remove(t);
        },
        onKeyDown: (e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            e.stopPropagation();
            remove(t);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            seek(t);
          }
        },
      },
    };
  });

  return { enabled: !!clip && durationSec > 0, times, durationSec, markers };
}
