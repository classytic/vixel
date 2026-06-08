/**
 * Caption Burn-in Generator
 * =========================
 * Burn an .srt/.ass subtitle file, or overlay a single styled text block,
 * directly into the video pixels.
 *
 * @example
 * ```typescript
 * await burnCaptions({ inputPath: './in.mp4', duration: 30 }, './out.mp4', {
 *   subtitlePath: './captions.srt',
 *   forceStyle: 'Fontsize=30,Outline=2',
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { CaptionConfig, CaptionResult } from './types.js';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_COLOR,
  DEFAULT_OUTLINE_WIDTH,
  DEFAULT_OUTLINE_COLOR,
  buildSubtitlesFilter,
  buildDrawtextFilter,
} from './constants.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function burnCaptions(
  source: VideoSource,
  outputPath: string,
  config: CaptionConfig,
): Promise<CaptionResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';

  if (!config.subtitlePath && !config.text) {
    throw new VixelError('burnCaptions requires `subtitlePath` or `text`', { code: ErrorCode.INVALID_CONFIG });
  }

  const mode: 'subtitles' | 'text' = config.subtitlePath ? 'subtitles' : 'text';

  if (!config.dryRun) {
    for (const p of [source.inputPath, config.subtitlePath].filter(Boolean) as string[]) {
      try {
        await fs.access(p);
      } catch {
        throw new VixelError(`Input not found: ${p}`, { code: ErrorCode.INVALID_INPUT });
      }
    }
  }

  const filter =
    mode === 'subtitles'
      ? buildSubtitlesFilter(config.subtitlePath!, config.forceStyle)
      : buildDrawtextFilter({
          text: config.text!,
          fontSize: config.fontSize ?? DEFAULT_FONT_SIZE,
          fontColor: config.fontColor ?? DEFAULT_FONT_COLOR,
          outlineWidth: config.outlineWidth ?? DEFAULT_OUTLINE_WIDTH,
          outlineColor: config.outlineColor ?? DEFAULT_OUTLINE_COLOR,
          position: config.position ?? 'bottom',
          fontFile: config.fontFile,
        });

  // Burning into pixels requires a video re-encode; audio is copied.
  const args = [
    '-i', normalize(source.inputPath),
    '-vf', filter,
    '-c:v', config.videoCodec ?? 'libx264',
    '-crf', String(config.crf ?? 20),
    '-preset', config.preset ?? 'fast',
    '-c:a', 'copy',
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, mode };
}
