/**
 * Audio Mix Generator
 * ===================
 * Layer a voiceover and/or background music onto a video, with optional
 * automatic ducking (music drops under speech via sidechain compression).
 *
 * @example
 * ```typescript
 * // Voiceover over ducked background music
 * await mixAudio(
 *   { inputPath: './visuals.mp4', duration: 30 },
 *   './final.mp4',
 *   { voiceover: './vo.mp3', music: './bed.mp3' }, // duck defaults on
 * );
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { AudioMixConfig, AudioMixResult } from './types.js';
import {
  DEFAULT_MUSIC_VOLUME_DUCKED,
  DEFAULT_MUSIC_VOLUME_FLAT,
  DEFAULT_VOICE_VOLUME,
  DEFAULT_DUCK_THRESHOLD,
  DEFAULT_DUCK_RATIO,
  buildAudioMixFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function mixAudio(
  source: VideoSource,
  outputPath: string,
  config: AudioMixConfig = {},
): Promise<AudioMixResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const { music, voiceover } = config;

  if (!music && !voiceover) {
    throw new VixelError('mixAudio requires at least one of `music` or `voiceover`', { code: ErrorCode.INVALID_CONFIG });
  }

  // Validate inputs exist (skipped in dry-run — no filesystem assumptions).
  if (!config.dryRun) {
    for (const p of [source.inputPath, music, voiceover].filter(Boolean) as string[]) {
      try {
        await fs.access(p);
      } catch {
        throw new VixelError(`Input not found: ${p}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  const keepOriginal = config.keepOriginalAudio ?? !voiceover;
  const duck = config.duck ?? Boolean(music && voiceover);
  const musicVolume = config.musicVolume ?? (duck ? DEFAULT_MUSIC_VOLUME_DUCKED : DEFAULT_MUSIC_VOLUME_FLAT);
  const voiceVolume = config.voiceVolume ?? DEFAULT_VOICE_VOLUME;
  const loopMusic = config.loopMusic ?? true;

  // Assemble ffmpeg inputs: 0 = video, then music / voiceover in a fixed order.
  const inputs: string[] = ['-i', normalize(source.inputPath)];
  const layers: Array<'video' | 'music' | 'voiceover'> = [];
  let musicPad: string | null = null;
  let voicePad: string | null = null;
  const extraPads: string[] = [];
  let idx = 1;

  if (music) {
    if (loopMusic) inputs.push('-stream_loop', '-1');
    inputs.push('-i', normalize(music));
    musicPad = `${idx}:a`;
    layers.push('music');
    idx++;
  }
  if (voiceover) {
    inputs.push('-i', normalize(voiceover));
    voicePad = `${idx}:a`;
    layers.push('voiceover');
    idx++;
  }

  // Decide the foreground voice that drives ducking.
  if (!voicePad && keepOriginal) {
    // Duck music under the video's own audio.
    voicePad = '0:a';
    layers.unshift('video');
  } else if (voicePad && keepOriginal) {
    // Keep the video's audio as a flat extra layer alongside the voiceover.
    extraPads.push('0:a');
    if (!layers.includes('video')) layers.unshift('video');
  }

  const { filterComplex, audioLabel } = buildAudioMixFilter({
    voicePad,
    musicPad,
    extraPads,
    musicVolume,
    voiceVolume,
    duck,
    threshold: config.duckThreshold ?? DEFAULT_DUCK_THRESHOLD,
    ratio: config.duckRatio ?? DEFAULT_DUCK_RATIO,
  });

  const args = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', audioLabel,
    '-c:v', 'copy', // never re-encode video — render-efficient
    '-c:a', config.audioCodec ?? 'aac',
    '-shortest',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return {
    outputPath,
    fileSize,
    processingTime: Date.now() - startTime,
    ducked: duck && Boolean(musicPad && voicePad),
    layers,
  };
}
