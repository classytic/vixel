/**
 * Drop resolution TYPES — mapping a viewport pointer position to a timeline drop
 * target. The {@link Timeline} owns geometry (px↔sec) + the track DOM, so it builds
 * a {@link DropResolver} and registers it on the per-editor DnD context; a panel drag
 * (see {@link useDraggable}) — in a sibling subtree — calls `dnd.resolve()` each move
 * to learn the target lane / time / seam. The context (not a module global) bridges
 * the panel↔timeline boundary.
 */

export interface DropTarget {
  /** Spec track index under the cursor (-1 for a new-layer drop). */
  trackIndex: number;
  trackType: 'visual' | 'audio' | null;
  /** True if the hovered lane is the sequential ("main") visual lane. */
  sequential: boolean;
  /** Snapped drop time (sec). */
  sec: number;
  /** Edge we snapped to (for the guide), or null. */
  snapSec: number | null;
  /** Sequential-lane insertion index (where a clip would splice in), or null. */
  insertIndex: number | null;
  /** Sequential-lane boundary time for the insertion marker, or null. */
  insertSec: number | null;
  /** Seam (left-clip index) under the cursor for transitions, or null. */
  seamGap: number | null;
  /**
   * True when the cursor is over the timeline but NOT on an existing lane — the drop
   * creates a NEW visual lane (its own track; CapCut behavior). `trackIndex` is -1.
   */
  newLayer: boolean;
  /**
   * Vertical lane-insertion index among the VISUAL lanes, from the cursor Y: 0 = above
   * the top lane (front), N = below the bottom. Drives the moving insertion line +
   * where a new lane is created. Independent of which lane is directly under the cursor.
   */
  laneInsertIndex: number;
}

/** Maps a viewport point to a drop target. The timeline builds one + registers it on the DnD context. */
export type DropResolver = (clientX: number, clientY: number) => DropTarget | null;
