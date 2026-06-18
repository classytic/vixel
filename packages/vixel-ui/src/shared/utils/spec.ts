/**
 * VixelSpec geometry + immutable edit helpers (the unified visual-lane model).
 * ===========================================================================
 * Pure functions over the `@classytic/vixel-schema` contract. A timeline is
 * visual lanes ({@link VisualTrack}) + audio lanes. Every clip is absolutely
 * timed (`at` + `duration`); lane (track) order is the stacking order. A
 * `sequential` lane (the "main track") keeps its clips butted end-to-end — edits
 * to it re-flow `at`. Editing helpers are immutable (return a new spec) so store
 * selectors detect changes.
 *
 * NOTE on the big simplification vs. the old model: moving a clip between lanes is
 * now a plain reposition (change its lane + `at`). A clip NEVER changes its
 * `media.kind` — there is no Clip↔Overlay conversion, because there is no Clip vs
 * Overlay. Stacking is positional (track order), so there is no `z`/`defaultZ`.
 */
import type {
  VixelSpec,
  Track,
  VisualTrack,
  AudioTrack,
  VisualClip,
  AudioItem,
  TransitionRef,
} from '@classytic/vixel-schema';
import { clamp } from './time.js';

export function isVisualTrack(t: Track): t is VisualTrack {
  return t.type === 'visual';
}
export function isAudioTrack(t: Track): t is AudioTrack {
  return t.type === 'audio';
}

/** A laid-out clip on the timeline (absolute seconds). */
export interface ClipLayout {
  clip: VisualClip;
  /** Index within the lane's `clips`. */
  index: number;
  startSec: number;
  durationSec: number;
  endSec: number;
  /** Overlap (seconds) of this clip's transition into the next (sequential lanes). */
  transitionSec: number;
  /** The resolved transition INTO the next clip (id + params), if any. */
  transitionRef?: TransitionRef;
}

/**
 * Lay out a visual lane's clips. Clips are absolutely timed, so `startSec` is just
 * `clip.at` — sorted by `at` so adjacency (for transitions) is well-defined. The
 * transition INTO the next clip comes from the lane's first-class `transitions[]`.
 */
export function layoutLane(track: VisualTrack): ClipLayout[] {
  const order = track.clips
    .map((clip, index) => ({ clip, index }))
    .sort((a, b) => a.clip.at - b.clip.at);
  const transitionAfter = (i: number): TransitionRef | undefined => {
    const s = track.transitions?.find((t) => t.between[0] === i && t.between[1] === i + 1);
    return s && s.transition.id !== 'none' ? s.transition : undefined;
  };
  const last = order.length - 1;
  return order.map(({ clip, index }, pos) => {
    const ref = pos < last ? transitionAfter(index) : undefined;
    return {
      clip,
      index,
      startSec: clip.at,
      durationSec: clip.duration,
      endSec: clip.at + clip.duration,
      transitionSec: ref ? Math.max(0, ref.duration) : 0,
      transitionRef: ref,
    };
  });
}

/** A transition may not overlap more than this fraction of the shorter adjacent clip. */
export const MAX_TRANSITION_OVERLAP_FRACTION = 0.9;
/** Floor for a transition's duration (s). */
export const MIN_TRANSITION_DURATION = 0.1;
/** Gap tolerance (s) for treating two FREE-lane clips as butt-joined → a transition
 *  seam. Snapped clips touch exactly; this absorbs float / sub-frame drift. */
const SEAM_ADJACENCY_EPS = 0.05;

/** A transition SEAM — a cut between two adjacent clips a transition can sit on. */
export interface LaneSeam {
  /** The lower clip index of the gap (`between: [gap, gap + 1]` in clip order). */
  gap: number;
  /** Display seam time (s) — where the cut sits (the later clip's start). */
  seamSec: number;
  /** Largest overlap (s) this gap allows, bounded by the shorter adjacent clip. */
  maxDuration: number;
  /** The resolved transition INTO the next clip, if any. */
  transition?: TransitionRef;
}

/**
 * The transition SEAMS of a visual lane — the cuts a transition can attach to. ONE
 * source of truth shared by the timeline's transition primitive (drawing/resizing
 * seams) and the drop resolver (where a dragged transition may land), so the two can
 * never disagree on "is there a seam here?".
 *
 * A sequential lane's clips are always adjacent (butt-joined, or overlapping by an
 * applied transition via {@link reflowSequential}), so EVERY consecutive pair is a
 * seam. On a FREE lane only clips that actually touch (within {@link
 * SEAM_ADJACENCY_EPS}) form a seam — a real gap means there's no cut to bridge. This
 * is what lets transitions work between adjacent clips on ANY lane, not just the main
 * sequential track (the renderer already keys off `layoutLane`, which is adjacency-,
 * not sequential-, based).
 */
export function laneSeams(track: VisualTrack): LaneSeam[] {
  const layout = layoutLane(track);
  const out: LaneSeam[] = [];
  for (let i = 0; i < layout.length - 1; i++) {
    const a = layout[i]!;
    const b = layout[i + 1]!;
    // Sequential: always adjacent (reflow guarantees touch/overlap). Free: only an
    // exact-ish butt-join — a positive gap (clips apart) OR a heavy overlap (stacked,
    // not a cut) is not a seam.
    const adjacent = track.sequential || Math.abs(b.startSec - a.endSec) <= SEAM_ADJACENCY_EPS;
    if (!adjacent) continue;
    out.push({
      gap: a.index,
      seamSec: b.startSec,
      maxDuration: Math.max(MIN_TRANSITION_DURATION, Math.min(a.durationSec, b.durationSec) * MAX_TRANSITION_OVERLAP_FRACTION),
      transition: a.transitionRef,
    });
  }
  return out;
}

/**
 * Re-flow a sequential lane so its clips butt end-to-end (minus transition
 * overlap), assigning each clip's `at`. Call after insert/remove/reorder on a
 * `sequential` lane. No-op for free lanes (their `at`s are user-positioned).
 */
export function reflowSequential(track: VisualTrack): VisualTrack {
  if (!track.sequential) return track;
  let cursor = 0;
  const last = track.clips.length - 1;
  const clips = track.clips.map((clip, i) => {
    const at = cursor;
    const s = track.transitions?.find((t) => t.between[0] === i && t.between[1] === i + 1);
    const overlap = i < last && s && s.transition.id !== 'none' ? Math.max(0, s.transition.duration) : 0;
    cursor += clip.duration - overlap;
    return clip.at === at ? clip : { ...clip, at };
  });
  return { ...track, clips };
}

/** Total composition duration — the longest of the visual / audio lanes. */
export function totalDurationSec(spec: VixelSpec): number {
  let max = 0;
  for (const track of spec.tracks) {
    if (isVisualTrack(track)) {
      for (const c of track.clips) max = Math.max(max, c.at + c.duration);
    } else {
      for (const it of track.items) {
        const dur = it.out != null ? Math.max(0, it.out - (it.in ?? 0)) : 0;
        max = Math.max(max, (it.at ?? 0) + dur);
      }
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

/** Patch a clip on a visual lane, returning a new spec. Re-flows if the lane is sequential. */
export function withClipPatch(
  spec: VixelSpec,
  trackIndex: number,
  clipIndex: number,
  patch: Partial<VisualClip>,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const clips = track.clips.slice();
  const existing = clips[clipIndex];
  if (!existing) return spec;
  clips[clipIndex] = { ...existing, ...patch };
  return withTrack(spec, trackIndex, reflowSequential({ ...track, clips }));
}

/** Reorder a clip within a sequential lane (then re-flow `at`), returning a new spec. */
export function withClipMoved(
  spec: VixelSpec,
  trackIndex: number,
  fromIndex: number,
  toIndex: number,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const clips = track.clips.slice();
  if (fromIndex < 0 || fromIndex >= clips.length) return spec;
  const [moved] = clips.splice(fromIndex, 1);
  if (!moved) return spec;
  clips.splice(clamp(toIndex, 0, clips.length), 0, moved);
  return withTrack(spec, trackIndex, reflowSequential({ ...track, clips }));
}

/** Remove a clip from a visual lane, returning a new spec. Prunes the lane if it's
 *  now an empty non-sequential lane (so deleting the last effect/overlay clip doesn't
 *  leave a dead "Track" row behind). */
export function withClipRemoved(spec: VixelSpec, trackIndex: number, clipIndex: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const clips = track.clips.slice();
  clips.splice(clipIndex, 1);
  return pruneEmptyLanes(withTrack(spec, trackIndex, reflowSequential({ ...track, clips })));
}

/** Patch an audio item by index, returning a new spec. */
export function withAudioPatch(
  spec: VixelSpec,
  trackIndex: number,
  itemIndex: number,
  patch: Partial<AudioItem>,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isAudioTrack(track)) return spec;
  const items = track.items.slice();
  const existing = items[itemIndex];
  if (!existing) return spec;
  items[itemIndex] = { ...existing, ...patch };
  return withTrack(spec, trackIndex, { ...track, items });
}

/** Remove an audio item by index, returning a new spec. */
export function withAudioRemoved(spec: VixelSpec, trackIndex: number, itemIndex: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isAudioTrack(track)) return spec;
  const items = track.items.slice();
  items.splice(itemIndex, 1);
  return withTrack(spec, trackIndex, { ...track, items });
}

// ── lanes (tracks) ────────────────────────────────────────────────────────────

/** Move a whole visual lane to another stacking position (re-layering). */
export function withTrackMoved(spec: VixelSpec, fromIndex: number, toIndex: number): VixelSpec {
  const tracks = spec.tracks.slice();
  if (fromIndex < 0 || fromIndex >= tracks.length) return spec;
  const [moved] = tracks.splice(fromIndex, 1);
  if (!moved) return spec;
  tracks.splice(clamp(toIndex, 0, tracks.length), 0, moved);
  return { ...spec, tracks };
}

/** Insert a clip into a visual lane at absolute time `atSec`. Re-flows if sequential. */
export function withClipInserted(spec: VixelSpec, trackIndex: number, clip: VisualClip, atSec: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const placed: VisualClip = { ...clip, at: Math.max(0, atSec) };
  const clips = [...track.clips, placed].sort((a, b) => a.at - b.at);
  return withTrack(spec, trackIndex, reflowSequential({ ...track, clips }));
}

/**
 * Create a NEW visual lane holding `clip`, inserted at stacking position
 * `laneIndex` among the existing visual lanes (0 = bottom-most visual lane). Audio
 * lanes are kept after visual lanes. The clip lands at `atSec`.
 */
export function withClipInNewLane(spec: VixelSpec, clip: VisualClip, atSec: number, laneIndex = Number.MAX_SAFE_INTEGER): VixelSpec {
  const lane: VisualTrack = { type: 'visual', clips: [{ ...clip, at: Math.max(0, atSec) }] };
  // Map a visual-lane index to an absolute tracks[] index (visual lanes keep their order).
  const visualPositions = spec.tracks.map((t, i) => (t.type === 'visual' ? i : -1)).filter((i) => i >= 0);
  const at = clamp(laneIndex, 0, visualPositions.length);
  const insertAt = at < visualPositions.length ? visualPositions[at]! : (visualPositions[visualPositions.length - 1] ?? -1) + 1;
  const tracks = spec.tracks.slice();
  tracks.splice(insertAt, 0, lane);
  return { ...spec, tracks };
}

// ── intelligent placement (CapCut-style: fill empty space before adding a lane) ──

/** True when `[atSec, atSec+durSec)` overlaps NO clip already on `track`. */
export function laneFreeAt(track: VisualTrack, atSec: number, durSec: number): boolean {
  const end = atSec + durSec;
  return track.clips.every((c) => end <= c.at + 1e-6 || atSec >= c.at + c.duration - 1e-6);
}

/** Whether a lane carries only adjustment-EFFECT clips (vs media/text). An empty
 *  lane is neither (callers skip it). Used to keep effect lanes and media lanes from
 *  mixing when auto-placing. */
export function isEffectLane(track: VisualTrack): boolean {
  return track.clips.length > 0 && track.clips.every((c) => c.media.kind === 'effect');
}

/** Remove empty NON-sequential visual lanes (CapCut auto-collapses spent overlay /
 *  effect tracks). The sequential main lane and all audio lanes are always kept. */
export function pruneEmptyLanes(spec: VixelSpec): VixelSpec {
  const tracks = spec.tracks.filter((t) => !(isVisualTrack(t) && !t.sequential && t.clips.length === 0));
  return tracks.length === spec.tracks.length ? spec : { ...spec, tracks };
}

/**
 * Smart-place a clip at `atSec` like CapCut: REUSE the first compatible lane that
 * has a free gap at the target window before spawning a NEW lane — so adding
 * effects/overlays repeatedly packs them onto existing lanes instead of stacking a
 * fresh lane every time (the bug this fixes). "Compatible" keeps adjustment-EFFECT
 * clips and MEDIA/text clips on separate lanes, and never touches the sequential
 * main track. Stale empty lanes are pruned first. Falls back to a new lane.
 */
export function withClipAutoPlaced(spec: VixelSpec, clip: VisualClip, atSec: number, laneIndex?: number): VixelSpec {
  const next = pruneEmptyLanes(spec);
  const at = Math.max(0, atSec);
  const wantEffect = clip.media.kind === 'effect';
  for (let i = 0; i < next.tracks.length; i++) {
    const t = next.tracks[i];
    if (!isVisualTrack(t) || t.sequential || t.clips.length === 0) continue;
    if (isEffectLane(t) !== wantEffect) continue; // never mix effect-adjustment lanes with media
    if (laneFreeAt(t, at, clip.duration)) return withClipInserted(next, i, clip, at);
  }
  return withClipInNewLane(next, clip, at, laneIndex);
}

/** Move a clip from one lane to another (or a repositioned spot in the same lane) at `atSec`. */
export function withClipMovedToLane(
  spec: VixelSpec,
  fromTrackIndex: number,
  clipIndex: number,
  toTrackIndex: number,
  atSec: number,
): VixelSpec {
  const from = spec.tracks[fromTrackIndex];
  if (!from || !isVisualTrack(from)) return spec;
  const clip = from.clips[clipIndex];
  if (!clip) return spec;
  if (fromTrackIndex === toTrackIndex) {
    return withClipPatch(spec, fromTrackIndex, clipIndex, { at: Math.max(0, atSec) });
  }
  // Remove from source, insert into destination — the clip's media.kind is untouched.
  const srcClips = from.clips.slice();
  srcClips.splice(clipIndex, 1);
  let next = withTrack(spec, fromTrackIndex, reflowSequential({ ...from, clips: srcClips }));
  next = withClipInserted(next, toTrackIndex, clip, atSec);
  return pruneEmptyLanes(next); // a clip dragged off its lane may have emptied it
}

/** Split a visual clip at `tInSec` into its on-screen duration → two clips. A video's
 *  right half advances its source trim by `tInSec`. Re-flows if the lane is sequential. */
export function withClipSplit(spec: VixelSpec, trackIndex: number, clipIndex: number, tInSec: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const c = track.clips[clipIndex];
  if (!c || tInSec <= 0 || tInSec >= c.duration) return spec;
  const left: VisualClip = { ...c, duration: tInSec };
  const right: VisualClip = {
    ...c,
    at: c.at + tInSec,
    duration: c.duration - tInSec,
    ...(c.media.kind === 'video' ? { media: { ...c.media, trimStart: (c.media.trimStart ?? 0) + tInSec } } : {}),
  };
  const clips = track.clips.slice();
  clips.splice(clipIndex, 1, left, right);
  return withTrack(spec, trackIndex, reflowSequential({ ...track, clips }));
}

/** Duplicate a clip in place — a copy spliced right after it (offset on free lanes). */
export function withClipDuplicated(spec: VixelSpec, trackIndex: number, clipIndex: number): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const c = track.clips[clipIndex];
  if (!c) return spec;
  const clips = track.clips.slice();
  clips.splice(clipIndex + 1, 0, { ...c, at: c.at + (track.sequential ? 0 : 0.3) });
  return withTrack(spec, trackIndex, reflowSequential({ ...track, clips }));
}

/** Move a clip out to a brand-new visual lane at stacking position `laneIndex`, time `atSec`. */
export function withClipMovedToNewLane(
  spec: VixelSpec,
  fromTrackIndex: number,
  clipIndex: number,
  laneIndex: number,
  atSec: number,
): VixelSpec {
  const from = spec.tracks[fromTrackIndex];
  if (!from || !isVisualTrack(from)) return spec;
  const clip = from.clips[clipIndex];
  if (!clip) return spec;
  const srcClips = from.clips.slice();
  srcClips.splice(clipIndex, 1);
  const next = pruneEmptyLanes(withTrack(spec, fromTrackIndex, reflowSequential({ ...from, clips: srcClips })));
  return withClipInNewLane(next, clip, atSec, laneIndex);
}

// ── append / output helpers ──────────────────────────────────────────────────

/** Append a clip to the first sequential lane (creating one if absent), butted at the end. */
export function withClipAppended(spec: VixelSpec, clip: VisualClip): VixelSpec {
  const idx = spec.tracks.findIndex((t) => isVisualTrack(t) && t.sequential);
  if (idx === -1) {
    const lane: VisualTrack = { type: 'visual', sequential: true, clips: [{ ...clip, at: 0 }] };
    return { ...spec, tracks: [lane, ...spec.tracks] };
  }
  const track = spec.tracks[idx] as VisualTrack;
  return withTrack(spec, idx, reflowSequential({ ...track, clips: [...track.clips, clip] }));
}

/** Append an audio item to the first audio track (creating one if absent). */
export function withAudioItemAppended(spec: VixelSpec, item: AudioItem): VixelSpec {
  const idx = spec.tracks.findIndex(isAudioTrack);
  if (idx === -1) return { ...spec, tracks: [...spec.tracks, { type: 'audio', items: [item] }] };
  const track = spec.tracks[idx] as AudioTrack;
  return withTrack(spec, idx, { ...track, items: [...track.items, item] });
}

/** Patch the composition output (size / fps / background). */
export function withOutputPatch(spec: VixelSpec, patch: Partial<VixelSpec['output']>): VixelSpec {
  return { ...spec, output: { ...spec.output, ...patch } };
}

/**
 * Set (or clear, with `ref: null`) the first-class transition on the gap between
 * clips `gap` and `gap + 1` of a visual lane — writes `VisualTrack.transitions[]`.
 */
export function withTransition(
  spec: VixelSpec,
  trackIndex: number,
  gap: number,
  ref: TransitionRef | null,
): VixelSpec {
  const track = spec.tracks[trackIndex];
  if (!track || !isVisualTrack(track)) return spec;
  const kept = (track.transitions ?? []).filter((t) => !(t.between[0] === gap && t.between[1] === gap + 1));
  const transitions = ref ? [...kept, { between: [gap, gap + 1] as [number, number], transition: ref }] : kept;
  return withTrack(spec, trackIndex, reflowSequential({ ...track, transitions }));
}
