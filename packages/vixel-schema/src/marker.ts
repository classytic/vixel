/**
 * Markers — named time anchors on the timeline (cut points, chapters, beats, notes).
 * ==================================================================================
 * A {@link Marker} pins a label to a moment. Three audiences use the same primitive:
 *   • the editor — snap targets, chapter rail, "add marker at playhead";
 *   • delivery — chapters export to YouTube/MP4 chapter tracks, an EDL, or VTT;
 *   • the AGENT — the natural anchor for "cut here", "the part about pricing starts
 *     at this marker", beat-synced placement. An agent can drop markers while it
 *     reasons over a transcript, then act on them — and because they live IN the
 *     spec (`VixelSpec.markers`), they survive export, handoff, and re-open.
 *
 * Markers are intent, not geometry — they never affect rendering. Timeline markers
 * are absolute seconds; clip markers ({@link VisualClip.markers}) are clip-relative
 * so they follow the clip when it moves. Pure + deterministic, like the rest of the
 * contract: ids are minted counter-based (`mk{n}`), never random.
 */
import type { VixelSpec } from './spec.js';

/** What a marker denotes — drives icon/color defaults and delivery mapping. */
export type MarkerKind = 'cut' | 'chapter' | 'beat' | 'note';

/** A named anchor at a point in time (timeline-absolute or clip-relative seconds). */
export interface Marker {
  /** Stable id (minted by {@link mintMarkerIds}); preserved if author-supplied. */
  id?: string;
  /** Position in seconds — absolute for `spec.markers`, clip-relative for clip markers. */
  at: number;
  /** Human label ("Intro", "Pricing", "Hook"). */
  label?: string;
  /** `#RRGGBB` accent for the editor rail. */
  color?: string;
  /** Semantic kind. Default `note`. */
  kind?: MarkerKind;
  metadata?: Record<string, unknown>;
}

/** Markers sorted by time (stable). Pure — returns a new array. */
export function sortMarkers(markers: readonly Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.at - b.at);
}

/** Markers whose `at` falls in `[startSec, endSec)`, time-sorted. Pure. */
export function markersInRange(markers: readonly Marker[], startSec: number, endSec: number): Marker[] {
  return sortMarkers(markers.filter((m) => m.at >= startSec && m.at < endSec));
}

/** The marker nearest `t` within `±toleranceSec` (default ∞), or undefined. Pure. */
export function nearestMarker(
  markers: readonly Marker[],
  t: number,
  toleranceSec = Infinity,
): Marker | undefined {
  let best: Marker | undefined;
  let bestD = toleranceSec;
  for (const m of markers) {
    const d = Math.abs(m.at - t);
    if (d <= bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/**
 * Mint a stable `id` on every timeline marker that lacks one, preserving existing
 * ids. Counter-based (`mk{n}`), collision-free, deterministic, idempotent — the same
 * minting contract as {@link mintIds}. Returns a NEW spec (markers untouched if all
 * already have ids / there are none). Pure.
 */
export function mintMarkerIds(spec: VixelSpec): VixelSpec {
  if (!spec.markers?.length) return spec;
  const used = new Set<string>();
  for (const m of spec.markers) if (m.id) used.add(m.id);
  if (spec.markers.every((m) => m.id)) return spec;
  let n = 0;
  const mint = (): string => {
    let id: string;
    do {
      id = `mk${(n += 1)}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
  return { ...spec, markers: spec.markers.map((m) => (m.id ? m : { ...m, id: mint() })) };
}

/** Add a timeline marker (time-sorted), minting an id if absent. Returns a NEW spec. Pure. */
export function addMarker(spec: VixelSpec, marker: Marker): VixelSpec {
  const next = { ...spec, markers: sortMarkers([...(spec.markers ?? []), marker]) };
  return mintMarkerIds(next);
}

/** Remove the timeline marker with this id. Returns a NEW spec (same ref if absent). Pure. */
export function removeMarker(spec: VixelSpec, markerId: string): VixelSpec {
  if (!spec.markers?.some((m) => m.id === markerId)) return spec;
  return { ...spec, markers: spec.markers.filter((m) => m.id !== markerId) };
}
