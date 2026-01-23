/**
 * Concatenation Generator Constants
 */

export const DEFAULT_CONCAT_CONFIG = {
  method: 'auto' as const,
  videoCodec: 'libx264' as const,
  crf: 23,
  targetWidth: 1920,
  targetHeight: 1080,
};

/**
 * Validates concatenation configuration
 */
export function validateConcatConfig(fileCount: number): void {
  if (fileCount < 2) {
    throw new Error('Concatenation requires at least 2 files');
  }

  if (fileCount > 100) {
    throw new Error('Too many files for concatenation (max: 100). Process in batches.');
  }
}
