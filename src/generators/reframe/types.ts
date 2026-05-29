/**
 * Reframe Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export type ReframeAspect = '9:16' | '1:1' | '16:9' | '4:5' | '4:3';
export type ReframeMode = 'blur-pad' | 'crop' | 'pad';

export interface ReframeConfig extends BaseGeneratorConfig {
  /** Target aspect ratio preset (default: '9:16'). Ignored if width+height given. */
  aspect?: ReframeAspect;
  /** Explicit target width (overrides `aspect`). */
  width?: number;
  /** Explicit target height (overrides `aspect`). */
  height?: number;
  /**
   * How to fill the frame (default: 'blur-pad'):
   *  - 'blur-pad' — fit the video, fill bars with a blurred zoomed copy
   *  - 'crop'     — zoom + crop to fill (loses edges)
   *  - 'pad'      — fit the video, fill bars with a solid color
   */
  mode?: ReframeMode;
  /** Boxblur strength for 'blur-pad' (default: 20). */
  blur?: number;
  /** Background color for 'pad' (default: 'black'). */
  background?: string;
  /** Output video codec (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface ReframeResult extends GeneratorResult {
  /** Output dimensions. */
  dimensions: { width: number; height: number };
  /** Mode used. */
  mode: ReframeMode;
}
