/**
 * Slideshow Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';
import type { KenBurnsDirection } from '../ken-burns/types.js';
import type { XfadeTransition } from '../transitions/types.js';

export interface Slide {
  /** Image path. */
  image: string;
  /** Seconds on screen (defaults to config.durationPer). */
  duration?: number;
  /** Ken Burns motion for this slide (defaults to an alternating in/out). */
  direction?: KenBurnsDirection;
}

export interface SlideshowConfig extends BaseGeneratorConfig {
  /** Default seconds per slide (default: 4). */
  durationPer?: number;
  /** Apply Ken Burns motion to each slide (default: true). */
  kenBurns?: boolean;
  /** Output width (default: 1920). */
  width?: number;
  /** Output height (default: 1080). */
  height?: number;
  /** Output fps (default: 30). */
  fps?: number;
  /** Transition between slides, or 'none' for hard cuts (default: 'fade'). */
  transition?: XfadeTransition | 'none';
  /** Transition duration in seconds (default: 0.5). */
  transitionDuration?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'medium'). */
  preset?: string;
  /** Progress callback (per-slide granularity). */
  onProgress?: GeneratorProgressCallback;
}

export interface SlideshowResult extends GeneratorResult {
  /** Number of slides rendered. */
  slideCount: number;
  /** Total output duration in seconds. */
  totalDuration: number;
}
