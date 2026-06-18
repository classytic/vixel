/**
 * Lane stacking math (pure) — the ONE place that reconciles the timeline's DISPLAY
 * order with the spec's STACKING order, so the drag commit sites don't each re-derive
 * (and drift on) it.
 *
 * The renderer composites visual lanes in `tracks` array order: index 0 = BACK, last
 * = FRONT. The timeline DISPLAYS them reversed — front on top (see `useTimelineTracks`,
 * which sorts visual rows by descending index) — exactly like every NLE. So a drop at
 * display row 0 (the top) means FRONT (highest stacking), not back. This converts a
 * display-order drop index into the stacking index `withClipInNewLane` expects.
 *
 * Pure + dependency-free → unit-tested in `lane-math.test.ts`.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { isVisualTrack } from '../../shared/utils/spec.js';

/**
 * Convert a DISPLAY-order lane drop index (`0` = top row … `N` = below the last row)
 * to the STACKING index `withClipInNewLane` takes (`0` = back/bottom … `N` = front/top).
 *
 * When the drop is a MOVE out of `removingTrackIndex` and that lane holds only the
 * clip being moved, it will be pruned on removal — so a target BELOW it shifts down by
 * one. Pass `removingTrackIndex` for moves; omit it for fresh inserts.
 */
export function stackingLaneIndex(
  spec: VixelSpec,
  displayIndex: number,
  removingTrackIndex?: number,
): number {
  const visualIdxs = spec.tracks.map((t, i) => (isVisualTrack(t) ? i : -1)).filter((i) => i >= 0);
  let stack = Math.max(0, Math.min(visualIdxs.length, visualIdxs.length - displayIndex));
  if (removingTrackIndex != null) {
    const src = spec.tracks[removingTrackIndex];
    const prunes = !!src && isVisualTrack(src) && !src.sequential && src.clips.length === 1;
    if (prunes && visualIdxs.indexOf(removingTrackIndex) < stack) stack -= 1;
  }
  return stack;
}
