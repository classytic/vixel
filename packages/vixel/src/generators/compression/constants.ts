/**
 * Compression Generator Constants
 */

import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { VideoCodec, HardwareAccel, EncodingPreset, AudioCodec } from './types.js';

// execFile (NOT exec) — no shell, so a custom ffmpegPath can't inject commands.
const execFileAsync = promisify(execFile);

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_VIDEO_CODEC: VideoCodec = 'libx264';
export const DEFAULT_CRF = 23;           // Visually lossless
export const DEFAULT_PRESET: EncodingPreset = 'medium';
export const DEFAULT_AUDIO_CODEC: AudioCodec = 'aac';
export const DEFAULT_AUDIO_BITRATE = '128k';

// =============================================================================
// Hardware Encoder Mappings
// =============================================================================

export const HARDWARE_ENCODERS: Record<HardwareAccel, { h264: string; h265: string } | null> = {
  'none': null,
  'nvenc': { h264: 'h264_nvenc', h265: 'hevc_nvenc' },
  'qsv': { h264: 'h264_qsv', h265: 'hevc_qsv' },
  'vaapi': { h264: 'h264_vaapi', h265: 'hevc_vaapi' },
  'videotoolbox': { h264: 'h264_videotoolbox', h265: 'hevc_videotoolbox' },
};

// =============================================================================
// Hardware Acceleration Detection
// =============================================================================

/**
 * Check if hardware acceleration is available
 * This runs a quick FFmpeg encoder check
 */
export async function detectHardwareAccel(ffmpegPath: string): Promise<HardwareAccel[]> {
  const available: HardwareAccel[] = ['none'];

  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', '-encoders']);

    // Check for NVENC
    if (stdout.includes('h264_nvenc')) {
      available.push('nvenc');
    }

    // Check for Intel QSV
    if (stdout.includes('h264_qsv')) {
      available.push('qsv');
    }

    // Check for VideoToolbox (macOS)
    if (stdout.includes('h264_videotoolbox')) {
      available.push('videotoolbox');
    }

    // Check for VAAPI (Linux)
    if (stdout.includes('h264_vaapi')) {
      available.push('vaapi');
    }
  } catch {
    // If detection fails, just return none
  }

  return available;
}

/**
 * Get hardware encoder name for codec
 */
export function getHardwareEncoder(codec: VideoCodec, hwAccel: HardwareAccel): string | null {
  const hwMap = HARDWARE_ENCODERS[hwAccel];
  if (!hwMap) return null;

  const codecType = codec === 'libx265' ? 'h265' : 'h264';
  return hwMap[codecType];
}

// =============================================================================
// Encoder Args Builders
// =============================================================================

/**
 * Build video encoder args
 */
export function buildVideoEncoderArgs(
  codec: VideoCodec,
  hardwareAccel: HardwareAccel,
  crf: number,
  preset: EncodingPreset
): string[] {
  const args: string[] = [];

  // Hardware acceleration
  if (hardwareAccel !== 'none') {
    const hwEncoder = getHardwareEncoder(codec, hardwareAccel);
    if (hwEncoder) {
      args.push('-c:v', hwEncoder);
      // Hardware encoders use qp instead of crf
      args.push('-qp', String(crf));
      args.push('-preset', preset);
      return args;
    }
  }

  // Software encoding
  args.push('-c:v', codec);
  args.push('-crf', String(crf));
  args.push('-preset', preset);

  // Add faststart for web playback
  if (codec === 'libx264' || codec === 'libx265') {
    args.push('-movflags', '+faststart');
  }

  return args;
}

/**
 * Build audio encoder args
 */
export function buildAudioEncoderArgs(audioCodec: AudioCodec, audioBitrate: string): string[] {
  if (audioCodec === 'copy') {
    return ['-c:a', 'copy'];
  }

  return ['-c:a', audioCodec, '-b:a', audioBitrate];
}
