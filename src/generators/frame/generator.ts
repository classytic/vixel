/**
 * Frame Extraction Generator
 * ==========================
 * Extract a single frame at an exact timestamp. A focused primitive for
 * keyframe export, end-frame capture (continuity), and storyboard stills.
 *
 * @example
 * ```typescript
 * await extractFrameAt({ inputPath: './shot.mp4', duration: 8 }, 7.9, './end.png');
 * ```
 */

import { promises as fs } from 'node:fs';
import { normalize } from 'node:path';
import type { VideoSource } from '../../types/generators.js';
import type { FrameConfig, FrameResult } from './types.js';
import { spawnFFmpeg, configToSpawnOptions } from '../../core/ffmpeg-spawn.js';
import { outputSize } from '../../core/temp-manager.js';
import { VixelError, ErrorCode } from '../../errors.js';

export async function extractFrameAt(
  source: VideoSource,
  timestamp: number,
  outputPath: string,
  config: FrameConfig = {},
): Promise<FrameResult> {
  const startTime = Date.now();
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const format = config.format ?? 'png';

  if (timestamp < 0) {
    throw new VixelError('timestamp must be >= 0', { code: ErrorCode.INVALID_CONFIG });
  }
  if (source.duration > 0 && timestamp > source.duration) {
    throw new VixelError(`timestamp ${timestamp}s exceeds duration ${source.duration}s`, { code: ErrorCode.INVALID_CONFIG });
  }

  if (!config.dryRun) {
    try {
      await fs.access(source.inputPath);
    } catch {
      throw new VixelError(`Input not found: ${source.inputPath}`, { code: ErrorCode.INVALID_INPUT });
    }
  }

  const args = [
    '-ss', String(timestamp), // fast seek before input
    '-i', normalize(source.inputPath),
    '-frames:v', '1',
    ...(config.width ? ['-vf', `scale=${config.width}:-1`] : []),
    ...(format === 'jpg'
      ? ['-q:v', String(Math.max(1, Math.round(31 - ((config.quality ?? 90) / 100) * 30)))]
      : format === 'webp'
        ? ['-quality', String(config.quality ?? 90)]
        : []),
    '-y',
    normalize(outputPath),
  ];

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config));

  const fileSize = await outputSize(outputPath, config.dryRun);
  return { outputPath, fileSize, processingTime: Date.now() - startTime, timestamp, format };
}
