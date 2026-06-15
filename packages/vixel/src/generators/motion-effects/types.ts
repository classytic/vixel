/**
 * Motion Effects Generator Types
 * ==============================
 * Trending in-filter "energy" effects (glitch, camera shake, RGB split, zoom
 * punch). doc-portal-be defers these to a per-frame canvas overlay; vixel does
 * them as pure ffmpeg filters — faster and composable.
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

/** The supported in-filter effects. Intent-level — no ffmpeg in the public name. */
export type MotionEffect = 'glitch' | 'shake' | 'rgb-split' | 'zoom-punch';

export interface MotionEffectConfig extends BaseGeneratorConfig {
  /** Which effect to apply. */
  effect: MotionEffect;
  /** Strength 0–1 (default `0.5`). Scales shift px / shake amplitude / zoom pulse. */
  intensity?: number;
  /** Frame rate driving `zoom-punch` rhythm (default: source fps, else 30). */
  fps?: number;
  /** Output video codec (default `libx264`). */
  videoCodec?: 'libx264' | 'libx265';
  /** CRF quality (default `20`). */
  crf?: number;
  /** Encoding preset (default `fast`). */
  preset?: string;
  onProgress?: GeneratorProgressCallback;
}

export interface MotionEffectResult extends GeneratorResult {
  effect: MotionEffect;
  intensity: number;
}
