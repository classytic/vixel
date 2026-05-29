/**
 * Frame Extraction Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export type FrameFormat = 'png' | 'jpg' | 'webp';

export interface FrameConfig extends BaseGeneratorConfig {
  /** Output image format (default: 'png'). */
  format?: FrameFormat;
  /** Scale the frame to this width (height auto, aspect kept). */
  width?: number;
  /** JPEG/WebP quality 1-100 (default: 90). */
  quality?: number;
}

export interface FrameResult extends GeneratorResult {
  /** The timestamp (seconds) the frame was taken from. */
  timestamp: number;
  /** Image format produced. */
  format: FrameFormat;
}
