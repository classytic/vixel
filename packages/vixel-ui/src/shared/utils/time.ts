/**
 * Time helpers — frames, seconds, and timecode.
 * vixel reasons in seconds at the surface and frames internally; the editor
 * mirrors that. These are pure, framework-free, and tree-shakeable.
 */
import type { VixelSpec } from '@classytic/vixel-schema';

/** Resolve vixel's `number | {num,den}` fps to a plain number. */
export function resolveFps(fps: VixelSpec['output']['fps']): number {
  return typeof fps === 'number' ? fps : fps.num / fps.den;
}

/** Clamp `n` into the inclusive `[min, max]` range. */
export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** Seconds → whole frames at the given fps. */
export function secToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

/** Whole frames → seconds at the given fps. */
export function framesToSec(frames: number, fps: number): number {
  return frames / fps;
}

/** Snap a time (seconds) to the nearest frame boundary. */
export function snapToFrame(sec: number, fps: number): number {
  return framesToSec(secToFrames(sec, fps), fps);
}

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, '0');

/**
 * Format seconds as `MM:SS:FF` (or `HH:MM:SS:FF` past an hour) — the frame is
 * the trailing field, NLE-style. Pass `fps` so the frame field is exact.
 */
export function formatTimecode(sec: number, fps: number): string {
  const total = Math.max(0, sec);
  const frames = Math.round((total - Math.floor(total)) * fps);
  const whole = Math.floor(total);
  const ss = whole % 60;
  const mm = Math.floor(whole / 60) % 60;
  const hh = Math.floor(whole / 3600);
  const tail = `${pad(mm)}:${pad(ss)}:${pad(frames)}`;
  return hh > 0 ? `${pad(hh)}:${tail}` : tail;
}

/** A clock-style `M:SS` (no frames) for compact transport displays. */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}
