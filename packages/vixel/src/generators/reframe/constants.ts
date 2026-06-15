/**
 * Reframe Constants & Filter Builders
 * ===================================
 * Pure filtergraph builders — no I/O, fully unit-testable.
 */

import type { ReframeAspect, ReframeMode } from './types.js';

/** Default target dimensions per aspect preset (1080-class). */
export const ASPECT_DIMENSIONS: Record<ReframeAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '4:3': { width: 1440, height: 1080 },
};

export const DEFAULT_BLUR = 20;
export const DEFAULT_BACKGROUND = 'black';

export interface BuiltReframeFilter {
  /** The filter string. */
  filter: string;
  /** True when this must use -filter_complex with a [vout] map (blur-pad). */
  complex: boolean;
}

/** Build the reframe filter for the given mode + target dimensions. */
export function buildReframeFilter(
  mode: ReframeMode,
  width: number,
  height: number,
  opts: { blur?: number | undefined; background?: string | undefined } = {},
): BuiltReframeFilter {
  switch (mode) {
    case 'crop':
      return {
        filter: `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`,
        complex: false,
      };
    case 'pad':
      return {
        filter:
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${opts.background ?? DEFAULT_BACKGROUND},setsar=1`,
        complex: false,
      };
    case 'blur-pad':
      return {
        filter:
          `[0:v]split=2[bg][fg];` +
          `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=${opts.blur ?? DEFAULT_BLUR}[bgb];` +
          `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fgs];` +
          `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[vout]`,
        complex: true,
      };
  }
}
