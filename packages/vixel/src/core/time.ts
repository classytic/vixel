/**
 * Frame-exact time — seconds at the edge, frames inside.
 * ======================================================
 * Float seconds compound rounding across an edit (OTIO uses rational time for
 * exactly this reason). vixel keeps the *public* API in seconds — ergonomic, and
 * what ffmpeg takes — but snaps every timeline boundary to the output frame grid
 * so cuts are exact, and exposes frame-exact positions + timecode so a host can
 * build a zoomable timeline / playhead without re-deriving them.
 *
 * See DESIGN.md, "Frame-exact time".
 */

/** Whole frames for a duration/position in seconds, at `fps` (nearest frame). */
export function toFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/** Seconds for a whole-frame count at `fps`. */
export function toSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/** Snap a seconds value onto the frame grid (so a cut lands exactly on a frame). */
export function snapToFrame(seconds: number, fps: number): number {
  return toFrames(seconds, fps) / fps;
}

/** Integer frames-per-second for timecode math (24, 25, 30, …). Non-drop. */
function fpsInt(fps: number): number {
  return Math.max(1, Math.round(fps));
}

/**
 * Format a position as `HH:MM:SS:FF` (non-drop) — the label a timeline ruler and
 * a playhead readout show. `FF` is the frame within the second at `fps`.
 */
export function formatTimecode(seconds: number, fps: number): string {
  const rate = fpsInt(fps);
  const total = toFrames(seconds, fps);
  const ff = ((total % rate) + rate) % rate;
  const whole = Math.floor((total - ff) / rate);
  const ss = whole % 60;
  const mm = Math.floor(whole / 60) % 60;
  const hh = Math.floor(whole / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

/** Parse `HH:MM:SS:FF` (or `MM:SS:FF`) back to seconds at `fps`. */
export function parseTimecode(tc: string, fps: number): number {
  const parts = tc.split(':').map((s) => Number(s));
  if (parts.some((n) => !Number.isFinite(n))) throw new Error(`invalid timecode: "${tc}"`);
  const ff = parts.pop()!;
  const ss = parts.pop() ?? 0;
  const mm = parts.pop() ?? 0;
  const hh = parts.pop() ?? 0;
  const rate = fpsInt(fps);
  return ((hh * 3600 + mm * 60 + ss) * rate + ff) / fps;
}
