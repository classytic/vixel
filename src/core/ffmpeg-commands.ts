/**
 * FFmpeg Command Reference
 * =========================
 * Centralized FFmpeg command builders with proper documentation
 * Easy reference for debugging and maintenance
 */

import { logger } from './logger.js';

export interface FFmpegCommandBuilder {
  operation: string;
  buildArgs: (...args: unknown[]) => string[];
  description: string;
  example?: string;
}

/**
 * Trim/Clip Commands
 */
export const TRIM_COMMANDS = {
  /**
   * Fast trim with codec copy (no re-encoding)
   * Use when exact frame accuracy is not required
   */
  fastTrim: (inputPath: string, outputPath: string, start: number, duration: number): string[] => {
    logger.debug(`Building fast trim command: start=${start}s, duration=${duration}s`);
    return [
      '-ss', String(start),           // Seek to start (fast, before input)
      '-i', inputPath,
      '-t', String(duration),         // Duration
      '-c', 'copy',                   // Copy codecs (no re-encode)
      '-avoid_negative_ts', 'make_zero',
      '-y', outputPath,
    ];
  },

  /**
   * Accurate trim with re-encoding
   * Use when exact frame accuracy is required
   */
  accurateTrim: (inputPath: string, outputPath: string, start: number, duration: number, codec: string, crf: number): string[] => {
    logger.debug(`Building accurate trim command: start=${start}s, duration=${duration}s`);
    return [
      '-i', inputPath,
      '-ss', String(start),           // Seek after input (accurate)
      '-t', String(duration),
      '-c:v', codec,
      '-crf', String(crf),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', outputPath,
    ];
  },
};

/**
 * Audio Commands
 */
export const AUDIO_COMMANDS = {
  /**
   * Extract audio from video
   */
  extractAudio: (inputPath: string, outputPath: string, format: string, bitrate: string): string[] => {
    logger.debug(`Building audio extraction command: format=${format}, bitrate=${bitrate}`);

    const codecMap: Record<string, string> = {
      'mp3': 'libmp3lame',
      'aac': 'aac',
      'wav': 'pcm_s16le',
      'opus': 'libopus',
      'flac': 'flac',
    };

    return [
      '-i', inputPath,
      '-vn',                          // No video
      '-c:a', codecMap[format] || 'aac',
      '-b:a', bitrate,
      '-y', outputPath,
    ];
  },

  /**
   * Replace audio in video
   */
  replaceAudio: (videoPath: string, audioPath: string, outputPath: string): string[] => {
    logger.debug('Building audio replacement command');
    return [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',                 // Copy video
      '-c:a', 'aac',                  // Re-encode audio
      '-map', '0:v:0',                // Video from first input
      '-map', '1:a:0',                // Audio from second input
      '-shortest',                    // Match shortest stream
      '-y', outputPath,
    ];
  },

  /**
   * Adjust volume
   */
  adjustVolume: (inputPath: string, outputPath: string, volume: number): string[] => {
    logger.debug(`Building volume adjustment command: volume=${volume}`);
    return [
      '-i', inputPath,
      '-filter:a', `volume=${volume}`,
      '-c:v', 'copy',                 // Don't re-encode video
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', outputPath,
    ];
  },

  /**
   * Normalize audio levels
   */
  normalizeAudio: (inputPath: string, outputPath: string): string[] => {
    logger.debug('Building audio normalization command');
    return [
      '-i', inputPath,
      '-filter:a', 'loudnorm',        // EBU R128 loudness normalization
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', outputPath,
    ];
  },
};

/**
 * Concatenation Commands
 */
export const CONCAT_COMMANDS = {
  /**
   * Simple concat (same codec, same resolution)
   */
  simpleConcat: (concatFilePath: string, outputPath: string): string[] => {
    logger.debug('Building simple concat command');
    return [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFilePath,
      '-c', 'copy',                   // No re-encoding
      '-y', outputPath,
    ];
  },

  /**
   * Complex concat with re-encoding (different codecs/resolutions)
   */
  complexConcat: (inputs: string[], outputPath: string, width: number, height: number): string[] => {
    logger.debug(`Building complex concat command: ${inputs.length} inputs`);

    // Build filter complex for scaling and concatenation
    const filterParts: string[] = [];
    inputs.forEach((_, i) => {
      filterParts.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
    });
    const concatFilter = inputs.map((_, i) => `[v${i}]`).join('') + `concat=n=${inputs.length}:v=1:a=0[outv]`;
    const fullFilter = filterParts.join(';') + ';' + concatFilter;

    const args: string[] = [];
    inputs.forEach(input => {
      args.push('-i', input);
    });

    args.push(
      '-filter_complex', fullFilter,
      '-map', '[outv]',
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'medium',
      '-y', outputPath
    );

    return args;
  },
};

/**
 * Speed Adjustment Commands
 */
export const SPEED_COMMANDS = {
  /**
   * Change video speed
   */
  changeSpeed: (inputPath: string, outputPath: string, speed: number): string[] => {
    logger.debug(`Building speed change command: speed=${speed}x`);

    // Calculate PTS (presentation timestamp) multiplier
    const pts = 1 / speed;

    // Calculate audio tempo
    const atempo = speed;

    // Build atempo filter (max 2.0, so chain if needed)
    let atempoFilter = '';
    if (atempo <= 0.5) {
      atempoFilter = `atempo=0.5,atempo=${atempo / 0.5}`;
    } else if (atempo <= 2.0) {
      atempoFilter = `atempo=${atempo}`;
    } else {
      atempoFilter = `atempo=2.0,atempo=${atempo / 2.0}`;
    }

    return [
      '-i', inputPath,
      '-filter:v', `setpts=${pts}*PTS`,
      '-filter:a', atempoFilter,
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'medium',
      '-c:a', 'aac',
      '-y', outputPath,
    ];
  },
};

/**
 * Format Conversion Commands
 */
export const FORMAT_COMMANDS = {
  /**
   * Convert to WebM
   */
  toWebM: (inputPath: string, outputPath: string, crf: number): string[] => {
    logger.debug('Building WebM conversion command');
    return [
      '-i', inputPath,
      '-c:v', 'libvpx-vp9',
      '-crf', String(crf),
      '-b:v', '0',                    // Constant quality mode
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-y', outputPath,
    ];
  },

  /**
   * Convert to MP4
   */
  toMP4: (inputPath: string, outputPath: string, crf: number): string[] => {
    logger.debug('Building MP4 conversion command');
    return [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',      // Web-optimized
      '-y', outputPath,
    ];
  },

  /**
   * Convert to MOV
   */
  toMOV: (inputPath: string, outputPath: string, crf: number): string[] => {
    logger.debug('Building MOV conversion command');
    return [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', outputPath,
    ];
  },
};

/**
 * Utility: Log command for debugging
 */
export function logFFmpegCommand(ffmpegPath: string, args: string[], operation: string): void {
  const command = `${ffmpegPath} ${args.join(' ')}`;
  logger.debug(`FFmpeg command for ${operation}:`);
  logger.debug(command);
}
