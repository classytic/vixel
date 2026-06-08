/**
 * Timeline planning — pure (no ffmpeg).
 * ====================================
 * Turns a video track's `clips[]` into a render plan: each clip's trim + shown
 * duration, and the per-gap `xfade` offset on the OUTPUT timeline. Transitions
 * OVERLAP neighbors, so (Remotion's invariant, which we test):
 *
 *     total = Σ clipDuration − Σ transitionDuration
 *
 * and the xfade `offset` for gap i is "where the left side ends, minus the
 * overlap". Keeping this pure makes the offset arithmetic — the #1 source of
 * filter-graph bugs — unit-testable without encoding anything.
 */

import { ConfigError } from '../errors.js';
import type { Clip, TransitionType } from './schema.js';

export interface PlannedClip {
  /** ffmpeg input index. */
  readonly index: number;
  readonly source: string;
  /** Seconds into the source to start. */
  readonly trimStart: number;
  /** Shown duration on the timeline (seconds). */
  readonly duration: number;
  /** Source-audio gain 0..1. */
  readonly volume: number;
}

export interface PlannedTransition {
  readonly type: TransitionType;
  /** Overlap (seconds). */
  readonly duration: number;
  /** Absolute offset on the output timeline where the xfade begins. */
  readonly offset: number;
}

export interface TimelinePlan {
  readonly clips: PlannedClip[];
  /** One per gap between adjacent clips (length = clips.length − 1). */
  readonly transitions: PlannedTransition[];
  /** Total output duration (seconds). */
  readonly total: number;
  /** True when at least one gap uses a real (duration > 0) transition. */
  readonly hasTransitions: boolean;
}

/** Resolve a clip's shown duration from `duration` or `out − in`. */
function clipDuration(clip: Clip): number {
  if (clip.duration !== undefined) return clip.duration;
  if (clip.out !== undefined) return Math.max(0, clip.out - (clip.in ?? 0));
  throw new ConfigError('clip needs `duration` or `out` to know its length', {
    context: { source: clip.source },
  });
}

/** Plan a video track into trims + xfade offsets (the offset-math source of truth). */
export function planTimeline(clips: Clip[]): TimelinePlan {
  if (clips.length === 0) {
    throw new ConfigError('a video track needs at least one clip');
  }

  const planned: PlannedClip[] = clips.map((clip, i) => ({
    index: i,
    source: clip.source,
    trimStart: clip.in ?? 0,
    duration: clipDuration(clip),
    volume: clip.volume ?? 1,
  }));

  const transitions: PlannedTransition[] = [];
  let runningEnd = planned[0]!.duration; // output position where the chain currently ends
  let hasTransitions = false;

  for (let i = 1; i < clips.length; i++) {
    const t = clips[i - 1]!.transition; // transition INTO clip i
    const dur = t && t.type !== 'none' ? Math.max(0, t.duration) : 0;
    if (dur > 0) {
      hasTransitions = true;
      // xfade needs both inputs strictly longer than the overlap.
      if (planned[i - 1]!.duration <= dur || planned[i]!.duration <= dur) {
        throw new ConfigError(
          `transition (${dur}s) must be shorter than both adjacent clips`,
          { context: { overlap: dur, left: planned[i - 1]!.duration, right: planned[i]!.duration } },
        );
      }
    }
    const offset = Math.max(0, runningEnd - dur);
    transitions.push({ type: t?.type ?? 'none', duration: dur, offset });
    runningEnd = runningEnd + planned[i]!.duration - dur;
  }

  return { clips: planned, transitions, total: runningEnd, hasTransitions };
}
