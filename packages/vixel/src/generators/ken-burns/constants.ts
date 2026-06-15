/**
 * Ken Burns Constants & Filter Builder
 * ====================================
 * Pure zoompan filtergraph builder — no I/O, fully unit-testable.
 */

import type { KenBurnsDirection } from './types.js';

export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;
export const DEFAULT_FPS = 30;
export const DEFAULT_ZOOM_IN_END = 1.2;
export const DEFAULT_ZOOM_OUT_START = 1.2;
export const DEFAULT_PAN_ZOOM = 1.2;

/** Upscale factor applied before zoompan to keep the motion smooth (less jitter). */
export const PRESCALE_FACTOR = 4;

export interface KenBurnsPlan {
  width: number;
  height: number;
  fps: number;
  frames: number;
  direction: KenBurnsDirection;
  startZoom: number;
  endZoom: number;
  panZoom: number;
}

/**
 * Build the `scale,...,zoompan,...` filter for a single image.
 *
 * `on` is zoompan's output-frame index, so a linear ramp over `frames`
 * gives a constant-velocity move. Inputs are pre-scaled up so the zoom has
 * pixels to work with and doesn't shimmer.
 */
export function buildKenBurnsFilter(plan: KenBurnsPlan): string {
  const { width, height, fps, frames, direction, startZoom, endZoom, panZoom } = plan;
  const prescale = `scale=${width * PRESCALE_FACTOR}:-1`;

  // Centered crop window (keeps subject centered while zooming).
  const centerX = `iw/2-(iw/zoom/2)`;
  const centerY = `ih/2-(ih/zoom/2)`;

  let z: string;
  let x = centerX;
  let y = centerY;

  switch (direction) {
    case 'in':
    case 'out': {
      const delta = round((endZoom - startZoom) / Math.max(1, frames));
      z = `${startZoom}+${delta}*on`;
      break;
    }
    case 'left':
      z = String(panZoom);
      x = `(iw-iw/zoom)*on/${frames}`;
      break;
    case 'right':
      z = String(panZoom);
      x = `(iw-iw/zoom)*(1-on/${frames})`;
      break;
    case 'up':
      z = String(panZoom);
      y = `(ih-ih/zoom)*on/${frames}`;
      break;
    case 'down':
      z = String(panZoom);
      y = `(ih-ih/zoom)*(1-on/${frames})`;
      break;
  }

  const zoompan = `zoompan=z='${z}':d=${frames}:s=${width}x${height}:fps=${fps}:x='${x}':y='${y}'`;
  return `${prescale},${zoompan},format=yuv420p`;
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
