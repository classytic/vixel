/**
 * Transition Concat Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

/** Common ffmpeg xfade transition names. */
export type XfadeTransition =
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'circleopen'
  | 'circleclose'
  | 'smoothleft'
  | 'smoothright';

export interface TransitionConfig extends BaseGeneratorConfig {
  /** Transition style (default: 'fade'). */
  transition?: XfadeTransition;
  /** Transition duration in seconds (default: 0.5). */
  duration?: number;
  /** Crossfade audio between clips (default: true). Set false for silent clips. */
  audio?: boolean;
  /** Normalize every clip to this width before crossfading (xfade needs matching geometry). */
  width?: number;
  /** Normalize every clip to this height. */
  height?: number;
  /** Normalize every clip to this fps. */
  fps?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Output audio codec (default: 'aac'). */
  audioCodec?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface TransitionResult extends GeneratorResult {
  /** Number of clips joined. */
  clipCount: number;
  /** Transition used. */
  transition: XfadeTransition;
  /** Total output duration (sum of clips minus overlaps). */
  totalDuration: number;
}
