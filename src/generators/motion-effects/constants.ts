/**
 * Motion Effects Constants & Filter Builders
 * ==========================================
 * Pure filtergraph builders — no I/O, fully unit-testable. Each returns a simple
 * `-vf` chain (linear, single output), driven by an `intensity` in [0, 1].
 */

import type { MotionEffect } from './types.js';

export const DEFAULT_INTENSITY = 0.5;
export const DEFAULT_FPS = 30;
export const DEFAULT_CRF = 20;
export const DEFAULT_PRESET = 'fast';
export const DEFAULT_VIDEO_CODEC = 'libx264' as const;

function clamp01(i: number): number {
  return Math.max(0, Math.min(1, i));
}

/** Chromatic aberration — split the red/blue channels horizontally. */
export function buildRgbSplitFilter(intensity: number): string {
  const px = Math.max(1, Math.round(clamp01(intensity) * 14));
  return `rgbashift=rh=${px}:bh=${-px}`;
}

/** Digital glitch — RGB split + temporal noise + a contrast/saturation pump. */
export function buildGlitchFilter(intensity: number): string {
  const i = clamp01(intensity);
  const px = Math.max(1, Math.round(i * 10));
  const ns = Math.round(i * 24);
  const contrast = (1 + 0.2 * i).toFixed(3);
  const saturation = (1 + 0.4 * i).toFixed(3);
  return `rgbashift=rh=${px}:bh=${-px},noise=alls=${ns}:allf=t+u,eq=contrast=${contrast}:saturation=${saturation}`;
}

/**
 * Handheld camera shake — scale up for headroom, then jitter the crop window
 * with layered sines (non-periodic feel). Resolution-independent.
 */
export function buildShakeFilter(intensity: number): string {
  const z = 1.1; // headroom so the jittered crop never exposes an edge
  const a = (0.025 * clamp01(intensity)).toFixed(4); // amplitude, fraction of the frame
  return (
    `scale=w=iw*${z}:h=ih*${z}:eval=init,` +
    `crop=w=iw/${z}:h=ih/${z}:` +
    `x='(iw-ow)/2 + ${a}*iw*(sin(2*PI*t*3.1)+0.5*sin(2*PI*t*7.3))':` +
    `y='(ih-oh)/2 + ${a}*ih*(cos(2*PI*t*2.7)+0.5*cos(2*PI*t*6.1))'`
  );
}

/**
 * Rhythmic zoom punch — a sharp zoom-in that eases back, repeating each period.
 * Video-safe `zoompan` (d=1, one output frame per input frame). Needs the frame
 * size because zoompan emits at an explicit `s=WxH`.
 */
export function buildZoomPunchFilter(opts: {
  intensity: number;
  width: number;
  height: number;
  fps: number;
  /** Frames between punches (default: ~one per second from fps). */
  periodFrames?: number;
}): string {
  const amp = (0.18 * clamp01(opts.intensity)).toFixed(4);
  const period = opts.periodFrames ?? Math.max(1, Math.round(opts.fps));
  // decaying pulse: z spikes at the start of each period, eases toward 1.0
  const z = `1+${amp}*pow(0.6\\,mod(on\\,${period}))`;
  return (
    `zoompan=z='${z}':d=1:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `s=${opts.width}x${opts.height}:fps=${opts.fps}`
  );
}

/** Dispatch an effect name to its filter. `width`/`height` only used by `zoom-punch`. */
export function buildMotionEffectFilter(
  effect: MotionEffect,
  opts: { intensity: number; width: number; height: number; fps: number },
): string {
  switch (effect) {
    case 'glitch':
      return buildGlitchFilter(opts.intensity);
    case 'shake':
      return buildShakeFilter(opts.intensity);
    case 'rgb-split':
      return buildRgbSplitFilter(opts.intensity);
    case 'zoom-punch':
      return buildZoomPunchFilter(opts);
  }
}
