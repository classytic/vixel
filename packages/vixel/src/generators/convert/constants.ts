/**
 * Format Conversion Generator Constants
 */

import type { VideoFormat } from './types.js';

export const DEFAULT_CONVERT_CONFIG = {
  crf: 23,
  preset: 'medium' as const,
};

export const VALID_VIDEO_FORMATS: VideoFormat[] = ['mp4', 'webm', 'mov', 'avi'];

export interface FormatCodecs {
  videoCodec: string;
  audioCodec: string;
}

export const FORMAT_CODECS: Record<VideoFormat, FormatCodecs> = {
  'mp4': { videoCodec: 'libx264', audioCodec: 'aac' },
  'webm': { videoCodec: 'libvpx-vp9', audioCodec: 'libopus' },
  'mov': { videoCodec: 'libx264', audioCodec: 'aac' },
  'avi': { videoCodec: 'libx264', audioCodec: 'mp3' },
};

/**
 * Validates format configuration
 */
export function validateFormatConfig(format: VideoFormat): void {
  if (!VALID_VIDEO_FORMATS.includes(format)) {
    throw new Error(`Invalid video format: ${format}. Valid formats: ${VALID_VIDEO_FORMATS.join(', ')}`);
  }
}

/**
 * Get codecs for format
 */
export function getCodecsForFormat(format: VideoFormat): FormatCodecs {
  return FORMAT_CODECS[format];
}
