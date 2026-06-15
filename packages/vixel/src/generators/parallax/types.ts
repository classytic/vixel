/**
 * Parallax (2.5D) Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export type ParallaxMode = 'sway' | 'pan' | 'orbit';

export interface ParallaxConfig extends BaseGeneratorConfig {
  /** Clip length in seconds (required). */
  duration: number;
  /**
   * Grayscale depth map (same aspect as the image). Brighter = nearer; near
   * pixels shift more than far ones. Produce it with a depth model
   * (Depth Anything / MiDaS) — that estimation is the host's job.
   */
  depthMap: string;
  /** Max pixel displacement of the nearest depth (default: 12). */
  amplitude?: number;
  /** Seconds for one motion cycle (default: equal to `duration`). */
  period?: number;
  /** Motion style (default: 'sway'). */
  mode?: ParallaxMode;
  /** Output width (default: 1080). */
  width?: number;
  /** Output height (default: 1920). */
  height?: number;
  /** Output fps (default: 30). */
  fps?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'medium'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface ParallaxResult extends GeneratorResult {
  duration: number;
  dimensions: { width: number; height: number };
  mode: ParallaxMode;
}
