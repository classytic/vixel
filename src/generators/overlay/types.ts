/**
 * Overlay Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

/** Blend mode for compositing the overlay over the base. */
export type OverlayBlend = 'screen' | 'lighten' | 'addition';

export interface OverlayConfig extends BaseGeneratorConfig {
  /** Path to the overlay clip (light leak / particles / bokeh / flare). */
  overlayPath: string;
  /** Blend mode (default: 'screen' — right for black-background overlays). */
  blend?: OverlayBlend;
  /** Overlay opacity 0-1 (default: 0.5). */
  opacity?: number;
  /** Base width (defaults to source.width, else probed). */
  width?: number;
  /** Base height (defaults to source.height, else probed). */
  height?: number;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface OverlayResult extends GeneratorResult {
  blend: OverlayBlend;
}
