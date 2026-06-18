/**
 * Smart Reframe Constants & Filter Builder
 * ========================================
 * Pure: a subject TRACK (normalized centre-x over time, from prism-gpu's RVM
 * matte) → an ffmpeg `crop` that follows the subject as it compiles to a target
 * aspect (16:9 → 9:16), then scales to the output. The track is smoothed +
 * thinned to keyframes and compiled to a per-frame `crop=x='…'` time-expression
 * via the keyframe compiler — so the crop pans, it doesn't jump.
 */

import { compileScalarKeyframes, type Keyframe } from '../../core/keyframe.js';
import type { SubjectTrackPoint } from './types.js';

export const DEFAULT_ASPECT = { w: 9, h: 16 } as const;
export const DEFAULT_SMOOTHING = 0.6; // seconds — talking-head subjects move slowly
export const DEFAULT_SAMPLE = 0.25; // seconds between keyframes
/**
 * Center deadzone (fraction of the frame) the subject can drift WITHIN before the
 * crop pans. The single biggest anti-tremble lever: a near-still subject keeps the
 * frame locked instead of chasing matte-centroid micro-jitter.
 */
export const DEFAULT_DEADZONE = 0.05;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const even = (n: number) => Math.round(n / 2) * 2;

/** One moving-average pass over a time window, smoothing both axes. */
function avgPass(track: SubjectTrackPoint[], half: number): SubjectTrackPoint[] {
  return track.map((p) => {
    let sx = 0;
    let nx = 0;
    let sy = 0;
    let ny = 0;
    for (const q of track) {
      if (Math.abs(q.t - p.t) <= half) {
        sx += q.cx;
        nx++;
        if (q.cy !== undefined) {
          sy += q.cy;
          ny++;
        }
      }
    }
    return { t: p.t, cx: nx ? sx / nx : p.cx, ...(p.cy !== undefined ? { cy: ny ? sy / ny : p.cy } : {}) };
  });
}

/**
 * Smooth the subject centre over a time window. TWO passes ≈ a triangular kernel —
 * a much stronger low-pass than a single boxcar, so high-frequency tremble is
 * rejected while real pans survive. Smooths X and Y.
 */
export function smoothTrack(track: readonly SubjectTrackPoint[], windowSec: number): SubjectTrackPoint[] {
  const sorted = [...track].sort((a, b) => a.t - b.t);
  if (sorted.length <= 2 || windowSec <= 0) return sorted;
  const half = windowSec / 2;
  return avgPass(avgPass(sorted, half), half);
}

/**
 * Hold the crop centre still until the subject leaves a `deadzone` band, then
 * follow (trailing by the band). Kills residual micro-jitter that survives
 * smoothing — the frame "locks" on a near-still subject instead of trembling.
 */
export function applyDeadzone(track: readonly SubjectTrackPoint[], deadzone: number): SubjectTrackPoint[] {
  if (deadzone <= 0 || track.length === 0) return [...track];
  const sorted = [...track].sort((a, b) => a.t - b.t);
  const out: SubjectTrackPoint[] = [{ ...sorted[0]! }];
  let hx = sorted[0]!.cx;
  let hy = sorted[0]!.cy;
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (Math.abs(p.cx - hx) > deadzone) hx = p.cx - Math.sign(p.cx - hx) * deadzone;
    if (p.cy !== undefined && hy !== undefined && Math.abs(p.cy - hy) > deadzone) {
      hy = p.cy - Math.sign(p.cy - hy) * deadzone;
    }
    out.push({ t: p.t, cx: hx, ...(p.cy !== undefined ? { cy: hy } : {}) });
  }
  return out;
}

/** Thin a dense per-frame track down to ~one keyframe per `intervalSec` (small expr). */
export function sampleTrack(track: readonly SubjectTrackPoint[], intervalSec: number): SubjectTrackPoint[] {
  const sorted = [...track].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return [];
  const out: SubjectTrackPoint[] = [sorted[0]!];
  for (const p of sorted) if (p.t - out[out.length - 1]!.t >= intervalSec) out.push(p);
  const last = sorted[sorted.length - 1]!;
  if (out[out.length - 1]!.t !== last.t) out.push(last);
  return out;
}

/** Crop-window size + which axis pans, for source → target aspect. */
export function cropWindow(srcW: number, srcH: number, aspect: { w: number; h: number }) {
  const r = aspect.w / aspect.h;
  if (srcW / srcH > r) {
    // source wider than target → a vertical strip that pans on X
    return { cropW: even(srcH * r), cropH: even(srcH), axis: 'x' as const };
  }
  // source taller → a horizontal band that pans on Y
  return { cropW: even(srcW), cropH: even(srcW / r), axis: 'y' as const };
}

export interface SmartReframeFilterOpts {
  srcW: number;
  srcH: number;
  track: readonly SubjectTrackPoint[];
  aspect: { w: number; h: number };
  outW: number;
  outH: number;
  smoothing: number;
  sampleInterval: number;
  /** Center deadzone (fraction of frame); defaults to {@link DEFAULT_DEADZONE}. */
  deadzone?: number;
}

/** Smooth → deadzone → thin to keyframes — the full stabilization pipeline. */
function stabilize(track: readonly SubjectTrackPoint[], smoothing: number, deadzone: number, sampleInterval: number) {
  return sampleTrack(applyDeadzone(smoothTrack(track, smoothing), deadzone), sampleInterval);
}

/** Build the subject-tracked `crop … , scale …` `-vf` chain. */
export function buildSmartReframeFilter(opts: SmartReframeFilterOpts): string {
  const { srcW, srcH, track, aspect, outW, outH, smoothing, sampleInterval } = opts;
  const deadzone = opts.deadzone ?? DEFAULT_DEADZONE;
  const { cropW, cropH, axis } = cropWindow(srcW, srcH, aspect);

  if (axis === 'x') {
    const maxX = srcW - cropW;
    const yFixed = Math.round((srcH - cropH) / 2);
    const toX = (cx: number) => clamp(Math.round(cx * srcW - cropW / 2), 0, maxX);
    let xExpr: string;
    if (track.length < 2) {
      xExpr = String(toX(track[0]?.cx ?? 0.5));
    } else {
      const kfs: Keyframe[] = stabilize(track, smoothing, deadzone, sampleInterval).map((p) => ({
        t: p.t,
        value: toX(p.cx),
      }));
      xExpr = compileScalarKeyframes(kfs);
    }
    return `crop=${cropW}:${cropH}:x='${xExpr}':y=${yFixed},scale=${outW}:${outH},setsar=1`;
  }

  // vertical-pan variant (source taller than target) — track cy if present, else centre
  const maxY = srcH - cropH;
  const xFixed = Math.round((srcW - cropW) / 2);
  const toY = (cy: number) => clamp(Math.round(cy * srcH - cropH / 2), 0, maxY);
  let yExpr: string;
  if (track.length < 2 || track[0]!.cy === undefined) {
    yExpr = String(Math.round(maxY / 2));
  } else {
    const kfs: Keyframe[] = stabilize(track, smoothing, deadzone, sampleInterval).map((p) => ({
      t: p.t,
      value: toY(p.cy ?? 0.5),
    }));
    yExpr = compileScalarKeyframes(kfs);
  }
  return `crop=${cropW}:${cropH}:x=${xFixed}:y='${yExpr}',scale=${outW}:${outH},setsar=1`;
}
