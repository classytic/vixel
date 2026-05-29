/**
 * Audio Mix Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export interface AudioMixConfig extends BaseGeneratorConfig {
  /** Background music track path. */
  music?: string;
  /** Voiceover track path. When present, music ducks under it (if `duck`). */
  voiceover?: string;
  /** Keep the video's existing audio in the mix (default: false when a voiceover is supplied, true otherwise). */
  keepOriginalAudio?: boolean;
  /** Music gain, 0-1+ (default: 0.25 when ducking, else 1.0). */
  musicVolume?: number;
  /** Voiceover gain, 0-1+ (default: 1.0). */
  voiceVolume?: number;
  /** Duck the music under the foreground voice via sidechain compression (default: true when both music + a voice are present). */
  duck?: boolean;
  /** Sidechain compressor threshold, 0-1 (default: 0.03 — lower ducks more aggressively). */
  duckThreshold?: number;
  /** Sidechain compressor ratio (default: 8). */
  duckRatio?: number;
  /** Loop the music to cover the whole video (default: true). */
  loopMusic?: boolean;
  /** Output audio codec (default: 'aac'). */
  audioCodec?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface AudioMixResult extends GeneratorResult {
  /** Whether ducking was applied. */
  ducked: boolean;
  /** Which sources were mixed. */
  layers: Array<'video' | 'music' | 'voiceover'>;
}
