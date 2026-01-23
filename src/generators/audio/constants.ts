/**
 * Audio Generator Constants
 */

import type { AudioFormat } from './types.js';

export const DEFAULT_AUDIO_CONFIG = {
  format: 'mp3' as AudioFormat,
  bitrate: '192k',
};

export const VALID_AUDIO_FORMATS: AudioFormat[] = ['mp3', 'aac', 'wav', 'opus', 'flac'];

export const AUDIO_CODEC_MAP: Record<AudioFormat, string> = {
  'mp3': 'libmp3lame',
  'aac': 'aac',
  'wav': 'pcm_s16le',
  'opus': 'libopus',
  'flac': 'flac',
};

/**
 * Validates audio configuration
 */
export function validateAudioFormat(format: AudioFormat): void {
  if (!VALID_AUDIO_FORMATS.includes(format)) {
    throw new Error(`Invalid audio format: ${format}. Valid formats: ${VALID_AUDIO_FORMATS.join(', ')}`);
  }
}

export function validateVolume(volume: number): void {
  if (volume <= 0) {
    throw new Error('Volume must be greater than 0');
  }
  if (volume > 10) {
    throw new Error('Volume cannot exceed 10 (1000%)');
  }
}
