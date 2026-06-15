/**
 * Crop/Resize Generator Constants
 */

import type { AspectRatioPreset } from './types.js';

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_CRF = 23;

// =============================================================================
// Aspect Ratio Presets
// =============================================================================

export const ASPECT_RATIO_PRESETS: Record<AspectRatioPreset, { width: number; height: number } | null> = {
  'reels': { width: 1080, height: 1920 },      // 9:16 for Instagram Reels, TikTok, Shorts
  'youtube': { width: 1920, height: 1080 },    // 16:9 for YouTube
  'square': { width: 1080, height: 1080 },     // 1:1 for Instagram feed
  'custom': null,
};

// =============================================================================
// Filter Builders
// =============================================================================

/**
 * Build center crop and scale filter for aspect ratio conversion
 */
export function buildCropScaleFilter(
  targetWidth: number,
  targetHeight: number
): string {
  // Use scale with crop to maintain aspect ratio and fit target
  // This will center crop to target aspect ratio and scale
  return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;
}
