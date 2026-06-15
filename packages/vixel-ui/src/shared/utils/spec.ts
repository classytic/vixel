/**
 * VixelSpec geometry + immutable edit helpers.
 * =======================================================
 * Pure functions over the `@classytic/vixel` composition contract. The timeline
 * layout mirrors vixel's auto-sequencing rule — a clip's `transition` overlaps
 * INTO the next clip, so `total = Σ clipDur − Σ transition`. Editing helpers are
 * immutable (return a new spec) so store selectors detect changes.
 *
 * NOTE: client-side geometry intentionally mirrors vixel's documented model. If
 * vixel later exposes a browser-safe `planTimeline`, delegate to it to keep a
 * single source of truth.
 */
import type {
  VixelSpec,
  Track,
  VideoTrack,
  OverlayTrack,
  AudioTrack,
  Clip,
} from '@classytic/vixel-schema';
import { clamp } from './time.js';

export function isVideoTrack(t: Track): t is VideoTrack {
  return t.type === 'video';
}
export function isOverlayTrack(t: Track): t is OverlayTrack {
  return t.type === 'overlay';
}
export function isAudioTrack(t: Track): t is AudioTrack {
  return t.type === 'audio';
}

/** Effective on-screen duration of a clip (best-effort without media probing). */
export function clipDuration(clip: Clip): number {
  if (typeof clip.duration === 'number') return clip.duration;
  const inSec = clip.in ?? 0;
  if (typeof clip.out === 'number') return Math.max(0, clip.out - inSec);
  return 0;
}

/** A laid-out clip on the timeline (absolute seconds). */
export interface ClipLayout {
  clip: Clip;
  /** Index within the track's `clips`. */
  index: number;
  startSec: number;
  durationSec: number;
  endSec: number;
  /** Overlap (seconds) of this clip's transition into the next. */
  transitionSec: number;
}

/** Lay out a video track's clips with transition overlap. */
export function layoutVideoTrack(track: VideoTrack): ClipLayout[] {
  const out: ClipLayout[] = [];
  let cursor = 0;
  track.clips.forEach((clip, index) => {
    const durationSec = clipDuration(clip);
    const transitionSec = clip.transition?.duration ?? 0;
    out.push({ clip, index, startSec: cursor, durationSec, endSec: cursor + durationSec, transitionSec });
    // Next clip starts earlier by the transition overlap.
    cursor += durationSec - transitionSec;
  });
  return out;
}

/** Total composition duration — the longest of video layout / overlays / audio. */
export function totalDurationSec(spec: VixelSpec): number {
  let max = 0;
  for (const track of spec.tracks) {
    if (isVideoTrack(track)) {
      const layout = layoutVideoTrack(track);
      const last = layout[layout.length - 1];
      if (last) max = Math.max(max, last.endSec);
    } else if (isOverlayTrack(track)) {
      for (const it of track.items) max = Math.max(max, it.at + it.duration);
    } else if (isAudioTrack(track)) {
      for (const it of track.items) max = Math.max(max, (it.at ?? 0) + (it.out ?? 0));
    }
  }
  return max;
}

// ── immutable edit helpers ──────────────────────────────────────────────────

/** Replace one track, returning a new spec. */
export function withTrack(spec: VixelSpec, trackIndex: number, track: Track): VixelSpec {
  const tracks = spec.tracks.slice();
  tracks[trackIndex] = track;
  return { ...spec, tracks };
}

/** Patch a clip on a video track, returning a new spec. No-op on non-video tracks. */
export function withClipPatch(
  spec: VixelSpec,
  trackIndex: number,
  clipIndex: number,
  patch: Partial<Clip>,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVideoTrack(track)) return spec;
  const clips = track.clips.slice();
  const existing = clips[clipIndex];
  if (!existing) return spec;
  clips[clipIndex] = { ...existing, ...patch };
  return withTrack(spec, trackIndex, { ...track, clips });
}

/** Reorder a clip within a video track, returning a new spec. */
export function withClipMoved(
  spec: VixelSpec,
  trackIndex: number,
  fromIndex: number,
  toIndex: number,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVideoTrack(track)) return spec;
  const clips = track.clips.slice();
  if (fromIndex < 0 || fromIndex >= clips.length) return spec;
  const [moved] = clips.splice(fromIndex, 1);
  if (!moved) return spec;
  clips.splice(clamp(toIndex, 0, clips.length), 0, moved);
  return withTrack(spec, trackIndex, { ...track, clips });
}

/** Remove a clip from a video track, returning a new spec. */
export function withClipRemoved(spec: VixelSpec, trackIndex: number, clipIndex: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVideoTrack(track)) return spec;
  const clips = track.clips.slice();
  clips.splice(clipIndex, 1);
  return withTrack(spec, trackIndex, { ...track, clips });
}

/** Patch an overlay/audio item by index, returning a new spec. */
export function withItemPatch(
  spec: VixelSpec,
  trackIndex: number,
  itemIndex: number,
  patch: Record<string, unknown>,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track) return spec;
  if (isOverlayTrack(track)) {
    const items = track.items.slice();
    const existing = items[itemIndex];
    if (!existing) return spec;
    items[itemIndex] = { ...existing, ...patch } as OverlayTrack['items'][number];
    return withTrack(spec, trackIndex, { ...track, items });
  }
  if (isAudioTrack(track)) {
    const items = track.items.slice();
    const existing = items[itemIndex];
    if (!existing) return spec;
    items[itemIndex] = { ...existing, ...patch } as AudioTrack['items'][number];
    return withTrack(spec, trackIndex, { ...track, items });
  }
  return spec;
}

/** Remove an overlay/audio item by index, returning a new spec. */
export function withItemRemoved(spec: VixelSpec, trackIndex: number, itemIndex: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track) return spec;
  if (isOverlayTrack(track)) {
    const items = track.items.slice();
    items.splice(itemIndex, 1);
    return withTrack(spec, trackIndex, { ...track, items });
  }
  if (isAudioTrack(track)) {
    const items = track.items.slice();
    items.splice(itemIndex, 1);
    return withTrack(spec, trackIndex, { ...track, items });
  }
  return spec;
}
