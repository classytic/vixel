/**
 * Speed Adjustment Generator Types
 */

import type { BaseGeneratorConfig, GeneratorResult } from '../../types/generators.js';

export interface SpeedConfig extends BaseGeneratorConfig {
  speed: number;  // 0.5 = half speed, 2.0 = double speed
  maintainPitch?: boolean;  // Keep audio pitch (default: false)
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;  // Quality (default: 23)
}

export interface SpeedResult extends GeneratorResult {
  speed: number;
  originalDuration?: number;
  newDuration?: number;
}
