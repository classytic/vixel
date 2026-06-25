/**
 * Timeline geometry (pure) — duration math every consumer agrees on.
 * Every clip is absolutely timed, so a lane's length is simply the latest
 * `at + duration`, and the composition length is the longest lane (visual or
 * audio). Transition overlaps are already baked into the clips' `at` positions,
 * so no per-transition subtraction is needed.
 */
import type { VixelSpec } from './spec.js';
import type { VisualTrack } from './visual.js';
import { audioItemDurationSec } from './audio.js';

/** Latest end time (seconds) of any clip on a visual lane. */
export function visualTrackEndSec(track: VisualTrack): number {
  let end = 0;
  for (const c of track.clips) end = Math.max(end, c.at + c.duration);
  return end;
}

/** Total composition duration — the longest of the visual / audio lanes. */
export function totalDurationSec(spec: VixelSpec): number {
  let max = 0;
  for (const track of spec.tracks ?? []) {
    if (track.type === 'visual') {
      max = Math.max(max, visualTrackEndSec(track));
    } else {
      for (const it of track.items ?? []) {
        max = Math.max(max, (it.at ?? 0) + audioItemDurationSec(it));
      }
    }
  }
  return max;
}
