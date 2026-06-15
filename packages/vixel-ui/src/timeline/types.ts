import type { Track } from '@classytic/vixel-schema';
import type { SelectionKind } from '../types.js';

/** A laid-out timeline item (clip / overlay / audio) in absolute seconds. */
export interface TimelineItem {
  selectionKind: SelectionKind;
  /** Index into `spec.tracks`. */
  trackIndex: number;
  /** Index within the track's `clips` / `items`. */
  index: number;
  startSec: number;
  durationSec: number;
  endSec: number;
}

/** A track plus its laid-out items, for rendering rows. */
export interface TrackView {
  index: number;
  type: Track['type'];
  items: TimelineItem[];
}
