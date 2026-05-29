/**
 * Glow Constants & Filter Builder
 * ===============================
 * Pure filtergraph builder — no I/O, fully unit-testable.
 *
 * Bloom = blur a copy of the frame and screen-blend it back over the original.
 * `highlightsOnly` first masks the bright pixels so only highlights bloom.
 */

export const DEFAULT_SIGMA = 8;
export const DEFAULT_STEPS = 4;
export const DEFAULT_INTENSITY = 0.4;
export const DEFAULT_THRESHOLD = 180;

/** Build the `[vout]`-producing glow/bloom filter_complex. */
export function buildGlowFilter(opts: {
  sigma: number;
  steps: number;
  intensity: number;
  highlightsOnly: boolean;
  threshold: number;
}): string {
  const { sigma, steps, intensity, highlightsOnly, threshold } = opts;
  // `steps` (Gaussian approximation passes) smooths the bloom — established
  // glow practice uses a higher step count, not just a bigger sigma.
  const blur = `gblur=sigma=${sigma}:steps=${steps}`;
  const bloom = highlightsOnly
    // keep only luma above threshold, then blur
    ? `lutyuv='y=if(gt(val\\,${threshold})\\,val\\,0)',${blur}`
    : blur;

  // Screen-blend the LUMA plane only (c0). Chroma planes (c1/c2) are kept from
  // the base via opacity 0 — screen-blending chroma shifts colors to magenta.
  return (
    `[0:v]split=2[base][b];` +
    `[b]${bloom}[bloom];` +
    `[base][bloom]blend=c0_mode=screen:c0_opacity=${intensity}:c1_opacity=0:c2_opacity=0,format=yuv420p[vout]`
  );
}
