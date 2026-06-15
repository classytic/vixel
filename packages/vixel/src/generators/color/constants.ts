/**
 * Color Constants & Filter Builders
 * =================================
 * Pure filtergraph builders — no I/O, fully unit-testable.
 */

/** Escape a path for the lut3d filter (Windows drive colons break the parser). */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Build an `eq` (+ optional `unsharp`) filter chain. Only non-default knobs
 * are emitted so the chain stays minimal.
 */
export function buildColorAdjustFilter(opts: {
  brightness?: number | undefined;
  contrast?: number | undefined;
  saturation?: number | undefined;
  gamma?: number | undefined;
  sharpen?: number | undefined;
}): string {
  const eq: string[] = [];
  if (opts.brightness !== undefined && opts.brightness !== 0) eq.push(`brightness=${opts.brightness}`);
  if (opts.contrast !== undefined && opts.contrast !== 1) eq.push(`contrast=${opts.contrast}`);
  if (opts.saturation !== undefined && opts.saturation !== 1) eq.push(`saturation=${opts.saturation}`);
  if (opts.gamma !== undefined && opts.gamma !== 1) eq.push(`gamma=${opts.gamma}`);

  const chain: string[] = [];
  if (eq.length) chain.push(`eq=${eq.join(':')}`);
  if (opts.sharpen !== undefined && opts.sharpen > 0) {
    chain.push(`unsharp=5:5:${opts.sharpen}:5:5:0`);
  }
  return chain.join(',');
}

/** Build a `lut3d=` filter applying a .cube LUT. */
export function buildLut3dFilter(lutPath: string): string {
  return `lut3d='${escapeFilterPath(lutPath)}'`;
}
