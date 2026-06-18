/**
 * Smart Reframe Generator Types
 * =============================
 * Subject-tracked aspect change (e.g. 16:9 → 9:16) for auto-shorts. The TRACK
 * comes from prism-gpu's RVM matte (subject centre over time); vixel renders the
 * panning crop. Multi-speaker (which face is talking) is a later, face-detection
 * concern — v1 follows one subject.
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

/** One sample of where the subject is, normalized 0..1 (from prism-gpu). */
export interface SubjectTrackPoint {
  /** Seconds from clip start. */
  t: number;
  /** Subject centre X, normalized 0..1. */
  cx: number;
  /** Subject centre Y, normalized 0..1 (used only for vertical-pan reframes). */
  cy?: number;
}

export interface SmartReframeConfig extends BaseGeneratorConfig {
  /** Where the subject is over time (prism-gpu `/subject-track`). Empty = centre crop. */
  track: SubjectTrackPoint[];
  /** Target aspect (default 9:16 vertical). */
  aspect?: { w: number; h: number };
  /** Output width (default 1080); height derived from `aspect`. */
  width?: number;
  /** Smoothing window in seconds for the pan (default 0.6). */
  smoothing?: number;
  /** Center deadzone (fraction of frame) the subject drifts within before the crop pans (default 0.05). Higher = steadier. */
  deadzone?: number;
  /** Seconds between compiled keyframes (default 0.25). */
  sampleInterval?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

export interface SmartReframeResult extends GeneratorResult {
  width: number;
  height: number;
}
