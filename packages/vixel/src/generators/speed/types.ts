/**
 * Speed Adjustment Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface SpeedConfig extends BaseGeneratorConfig {
  /** Playback speed multiplier. 2 = twice as fast, 0.5 = half speed. Range 0.25–4.0. */
  speed: number;
  /**
   * Keep the original audio pitch (tempo-only change via `atempo`). Default `true`.
   * Set `false` for a tape-style effect where pitch rises/falls with speed.
   */
  maintainPitch?: boolean;
  /** Output video codec. Default `libx264`. */
  videoCodec?: 'libx264' | 'libx265';
  /** CRF quality (lower = better). Default `23`. */
  crf?: number;
  onProgress?: GeneratorProgressCallback;
}

export interface SpeedResult extends GeneratorResult {
  speed: number;
  originalDuration?: number;
  newDuration?: number;
}
