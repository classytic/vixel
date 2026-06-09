/**
 * Speed Ramp Generator Types
 * ==========================
 * Variable-speed ("speed ramp") with optical-flow slow-motion — the CapCut
 * signature a single constant `changeSpeed` can't express.
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface SpeedRampSegment {
  /**
   * Source-time boundary (seconds) this segment plays THROUGH. Segments are
   * ordered ascending; each covers from the previous boundary (or 0) up to its
   * own `throughSec`. A `throughSec` at or beyond the source duration covers the
   * remainder of the clip.
   */
  throughSec: number;
  /** Playback speed for this segment. `>1` faster, `<1` slow-motion. Range 0.25–4.0. */
  speed: number;
}

export interface SpeedRampConfig extends BaseGeneratorConfig {
  /** Ordered speed segments covering the clip (intent-level — no ffmpeg here). */
  segments: readonly SpeedRampSegment[];
  /**
   * Optical-flow frame interpolation on slow-motion segments — buttery slow-mo
   * instead of stuttered duplicate frames (`minterpolate`). Default `true`.
   */
  smooth?: boolean;
  /** Output (and interpolation target) frame rate. Default `30`. */
  fps?: number;
  /** Output video codec. Default `libx264`. */
  videoCodec?: 'libx264' | 'libx265';
  /** CRF quality (lower = better). Default `20`. */
  crf?: number;
  /** Encoding preset. Default `medium` (interpolation earns the quality). */
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

/** One resolved segment's source→output time mapping (for timeline reconciliation). */
export interface SpeedRampPlanSegment {
  srcStart: number;
  srcEnd: number;
  speed: number;
  /** Output duration of this segment = (srcEnd − srcStart) / speed. */
  outDuration: number;
}

export interface SpeedRampResult extends GeneratorResult {
  /** Per-segment source→output mapping, so a host can keep its timeline in sync. */
  segments: readonly SpeedRampPlanSegment[];
  /** Total output duration (sum of the stretched/compressed segments). */
  newDuration: number;
}
