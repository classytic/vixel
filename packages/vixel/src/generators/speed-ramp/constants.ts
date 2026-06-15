/**
 * Speed Ramp Constants & Filter Builder
 * =====================================
 * Pure filtergraph builder — no I/O, fully unit-testable.
 *
 * Each segment is `trim`med from the source, retimed with `setpts=PTS/speed`,
 * then rate-normalized — slow segments via `minterpolate` (motion-compensated
 * frames) for true slow-mo, fast/normal segments via plain `fps`. The segments
 * are stitched with the `concat` filter into one `[vout]`.
 */

import type { SpeedRampSegment, SpeedRampPlanSegment } from './types.js';

export const DEFAULT_FPS = 30;
export const DEFAULT_SMOOTH = true;
export const DEFAULT_CRF = 20;
export const DEFAULT_PRESET = 'medium';
export const DEFAULT_VIDEO_CODEC = 'libx264' as const;

export const MIN_SPEED = 0.25; // 4x slower
export const MAX_SPEED = 4.0; // 4x faster

/** Round to millisecond precision so filter strings stay clean (no float noise). */
function fmt(n: number): number {
  return Number(n.toFixed(3));
}

/**
 * Validate a ramp's segments against the source duration. Throws on any problem
 * so the caller never builds a graph ffmpeg would reject mid-render.
 */
export function validateSpeedRamp(segments: readonly SpeedRampSegment[], sourceDuration: number): void {
  if (segments.length === 0) {
    throw new Error('speedRamp requires at least one segment');
  }
  let prev = 0;
  for (const [i, seg] of segments.entries()) {
    if (!(seg.speed >= MIN_SPEED && seg.speed <= MAX_SPEED)) {
      throw new Error(`segment ${i}: speed ${seg.speed} out of range (${MIN_SPEED}–${MAX_SPEED}x)`);
    }
    if (!(seg.throughSec > prev)) {
      throw new Error(`segment ${i}: throughSec ${seg.throughSec} must be greater than ${prev} (segments ascend)`);
    }
    prev = seg.throughSec;
  }
  if (sourceDuration > 0 && segments[0]!.throughSec > sourceDuration) {
    throw new Error(`first segment boundary ${segments[0]!.throughSec}s exceeds source duration ${sourceDuration}s`);
  }
}

/**
 * Build the `[vout]`-producing speed-ramp filter_complex plus the resolved
 * source→output plan. `sourceDuration` clamps the final segment to clip end.
 */
export function buildSpeedRampFilter(opts: {
  segments: readonly SpeedRampSegment[];
  sourceDuration: number;
  smooth: boolean;
  fps: number;
}): { filter: string; plan: SpeedRampPlanSegment[] } {
  const { segments, sourceDuration, smooth, fps } = opts;

  const chains: string[] = [];
  const plan: SpeedRampPlanSegment[] = [];

  segments.forEach((seg, i) => {
    const srcStart = i === 0 ? 0 : segments[i - 1]!.throughSec;
    // Clamp the last boundary to the real clip end (a sentinel like 9999 → end).
    const srcEnd = sourceDuration > 0 ? Math.min(seg.throughSec, sourceDuration) : seg.throughSec;
    const slow = seg.speed < 1;
    // Exactly one rate-setter per segment: motion-interpolate slow-mo, else fps.
    const post =
      smooth && slow
        ? `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`
        : `fps=${fps}`;
    chains.push(
      `[0:v]trim=start=${fmt(srcStart)}:end=${fmt(srcEnd)},setpts=(PTS-STARTPTS)/${seg.speed},${post}[v${i}]`,
    );
    plan.push({ srcStart: fmt(srcStart), srcEnd: fmt(srcEnd), speed: seg.speed, outDuration: fmt((srcEnd - srcStart) / seg.speed) });
  });

  const labels = segments.map((_, i) => `[v${i}]`).join('');
  const filter = `${chains.join(';')};${labels}concat=n=${segments.length}:v=1:a=0[vout]`;
  return { filter, plan };
}
