/**
 * Dimension math + the canonical downscale filter.
 * ================================================
 * One home for resolution logic so every encode op shares it (no per-operation
 * re-implementations of the scale string or even-rounding). The filter idiom is
 * the current ffmpeg best practice (verified against ffmpeg 6/7 docs):
 *
 *   scale='min(W,iw)':'min(H,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2
 *
 * The `min()` clamp is load-bearing: `force_original_aspect_ratio=decrease`
 * alone still UPSCALES a source smaller than the box. `min()` makes it
 * downscale-only — what a proxy/encode wants (you can't invent detail, and
 * upscaling just bloats the file). `force_divisible_by=2` keeps dimensions even,
 * required by `yuv420p` / H.264. It also caps decode/encode memory so a 4K
 * source can't OOM a constrained worker.
 */

/** Default proxy resolution cap (1080p box). */
export const MAX_PROXY_WIDTH = 1920;
export const MAX_PROXY_HEIGHT = 1080;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Round to the nearest even integer (≥ 2) — matches `force_divisible_by=2`. */
export function toEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Compute the output dimensions when fitting `src` inside `box`, preserving
 * aspect ratio, **never upscaling**, and forcing even dimensions. Pure — mirrors
 * the ffmpeg `scale` filter below so callers can predict size in dry-run. The
 * authoritative output size still comes from probing the encoded file (ffmpeg's
 * rounding can differ by ±1px at fractional boundaries).
 */
export function fitWithin(src: Dimensions, box: Dimensions): Dimensions {
  if (src.width <= 0 || src.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(box.width / src.width, box.height / src.height, 1); // 1 = never upscale
  return { width: toEven(src.width * scale), height: toEven(src.height * scale) };
}

/**
 * The ffmpeg `scale` filter that caps a source within `box`, never upscales, and
 * keeps even dimensions. Defaults to the 1080p proxy cap.
 */
export function downscaleFilter(box: Dimensions = { width: MAX_PROXY_WIDTH, height: MAX_PROXY_HEIGHT }): string {
  return (
    `scale='min(${box.width},iw)':'min(${box.height},ih)'` +
    `:force_original_aspect_ratio=decrease:force_divisible_by=2`
  );
}
