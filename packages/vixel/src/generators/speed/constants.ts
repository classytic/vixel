/**
 * Speed Adjustment Generator Constants
 */

export const DEFAULT_SPEED_CONFIG = {
  // Preserve pitch by default — the natural expectation for a speed ramp.
  // Set `maintainPitch: false` for a tape-style pitch shift.
  maintainPitch: true,
  videoCodec: 'libx264' as const,
  crf: 23,
};

export const MIN_SPEED = 0.25;  // 4x slower
export const MAX_SPEED = 4.0;   // 4x faster

/**
 * Validates speed configuration
 */
export function validateSpeedConfig(speed: number): void {
  if (speed <= 0) {
    throw new Error('Speed must be greater than 0');
  }

  if (speed < MIN_SPEED) {
    throw new Error(`Speed too slow (min: ${MIN_SPEED}x)`);
  }

  if (speed > MAX_SPEED) {
    throw new Error(`Speed too fast (max: ${MAX_SPEED}x)`);
  }
}
