/**
 * HLS Codec Compatibility
 * =======================
 * Single source of truth for codec detection and HLS compatibility.
 *
 * Based on:
 * - HLS specification (RFC 8216)
 * - Apple HLS Authoring Specification 2024
 * - Industry standards (YouTube, Netflix, TikTok)
 *
 * @module core/codecs
 */

// =============================================================================
// HLS-Compatible Codecs (can be muxed into MPEG-TS without transcoding)
// =============================================================================

export const HLS_VIDEO_CODECS = ['h264', 'avc', 'avc1', 'hevc', 'h265', 'hvc1', 'hev1'] as const;
export const HLS_AUDIO_CODECS = ['aac', 'mp4a', 'mp3', 'ac3', 'eac3', 'ec3'] as const;

// =============================================================================
// Incompatible Codecs (require transcoding to H.264/AAC)
// =============================================================================

export const WEBM_VIDEO_CODECS = ['vp9', 'vp8', 'av1', 'av01'] as const;
export const WEBM_AUDIO_CODECS = ['opus', 'vorbis'] as const;

// =============================================================================
// Codec Detection Functions
// =============================================================================

/**
 * Check if video codec is HLS-compatible
 */
export function isHLSVideoCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  return HLS_VIDEO_CODECS.some(hls => c.includes(hls));
}

/**
 * Check if audio codec is HLS-compatible
 */
export function isHLSAudioCodec(codec: string | null | undefined): boolean {
  if (!codec) return true; // Silent video is compatible
  const c = codec.toLowerCase();
  return HLS_AUDIO_CODECS.some(hls => c.includes(hls));
}

/**
 * Check full codec compatibility for HLS streaming
 *
 * @example
 * ```typescript
 * const { canCopy, reason } = checkHLSCompatibility('h264', 'aac');
 * // { canCopy: true, video: true, audio: true }
 *
 * const result = checkHLSCompatibility('vp9', 'opus');
 * // { canCopy: false, video: false, audio: false, reason: '...' }
 * ```
 */
export function checkHLSCompatibility(videoCodec: string, audioCodec?: string | null): HLSCompatibility {
  const video = isHLSVideoCodec(videoCodec);
  const audio = isHLSAudioCodec(audioCodec);
  const canCopy = video && audio;

  return {
    canCopy,
    video,
    audio,
    videoCodec,
    audioCodec: audioCodec ?? null,
    reason: canCopy ? undefined : buildIncompatibilityReason(videoCodec, audioCodec, video, audio),
  };
}

function buildIncompatibilityReason(
  videoCodec: string,
  audioCodec: string | null | undefined,
  videoOk: boolean,
  audioOk: boolean
): string {
  const issues: string[] = [];
  if (!videoOk) issues.push(`video "${videoCodec}" requires H.264/HEVC`);
  if (!audioOk) issues.push(`audio "${audioCodec}" requires AAC/MP3`);
  return issues.join('; ');
}

// =============================================================================
// Types
// =============================================================================

export interface HLSCompatibility {
  /** Can use codec copy (no transcoding needed) */
  canCopy: boolean;
  /** Video codec is HLS-compatible */
  video: boolean;
  /** Audio codec is HLS-compatible */
  audio: boolean;
  /** Source video codec */
  videoCodec: string;
  /** Source audio codec */
  audioCodec: string | null;
  /** Reason if incompatible */
  reason: string | undefined;
}
