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
  loop?: boolean;
  role?: AudioRole;
  duck?: DuckSpec;
  fadeIn?: number;
  fadeOut?: number;
  /** Optional group/template tag — editor grouping; ignored by render. */
  group?: string;
  metadata?: Record<string, unknown>;
}
