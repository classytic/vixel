/**
 * Video Probing Utilities
 * =======================
 * FFprobe wrapper for video metadata extraction.
 *
 * @module core/probe
 */

import ffmpeg from 'fluent-ffmpeg';

// =============================================================================
// Types
// =============================================================================

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  codec: string;
  audioCodec?: string;
  hasAudio: boolean;
}

// =============================================================================
// Probing Functions
// =============================================================================

/**
 * Probe video file for metadata
 *
 * @example
 * ```typescript
 * const meta = await probeVideo('./video.mp4');
 * console.log(`${meta.width}x${meta.height} @ ${meta.fps}fps`);
 * ```
 */
export async function probeVideo(inputPath: string, ffprobePath = 'ffprobe'): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath);
    if (ffprobePath) cmd.setFfprobePath(ffprobePath);

    cmd.ffprobe((err, data) => {
      if (err) return reject(new Error(`FFprobe failed: ${err.message}`));

      const video = data.streams.find(s => s.codec_type === 'video');
      if (!video) return reject(new Error('No video stream found'));

      const audio = data.streams.find(s => s.codec_type === 'audio');

      // Duration fallback for WebM files
      let duration = Number(data.format.duration || video.duration || 0);
      if (!duration && video.nb_frames && video.r_frame_rate) {
        const fps = parseFraction(video.r_frame_rate);
        const frames = parseInt(String(video.nb_frames));
        if (fps > 0 && frames > 0) duration = frames / fps;
      }

      resolve({
        duration,
        width: video.width || 0,
        height: video.height || 0,
        bitrate: Math.floor((data.format.bit_rate || 0) / 1000),
        fps: parseFraction(video.r_frame_rate || '0'),
        codec: video.codec_name || 'unknown',
        ...(audio?.codec_name && { audioCodec: audio.codec_name }),
        hasAudio: !!audio,
      });
    });
  });
}

function parseFraction(fraction: string): number {
  const [num, den] = fraction.split('/');
  return den ? parseFloat(num!) / parseFloat(den) : parseFloat(num!) || 0;
}

/**
 * Format duration as MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
