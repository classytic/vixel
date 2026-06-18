import type { Track, MediaKind } from '@classytic/vixel-schema';
import type { SelectionKind } from '../types.js';

/** A laid-out timeline item (a visual clip or an audio item) in absolute seconds. */
export interface TimelineItem {
  selectionKind: SelectionKind;
  /** Index into `spec.tracks`. */
  trackIndex: number;
  /** Index within the lane's `clips` / `items`. */
  index: number;
  /** For visual clips: the media kind (so a skin can pick an icon/label without re-reading the spec). */
  mediaKind?: MediaKind;
  startSec: number;
  durationSec: number;
  endSec: number;
}

/** A lane plus its laid-out items, for rendering rows. Each visual track is ONE
 *  lane (lanes ARE tracks); an audio track may be lane-packed so items that
 *  overlap in time land on separate rows. `index` is the spec-track index; `lane`
 *  is the sub-row within it (always 0 for visual tracks). */
export interface TrackView {
  index: number;
  /** Sub-row within the spec track (0-based). Visual tracks always use lane 0. */
  lane: number;
  type: Track['type'];
  /** A sequential ("main") visual lane — clips butt end-to-end. */
  sequential?: boolean;
  items: TimelineItem[];
}
