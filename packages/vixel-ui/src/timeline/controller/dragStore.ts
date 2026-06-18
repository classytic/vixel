/**
 * Timeline drag-state TYPES — the shape of the live "where will this land?" intent.
 *
 * Two drag SOURCES share one channel + one set of indicators:
 *  - `move`   — an existing clip is being repositioned (see {@link useClipDrag}).
 *  - `insert` — a panel item is being dragged ONTO the timeline (see
 *               {@link useDraggable}); it carries a `payload` to create on drop.
 *
 * The STATE itself lives in the per-editor DnD context ({@link TimelineDndProvider}),
 * not a module global — published by the active gesture, subscribed by the timeline
 * indicators. This is how CapCut/Canva show the drop point instead of moving blindly.
 */
import type { VisualClip, AudioItem, TransitionRef } from '@classytic/vixel-schema';

export type DragKind = 'visual' | 'audio' | 'transition';

/**
 * What an `insert` drag will create when dropped. A visual payload is ALWAYS a
 * {@link VisualClip} regardless of media kind (image/video/text/shape/effect) —
 * the media kind lives in `clip.media`, not the payload type. Unified model:
 * everything dropped onto a visual lane is a clip.
 */
export type DragPayload =
  | { type: 'clip'; clip: VisualClip }
  | { type: 'audio'; audio: AudioItem }
  | { type: 'transition'; transition: TransitionRef };

export interface TimelineDragState {
  source: 'move' | 'insert';
  kind: DragKind;
  /** Edge time we're magnetically snapped to (for the guide line), or null. */
  snapSec: number | null;
  /** Video boundary (sec) the clip will insert at (reorder / insert), or null. */
  insertSec: number | null;

  // ── move ──
  trackIndex?: number;
  startSec?: number;
  durationSec?: number;
  /**
   * Move only: the overlay LANE ({@link TrackView.lane}) under the pointer — the
   * target-lane highlight for a vertical re-layer (z-restack on drop). Pairs with
   * `dropTrackIndex` (the hovered overlay track) to disambiguate when one overlay
   * track renders as several lanes. Null when not over a re-layer target.
   */
  dropLane?: number | null;

  // ── insert (panel → timeline) ──
  payload?: DragPayload;
  /** Ghost label shown at the cursor. */
  label?: string;
  /** Cursor position (viewport px) for the floating ghost. */
  ghostX?: number;
  ghostY?: number;
  /** Resolved drop track (spec index), or null when not over a valid lane. */
  dropTrackIndex?: number | null;
  /** Transitions only: the seam (left-clip index) under the cursor, or null. */
  dropSeamGap?: number | null;
  /** Insert over empty timeline space → the drop creates a NEW lane (CapCut). */
  newLayer?: boolean;
  /** Vertical lane-insertion index (0 = top overlay lane) — drives the insertion line. */
  laneInsertIndex?: number | null;
}
