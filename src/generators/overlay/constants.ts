/**
 * Overlay Constants & Filter Builder
 * ==================================
 * Pure filtergraph builder — no I/O, fully unit-testable.
 *
 * The overlay clip (input 1) is scaled to fill the base, then blended in
 * **planar RGB (gbrp)**. Blending in RGB is what makes 'screen' look correct
 * for COLORED overlays — doing it in YUV screens the chroma planes and shifts
 * the result toward magenta (the same trap the glow filter hit).
 *
 * `blend=...:shortest=1` is MANDATORY: blend defaults to `repeatlast=1`, so
 * without `shortest` it repeats the last frame forever — combined with a
 * looped (`-stream_loop -1`) overlay the output never ends and `-shortest`
 * never trips, producing an infinite, disk-filling encode. shortest=1 ends the
 * blend (and the output) when the base ends.
 */

export const DEFAULT_BLEND = 'screen';
export const DEFAULT_OPACITY = 0.5;

/** Build the `[vout]`-producing overlay-composite filter_complex. */
export function buildOverlayFilter(opts: {
  width: number;
  height: number;
  blend: 'screen' | 'lighten' | 'addition';
  opacity: number;
}): string {
  const { width, height, blend, opacity } = opts;
  return (
    `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1,format=gbrp[ov];` +
    `[0:v]format=gbrp[base];` +
    `[base][ov]blend=all_mode=${blend}:all_opacity=${opacity}:shortest=1,format=yuv420p[vout]`
  );
}
