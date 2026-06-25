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

/** Patch a marker's fields (label / color / kind / at). Returns a NEW spec (same ref
 *  if the id is unknown); re-sorts when `at` changes. Pure. */
export function updateMarker(spec: VixelSpec, markerId: string, patch: Partial<Omit<Marker, 'id'>>): VixelSpec {
  if (!spec.markers?.some((m) => m.id === markerId)) return spec;
  const markers = spec.markers.map((m) => (m.id === markerId ? { ...m, ...patch } : m));
  return { ...spec, markers: patch.at != null ? sortMarkers(markers) : markers };
}

/* ── chapter export (pure; no ffmpeg) ─────────────────────────────────────── */

/** Seconds → `HH:MM:SS.mmm` (WebVTT timestamp). */
function vttTimestamp(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  const ms = Math.round((secs - Math.floor(secs)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(Math.floor(secs))}.${pad(ms, 3)}`;
}

/**
 * Render markers as a WebVTT CHAPTERS track: each marker spans from its time to the
 * next marker (the last runs to `totalSec`). Unlabeled markers become "Chapter N".
 * Markers at/after `totalSec` are dropped. Returns '' when there are no chapters.
 * The portable, no-ffmpeg sidecar (YouTube/players read it). Pure.
 */
export function markersToVtt(markers: readonly Marker[], totalSec: number): string {
  const chapters = sortMarkers(markers.filter((m) => m.at < totalSec));
  if (chapters.length === 0) return '';
  const cues = chapters.map((m, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1]!.at : totalSec;
    const title = m.label?.trim() || `Chapter ${i + 1}`;
    return `${i + 1}\n${vttTimestamp(m.at)} --> ${vttTimestamp(end)}\n${title}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

/**
 * Render markers as an ffmpeg FFMETADATA chapter file (the input to a `-map_metadata`
 * embed). Provided as pure data so a host that wants chapters burned INTO the MP4
 * container can pass this to ffmpeg — vixel's renderer needs no marker knowledge. Pure.
 */
export function markersToFfmetadata(markers: readonly Marker[], totalSec: number): string {
  const chapters = sortMarkers(markers.filter((m) => m.at < totalSec));
  if (chapters.length === 0) return ';FFMETADATA1\n';
  const blocks = chapters.map((m, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1]!.at : totalSec;
    const title = m.label?.trim() || `Chapter ${i + 1}`;
    return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(m.at * 1000)}\nEND=${Math.round(end * 1000)}\ntitle=${title}`;
  });
  return `;FFMETADATA1\n${blocks.join('\n')}\n`;
}
