/**
 * GIF Generator Constants
 * ========================
 * FFmpeg command templates and default values.
 */

// =============================================================================
// Default Values
// =============================================================================

/** Default output width in pixels */
export const DEFAULT_GIF_WIDTH = 480;

/** Default frame rate */
export const DEFAULT_GIF_FPS = 15;

/** Default optimization strategy */
export const DEFAULT_GIF_OPTIMIZATION = 'quality' as const;

/** Maximum GIF duration in seconds (for safety) */
export const MAX_GIF_DURATION = 30;

/** Default WebP quality (0-100) */
export const DEFAULT_WEBP_QUALITY = 80;

// =============================================================================
// FFmpeg Filter Strings
// =============================================================================

/**
 * Two-pass palette generation filter (first pass)
 * Creates optimal 256-color palette from video frames
 *
 * @param width - Output width
 * @param fps - Target frame rate
 */
export const PALETTE_FILTER = (width: number, fps: number): string =>
  `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`;

/**
 * Two-pass GIF encoding filter (second pass)
 * Uses generated palette for high-quality dithering
 *
 * @param width - Output width
 * @param fps - Target frame rate
 */
export const GIF_ENCODE_FILTER = (width: number, fps: number): string =>
  `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=floyd_steinberg`;

/**
 * Single-pass GIF filter (fast mode)
 * Lower quality but faster processing
 *
 * @param width - Output width
 * @param fps - Target frame rate
 */
export const GIF_FAST_FILTER = (width: number, fps: number): string =>
  `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

/**
 * WebP encoding filter
 *
 * @param width - Output width
 * @param fps - Target frame rate
 */
export const WEBP_FILTER = (width: number, fps: number): string =>
  `fps=${fps},scale=${width}:-1:flags=lanczos`;

// =============================================================================
// FFmpeg Command Templates
// =============================================================================

/**
 * FFmpeg arguments for palette generation (first pass)
 */
export const FFMPEG_PALETTE_ARGS = {
  /** Output format: image2 for single frame */
  format: 'image2',
  /** Single frame output */
  frames: '1',
  /** Palette output filename */
  output: 'palette.png',
} as const;

/**
 * FFmpeg arguments for GIF encoding (second pass)
 */
export const FFMPEG_GIF_ARGS = {
  /** Loop forever */
  loop: '0',
  /** Infinite loop count */
  loopInfinite: '0',
} as const;

/**
 * FFmpeg arguments for WebP encoding
 */
export const FFMPEG_WEBP_ARGS = {
  /** WebP codec */
  codec: 'libwebp_anim',
  /** Preset for animation */
  preset: 'drawing',
  /** Compression level (0-6, higher = better compression) */
  compression: '4',
} as const;

// =============================================================================
// File Size Estimation
// =============================================================================

/**
 * Approximate bytes per frame at different widths
 * Used for file size estimation before encoding
 */
export const BYTES_PER_FRAME: Record<number, number> = {
  240: 5_000,    // ~5KB/frame
  320: 8_000,    // ~8KB/frame
  480: 15_000,   // ~15KB/frame
  640: 25_000,   // ~25KB/frame
  720: 35_000,   // ~35KB/frame
};

/**
 * Estimate output file size
 *
 * @param width - Output width
 * @param fps - Frame rate
 * @param duration - Duration in seconds
 * @returns Estimated file size in bytes
 */
export function estimateGifSize(width: number, fps: number, duration: number): number {
  // Find closest width match
  const widths = Object.keys(BYTES_PER_FRAME).map(Number).sort((a, b) => a - b);
  let bytesPerFrame = BYTES_PER_FRAME[480]!; // Default

  for (const w of widths) {
    if (width <= w) {
      bytesPerFrame = BYTES_PER_FRAME[w]!;
      break;
    }
  }

  const frameCount = Math.ceil(fps * duration);
  return Math.round(frameCount * bytesPerFrame);
}
