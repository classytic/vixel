/**
 * Trim/Clip Generator Constants
 */

export const DEFAULT_TRIM_CONFIG = {
  accurate: false,
  videoCodec: 'copy' as const,
  crf: 23,
};

export const VALID_VIDEO_CODECS = ['copy', 'libx264', 'libx265'] as const;

/**
 * Validates trim configuration
 */
export function validateTrimConfig(start: number, end: number | undefined, duration: number): void {
  if (start < 0) {
    throw new Error('Start time cannot be negative');
  }

  if (start >= duration) {
    throw new Error(`Start time (${start}s) exceeds video duration (${duration}s)`);
  }

  if (end !== undefined) {
    if (end <= start) {
      throw new Error(`End time (${end}s) must be greater than start time (${start}s)`);
    }

    if (end > duration) {
      throw new Error(`End time (${end}s) exceeds video duration (${duration}s)`);
    }
  }
}
