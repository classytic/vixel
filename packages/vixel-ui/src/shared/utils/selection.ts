/**
 * Selection resolution — the bridge between POSITION (how the UI renders + how the
 * user clicks) and IDENTITY (how the store remembers what's selected).
 * =========================================================================
 * The store holds selection as id-keyed {@link SelectionRef}/{@link SeamRef} so it
 * never drifts when clips are inserted/moved/sorted. The UI, however, naturally
 * speaks in positions (it iterates lanes to render). These pure helpers convert
 * between the two:
 *   • `selectionRefAt` / `seamRefAt` — position → stable ref (used when ISSUING a
 *     selection, e.g. on click).
 *   • `resolveSelection` / `resolveSeam` — stable ref → current position + the live
 *     item (used when READING a selection, e.g. to draw the gizmo or call a
 *     positional edit like `updateClip`).
 *   • `pruneSelection` / `pruneSeam` — drop a ref whose element no longer exists
 *     (id membership only — NOT a positional bounds-check), so a deleted selection
 *     clears while a moved one is kept verbatim.
 *
 * All pure, all O(1) lookups over `indexSpec`. No React, no store.
 */
import {
  indexSpec,
  type VixelSpec,
  type Track,
  type VisualTrack,
  type VisualClip,
  type AudioItem,
} from '@classytic/vixel-schema';
import type { SelectionKind, SelectionRef, SeamRef } from '../../types.js';

/** A selection resolved to its live position + item. */
export interface ResolvedSelection {
  trackIndex: number;
  itemIndex: number;
  track: Track;
  item: VisualClip | AudioItem;
}

/** Build a stable {@link SelectionRef} from a position, or `null` if it has no item/id. */
export function selectionRefAt(
  spec: VixelSpec,
  kind: SelectionKind,
  trackIndex: number,
  itemIndex: number,
): SelectionRef | null {
  const track = spec.tracks[trackIndex];
  if (!track) return null;
  const item = track.type === 'visual' ? track.clips[itemIndex] : track.items[itemIndex];
  return item?.id ? { kind, id: item.id } : null;
}

/** Resolve a stored {@link SelectionRef} to its current position + live item, or `null`. */
export function resolveSelection(spec: VixelSpec, ref: SelectionRef | null): ResolvedSelection | null {
  if (!ref) return null;
  const idx = indexSpec(spec);
  if (ref.kind === 'audio') {
    const p = idx.audio.get(ref.id);
    const track = p ? spec.tracks[p.trackIndex] : undefined;
    if (!p || track?.type !== 'audio') return null;
    const item = track.items[p.itemIndex];
    return item ? { trackIndex: p.trackIndex, itemIndex: p.itemIndex, track, item } : null;
  }
  const p = idx.clip.get(ref.id);
  const track = p ? spec.tracks[p.trackIndex] : undefined;
  if (!p || track?.type !== 'visual') return null;
  const item = track.clips[p.clipIndex];
  return item ? { trackIndex: p.trackIndex, itemIndex: p.clipIndex, track, item } : null;
}

/** Drop a selection whose element no longer exists; keep it (verbatim) otherwise. */
export function pruneSelection(spec: VixelSpec, ref: SelectionRef | null): SelectionRef | null {
  return resolveSelection(spec, ref) ? ref : null;
}

/** A seam resolved to its live lane index + lower-clip gap index. */
export interface ResolvedSeam {
  trackIndex: number;
  gap: number;
  track: VisualTrack;
}

/** Build a stable {@link SeamRef} from a lane index + gap (lower-clip index), or `null`. */
export function seamRefAt(spec: VixelSpec, trackIndex: number, gap: number): SeamRef | null {
  const track = spec.tracks[trackIndex];
  if (!track || track.type !== 'visual') return null;
  const before = track.clips[gap];
  return track.id && before?.id ? { trackId: track.id, afterClipId: before.id } : null;
}

/** Resolve a stored {@link SeamRef} to its current position, or `null` if the seam is
 *  gone (the lane/clip was removed, or the clip is now last → no following clip). */
export function resolveSeam(spec: VixelSpec, ref: SeamRef | null): ResolvedSeam | null {
  if (!ref) return null;
  const idx = indexSpec(spec);
  const ti = idx.track.get(ref.trackId);
  const cp = idx.clip.get(ref.afterClipId);
  if (ti === undefined || !cp || cp.trackIndex !== ti) return null;
  const track = spec.tracks[ti];
  if (track?.type !== 'visual' || cp.clipIndex >= track.clips.length - 1) return null;
  return { trackIndex: ti, gap: cp.clipIndex, track };
}

/** Drop a seam that no longer resolves; keep it otherwise. */
export function pruneSeam(spec: VixelSpec, ref: SeamRef | null): SeamRef | null {
  return resolveSeam(spec, ref) ? ref : null;
}
