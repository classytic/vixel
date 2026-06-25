/**
 * Audio — music / voice / sfx items with gain, fades, and sidechain ducking.
 */
import type { SourceRef } from './media.js';
import type { Keyframe } from './keyframes.js';

export type AudioRole = 'music' | 'voice' | 'sfx';

export interface DuckSpec {
  /** What to attenuate while this plays. Default `music`. */
  target?: 'music' | 'all';
  /** Gain reduction in dB (e.g. -12). */
  amount: number;
  attack?: number;
  release?: number;
}

export interface AudioItem {
  /** Stable item id (minted by `normalizeSpec` via `mintIds`) — referenced by
   *  identity (selection/edit/link), not array position. */
  id?: string;
  /** Link-group id — couples this item to its partner video/audio so edits carry the
   *  whole group in sync (detached source audio, dual-system sound). See `./link`. */
  linkId?: string;
  source: SourceRef;
  at?: number;
  in?: number;
  out?: number;
  /** Static gain in dB (0 = unity). Default 0. */
  gain?: number;
  /** Gain ENVELOPE in dB over time (element-relative seconds) — a manual volume
   *  curve OR the auto-duck mix (see `duckEnvelope`). Overrides static `gain` while
   *  present; sampled by the mixer + preview via `sampleChannel`. */
  gainKeyframes?: Keyframe[];
  /** Repeat the trimmed source `[in, out)` window to fill time on the timeline. */
  loop?: boolean;
  /** When `loop`, the total seconds this item occupies on the timeline (the window
   *  repeats to fill it). Omit ⇒ no intrinsic end (a bed the host fills to the
   *  composition length). Ignored when `loop` is false. */
  loopDuration?: number;
  role?: AudioRole;
  duck?: DuckSpec;
  fadeIn?: number;
  fadeOut?: number;
  /** Optional group/template tag — editor grouping; ignored by render. */
  group?: string;
  metadata?: Record<string, unknown>;
}

/* ── duration + looping ───────────────────────────────────────────────────── */

/** The trimmed source window length (seconds) — `out − in`, or 0 if `out` is unset. */
export function audioWindowSec(item: AudioItem): number {
  return item.out != null ? Math.max(0, item.out - (item.in ?? 0)) : 0;
}

/**
 * On-timeline length (seconds) of an audio item. A non-looping item is its trimmed
 * source window; a looping item with `loopDuration` plays for that long; a looping
 * item without `loopDuration` has no intrinsic end (returns its window as a floor —
 * the host fills it to the composition length). Pure.
 */
export function audioItemDurationSec(item: AudioItem): number {
  if (item.loop && item.loopDuration != null) return Math.max(0, item.loopDuration);
  return audioWindowSec(item);
}

/** Make an audio item loop and occupy `seconds` on the timeline. Returns a NEW item. Pure. */
export function loopAudioToFill(item: AudioItem, seconds: number): AudioItem {
  return { ...item, loop: true, loopDuration: Math.max(0, seconds) };
}
