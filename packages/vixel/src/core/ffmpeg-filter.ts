/**
 * Generic FFmpeg Filter Application
 * ==================================
 * Low-level building block for ANY FFmpeg operation
 *
 * This is the foundation that enables infinite possibilities:
 * - Custom transitions
 * - Advanced color grading
 * - Complex compositing
 * - Green screen effects
 * - Motion tracking
 * - Literally anything FFmpeg can do
 *
 * @example
 * ```typescript
 * // Simple filter
 * await applyFFmpegFilter(source, 'output.mp4', {
 *   videoFilter: 'scale=1920:1080,eq=contrast=1.2'
 * });
 *
 * // Complex multi-input compositing
 * await applyFFmpegFilter(
 *   [video1, video2, logo],
 *   'output.mp4',
 *   {
 *     complexFilter: `
 *       [0:v]scale=1920:1080[main];
 *       [1:v]scale=480:270[pip];
 *       [2:v]scale=iw*0.2:-1[logo];
 *       [main][pip]overlay=W-w-10:H-h-10[tmp];
 *       [tmp][logo]overlay=10:10
 *     `,
 *     maps: ['[tmp]', '0:a']
 *   }
 * );
 * ```
 */

import { stat } from 'node:fs/promises';
import type { VideoSource } from '../types/generators.js';
import type {
  FFmpegFilterConfig,
  FFmpegFilterResult,
  FFmpegProgress,
} from '../types/building-blocks.js';
import { logger, OperationValidator } from './logger.js';
import { spawnFFmpeg, buildCommandString } from './ffmpeg-spawn.js';
import { outputSize } from './temp-manager.js';

/**
 * Apply generic FFmpeg filter(s) to video
 *
 * This is a low-level primitive that enables any FFmpeg operation.
 * Use high-level generators when possible, use this for custom effects.
 */
export async function applyFFmpegFilter(
  source: VideoSource | VideoSource[],
  outputPath: string,
  config: FFmpegFilterConfig
): Promise<FFmpegFilterResult> {
  const startTime = Date.now();
  const sources = Array.isArray(source) ? source : [source];

  logger.info(`Applying FFmpeg filter to ${sources.length} input(s)`);

  // Validation warnings
  const warnings: any[] = [];
  for (const src of sources) {
    try {
      const stats = await stat(src.inputPath);
      warnings.push(...OperationValidator.validateFileSize(stats.size, 'filter'));
    } catch {}

    if (src.duration) {
      warnings.push(...OperationValidator.validateDuration(src.duration, 'filter'));
    }
  }
  OperationValidator.logWarnings(warnings);

  const ffmpegPath = config.ffmpegPath || 'ffmpeg';

  // Build command
  const args: string[] = [];

  // Global options
  if (config.globalOptions) {
    args.push(...config.globalOptions);
  }

  // Add inputs
  sources.forEach(src => {
    args.push('-i', src.inputPath);
  });

  // Additional inputs
  if (config.inputs) {
    config.inputs.forEach(input => {
      if (input.format) {
        args.push('-f', input.format);
      }
      if (input.options) {
        args.push(...input.options);
      }
      args.push('-i', input.path);
    });
  }

  // Filters
  if (config.complexFilter) {
    logger.debug('Using complex filter graph');
    args.push('-filter_complex', config.complexFilter.trim());
  } else {
    if (config.videoFilter) {
      logger.debug(`Video filter: ${config.videoFilter}`);
      args.push('-vf', config.videoFilter);
    }
    if (config.audioFilter) {
      logger.debug(`Audio filter: ${config.audioFilter}`);
      args.push('-af', config.audioFilter);
    }
  }

  // Stream mapping
  if (config.maps) {
    config.maps.forEach(map => {
      args.push('-map', map);
    });
  }

  // Codecs
  const videoCodec = config.videoCodec || 'libx264';
  const audioCodec = config.audioCodec || 'aac';

  if (!config.complexFilter || !config.maps) {
    args.push('-c:v', videoCodec);
    args.push('-c:a', audioCodec);
  }

  // Quality
  if (config.crf !== undefined) {
    args.push('-crf', String(config.crf));
  }

  // Preset
  if (config.preset) {
    args.push('-preset', config.preset);
  }

  // Custom arguments (escape hatch)
  if (config.customArgs) {
    logger.debug('Using custom FFmpeg arguments');
    args.push(...config.customArgs);
  }

  // Output
  args.push('-y', outputPath);

  const command = buildCommandString(ffmpegPath, args);
  logger.debug(`FFmpeg command: ${command}`);

  // Execute via the shared spawn utility — gains timeout, AbortSignal,
  // dry-run, command capture, and consistent FFmpegError handling.
  // Rich progress (fps/speed/bitrate) is parsed here via the onStderr hook.
  let lastProgress: FFmpegProgress | null = null;
  await spawnFFmpeg(ffmpegPath, args, {
    timeout: config.timeout,
    signal: config.signal,
    dryRun: config.dryRun,
    onCommand: config.onCommand,
    onStderr: config.onProgress
      ? (text) => {
          const progress = parseFFmpegProgress(text, sources[0]?.duration || 0);
          if (progress && (!lastProgress || progress.currentTime !== lastProgress.currentTime)) {
            lastProgress = progress;
            config.onProgress!(progress);
          }
        }
      : undefined,
  });

  // Get output stats
  const fileSize = await outputSize(outputPath, config.dryRun);
  const processingTime = Date.now() - startTime;

  logger.info(`Filter applied successfully in ${(processingTime / 1000).toFixed(2)}s`);

  return {
    outputPath,
    fileSize,
    processingTime,
    videoCodec,
    audioCodec,
    command,
  };
}

/**
 * Parse FFmpeg progress from stderr output
 */
function parseFFmpegProgress(text: string, duration: number): FFmpegProgress | null {
  // FFmpeg progress format:
  // frame=  123 fps= 45 q=28.0 size=    1024kB time=00:00:05.12 bitrate=1638.4kbits/s speed=1.23x

  const frameMatch = text.match(/frame=\s*(\d+)/);
  const fpsMatch = text.match(/fps=\s*([\d.]+)/);
  const timeMatch = text.match(/time=(\d+):(\d+):([\d.]+)/);
  const bitrateMatch = text.match(/bitrate=\s*([\d.]+\w+\/s)/);
  const speedMatch = text.match(/speed=\s*([\d.]+)x/);

  if (!timeMatch || !timeMatch[1] || !timeMatch[2] || !timeMatch[3]) return null;

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseFloat(timeMatch[3]);
  const currentTime = hours * 3600 + minutes * 60 + seconds;

  const percent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return {
    percent,
    currentTime,
    duration,
    fps: fpsMatch?.[1] ? parseFloat(fpsMatch[1]) : 0,
    speed: speedMatch?.[1] ? parseFloat(speedMatch[1]) : 0,
    frame: frameMatch?.[1] ? parseInt(frameMatch[1], 10) : 0,
    bitrate: bitrateMatch?.[1] || '0',
  };
}
