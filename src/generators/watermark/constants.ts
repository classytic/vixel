/**
 * Watermark Generator Constants
 */

import type { WatermarkPosition } from './types.js';
import { escapeDrawtext } from '../captions/constants.js';

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_WATERMARK_SCALE = 0.1;      // 10% of video height
export const DEFAULT_WATERMARK_OPACITY = 1.0;
export const DEFAULT_WATERMARK_MARGIN = 10;
export const DEFAULT_TEXT_COLOR = 'white';

// =============================================================================
// Position Overlays
// =============================================================================

export const POSITION_OVERLAYS: Record<WatermarkPosition, string> = {
  'top-left': '10:10',
  'top-right': 'W-w-10:10',
  'bottom-left': '10:H-h-10',
  'bottom-right': 'W-w-10:H-h-10',
  'center': '(W-w)/2:(H-h)/2',
};

// =============================================================================
// Filter Builders
// =============================================================================

/**
 * Build image overlay filter
 */
export function buildImageOverlayFilter(
  position: WatermarkPosition,
  scale: number,
  opacity: number
): string {
  const scaleFilter = `scale=iw*${scale}:-1`;
  const alphaFilter = opacity < 1.0 ? `,format=rgba,colorchannelmixer=aa=${opacity}` : '';
  const overlayPos = POSITION_OVERLAYS[position];

  return `[1:v]${scaleFilter}${alphaFilter}[wm];[0:v][wm]overlay=${overlayPos}`;
}

/**
 * Build text overlay filter
 */
export function buildTextOverlayFilter(
  text: string,
  position: WatermarkPosition,
  fontSize: number,
  fontColor: string,
  opacity: number
): string {
  // Escape all drawtext metacharacters (\, :, ', %) — reuse the canonical
  // helper so watermark and caption escaping never drift.
  const escapedText = escapeDrawtext(text);

  const posMap: Record<WatermarkPosition, string> = {
    'top-left': 'x=10:y=10',
    'top-right': 'x=w-tw-10:y=10',
    'bottom-left': 'x=10:y=h-th-10',
    'bottom-right': 'x=w-tw-10:y=h-th-10',
    'center': 'x=(w-tw)/2:y=(h-th)/2',
  };

  return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}@${opacity}:${posMap[position]}`;
}

/**
 * Calculate font size based on video height (3% of height)
 */
export function calculateFontSize(videoHeight: number): number {
  return Math.round(videoHeight * 0.03);
}
