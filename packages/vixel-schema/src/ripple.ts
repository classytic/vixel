/**
 * Ripple editing — the magnetic-timeline primitives (insert-and-shift, delete-and-close).
 * =======================================================================================
 * The two operations a positional model can't express cleanly and that an agent
 * needs most:
 *   • {@link rippleDeleteRanges} — cut one or more time RANGES out of a lane and
 *     CLOSE the gaps, shifting every later clip left. This is the fast path for
 *     transcript-driven editing (filler-word / dead-air / retake removal): collect
 *     every cut from {@link timelineTranscript} word times and pass them in ONE call,
 *     instead of a split → split → remove → move loop.
 *   • {@link rippleInsertGap} — OPEN a gap at a point, shifting every later clip
 *     right, so new footage splices in without overwriting what's there (the
 *     non-destructive counterpart to an overwrite add).
 *
 * Both are PURE `(spec) → spec`, in SECONDS (the contract's native unit — frame
 * snapping is the engine's job), and deterministic. Because vixel has no per-clip
 * speed/time-remap, timeline time maps 1:1 to source time, so a cut translates
 * exactly into the surviving pieces' `trimStart` (video) / `in`–`out` (audio) — no
 * rate math, no drift.
 *
 * LINK-AWARE: by default, linked partners (same `linkId`, see `./link`) of every
 * touched clip are cut / shifted on the SAME spans, so a clip and its detached audio
 * stay in sync. Unlinked content on other lanes is left alone — there is no global
 * sync-lock model yet (that is the `timeline:'magnetic'|'free'` roadmap item); pass
 * `alsoShiftTrackIds` to ripple additional whole lanes in solidarity.
 *
 * Split pieces are emitted without an `id`; the result is re-minted so every piece is
 * immediately addressable (same self-contained contract as the command reducer).
 */
import type { VixelSpec } from './spec.js';
import type { VisualClip, VisualTrack } from './visual.js';
import type { AudioItem } from './audio.js';
import type { AudioTrack } from './track.js';
import { mintIds } from './ids.js';
import { linkGroups } from './link.js';

/** A half-open time interval `[start, end)` in seconds. */
export type TimeRange = readonly [start: number, end: number];

/** Merge overlapping/adjacent ranges into a disjoint, ascending set. Pure. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const valid = ranges
    .map((r) => [Math.min(r[0], r[1]), Math.max(r[0], r[1])] as [number, number])
    .filter((r) => r[1] > r[0])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of valid) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** Total removed length strictly before `t` across disjoint, ascending `merged`. */
function shiftBefore(merged: readonly TimeRange[], t: number): number {
  let s = 0;
  for (const [a, b] of merged) {
    if (a >= t) break;
    s += Math.min(b, t) - a;
  }
  return s;
}

/** Surviving sub-intervals of `[at, at+len)` after removing `merged`. */
function subtract(at: number, len: number, merged: readonly TimeRange[]): [number, number][] {
  const end = at + len;
  const out: [number, number][] = [];
  let cursor = at;
  for (const [a, b] of merged) {
    if (b <= cursor) continue;
    if (a >= end) break;
    if (a > cursor) out.push([cursor, Math.min(a, end)]);
    cursor = Math.max(cursor, b);
    if (cursor >= end) break;
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

/** Apply a ripple-delete to one visual clip → 0..n surviving pieces (left-shifted). */
function cutClip(clip: VisualClip, merged: readonly TimeRange[]): VisualClip[] {
  const pieces = subtract(clip.at, clip.duration, merged);
  return pieces.map(([a, b], i) => {
    const sourceDelta = a - clip.at; // seconds into the clip this piece begins
    const piece: VisualClip = {
      ...clip,
      at: a - shiftBefore(merged, a),
      duration: b - a,
    };
    if (i > 0) delete piece.id; // splits get fresh ids on re-mint; keep id on the first
    if (piece.media.kind === 'video') {
      piece.media = { ...piece.media, trimStart: (piece.media.trimStart ?? 0) + sourceDelta };
    }
    return piece;
  });
}

/** Apply a ripple-delete to one audio item → 0..n surviving pieces (left-shifted). */
function cutAudio(item: AudioItem, merged: readonly TimeRange[]): AudioItem[] {
  const at = item.at ?? 0;
  const inn = item.in ?? 0;
  const len = item.out != null ? Math.max(0, item.out - inn) : 0;
  if (len <= 0) {
    // Open-ended / looped item: shift its start, don't try to cut a source window.
    const shifted = shiftBefore(merged, at);
    return shifted ? [{ ...item, at: at - shifted }] : [item];
  }
  const pieces = subtract(at, len, merged);
  return pieces.map(([a, b], i) => {
    const sourceDelta = a - at;
    const piece: AudioItem = {
      ...item,
      at: a - shiftBefore(merged, a),
      in: inn + sourceDelta,
      out: inn + (b - at),
    };
    if (i > 0) delete piece.id;
    return piece;
  });
}

/** Shift a clip/item's `at` left by the removed time before it (no source cut). */
function shiftClip(clip: VisualClip, merged: readonly TimeRange[]): VisualClip {
  const d = shiftBefore(merged, clip.at);
  return d ? { ...clip, at: clip.at - d } : clip;
}
function shiftAudio(item: AudioItem, merged: readonly TimeRange[]): AudioItem {
  const at = item.at ?? 0;
  const d = shiftBefore(merged, at);
  return d ? { ...item, at: at - d } : item;
}

/** Options for {@link rippleDeleteRanges}. */
export interface RippleDeleteOptions {
  /** Also cut + close linked partners (same `linkId`) on their lanes. Default true. */
  linked?: boolean;
  /** Additional lane ids to ripple-shift in solidarity (their clips are NOT cut,
   *  only shifted left to stay aligned). For deliberate sync-lock across lanes. */
  alsoShiftTrackIds?: readonly string[];
}

/**
 * Cut every range out of the lane `trackId` and close the gaps — clips after each
 * cut shift left by the removed duration; clips straddling a cut are split; clips
 * fully inside a cut are removed. Overlapping ranges merge. Ranges are SECONDS.
 *
 * Linked partners of any touched clip are cut on the same spans (unless
 * `linked:false`); `alsoShiftTrackIds` lanes shift left in solidarity without being
 * cut. Returns a NEW, re-minted spec. A no-op set of ranges returns the same spec.
 * Pure.
 */
export function rippleDeleteRanges(
  spec: VixelSpec,
  trackId: string,
  ranges: readonly TimeRange[],
  options: RippleDeleteOptions = {},
): VixelSpec {
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return spec;
  const { linked = true, alsoShiftTrackIds = [] } = options;

  // Which lanes get the full cut: the target lane + lanes holding linked partners
  // of clips on the target lane.
  const cutTrackIds = new Set<string>([trackId]);
  if (linked) {
    const groups = linkGroups(spec);
    const targetLinkIds = new Set<string>();
    for (const t of spec.tracks) {
      if (t.id === trackId && t.type === 'visual') {
        for (const c of t.clips) if (c.linkId) targetLinkIds.add(c.linkId);
      }
    }
    for (const linkId of targetLinkIds) {
      for (const m of groups.get(linkId) ?? []) {
        const lane = spec.tracks[m.trackIndex];
        if (lane?.id) cutTrackIds.add(lane.id);
      }
    }
  }
  const shiftOnly = new Set(alsoShiftTrackIds);

  const tracks = spec.tracks.map((t): typeof t => {
    if (t.id && cutTrackIds.has(t.id)) {
      return t.type === 'visual'
        ? ({ ...t, clips: t.clips.flatMap((c) => cutClip(c, merged)) } as VisualTrack)
        : ({ ...t, items: t.items.flatMap((it) => cutAudio(it, merged)) } as AudioTrack);
    }
    if (t.id && shiftOnly.has(t.id)) {
      return t.type === 'visual'
        ? ({ ...t, clips: t.clips.map((c) => shiftClip(c, merged)) } as VisualTrack)
        : ({ ...t, items: t.items.map((it) => shiftAudio(it, merged)) } as AudioTrack);
    }
    return t;
  });

  return mintIds({ ...spec, tracks });
}

/**
 * Open a gap of `durationSec` at `atSec` on lane `trackId`: every clip starting at or
 * after `atSec` shifts right by `durationSec`; a clip straddling `atSec` is split so
 * the gap is clean. Linked partners shift on the same span (unless `linked:false`).
 * The caller then places footage into `[atSec, atSec+durationSec)`. Returns a NEW,
 * re-minted spec. Pure.
 */
export function rippleInsertGap(
  spec: VixelSpec,
  trackId: string,
  atSec: number,
  durationSec: number,
  options: { linked?: boolean } = {},
): VixelSpec {
  if (durationSec <= 0) return spec;
  const { linked = true } = options;

  // Lanes that shift: the target + lanes with linked partners of straddling/later clips.
  const shiftTrackIds = new Set<string>([trackId]);
  if (linked) {
    const groups = linkGroups(spec);
    const linkIds = new Set<string>();
    for (const t of spec.tracks) {
      if (t.id === trackId && t.type === 'visual') {
        for (const c of t.clips) if (c.linkId && c.at + c.duration > atSec) linkIds.add(c.linkId);
      }
    }
    for (const linkId of linkIds)
      for (const m of groups.get(linkId) ?? []) {
        const lane = spec.tracks[m.trackIndex];
        if (lane?.id) shiftTrackIds.add(lane.id);
      }
  }

  const splitVisual = (c: VisualClip): VisualClip[] => {
    // Straddles atSec → split into left (unchanged) + right (shifted).
    if (c.at < atSec && c.at + c.duration > atSec) {
      const leftLen = atSec - c.at;
      const left: VisualClip = { ...c, duration: leftLen };
      const right: VisualClip = { ...c, at: atSec + durationSec, duration: c.duration - leftLen };
      delete right.id;
      if (right.media.kind === 'video')
        right.media = { ...right.media, trimStart: (right.media.trimStart ?? 0) + leftLen };
      return [left, right];
    }
    return [c.at >= atSec ? { ...c, at: c.at + durationSec } : c];
  };

  const tracks = spec.tracks.map((t): typeof t => {
    if (!t.id || !shiftTrackIds.has(t.id)) return t;
    if (t.type === 'visual') return { ...t, clips: t.clips.flatMap(splitVisual) };
    return {
      ...t,
      items: t.items.map((it) => ((it.at ?? 0) >= atSec ? { ...it, at: (it.at ?? 0) + durationSec } : it)),
    };
  });

  return mintIds({ ...spec, tracks });
}
