/**
 * Ken Burns Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export type KenBurnsDirection = 'in' | 'out' | 'left' | 'right' | 'up' | 'down';

export interface KenBurnsConfig extends BaseGeneratorConfig {
  /** Output clip length in seconds (required). */
  duration: number;
  /** Output width (default: 1920). */
  width?: number;
  /** Output height (default: 1080). */
  height?: number;
  /** Output frame rate (default: 30). */
  fps?: number;
  /** Motion (default: 'in' — slow zoom in). */
  direction?: KenBurnsDirection;
  /** Start zoom for 'in'/'out' (default: 1.0 for in, 1.2 for out). */
  startZoom?: number;
  /** End zoom for 'in'/'out' (default: 1.2 for in, 1.0 for out). */
  endZoom?: number;
  /** Constant zoom level for pan directions (default: 1.2). */
  panZoom?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'medium'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface KenBurnsResult extends GeneratorResult {
  /** Clip duration in seconds. */
  duration: number;
  /** Output dimensions. */
  dimensions: { width: number; height: number };
  /** Motion applied. */
  direction: KenBurnsDirection;
}
