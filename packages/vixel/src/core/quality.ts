/**
 * Quality Ladder & Variant Selection
 * ===================================
 * Smart quality selection based on source video characteristics.
 *
 * Based on:
 * - Netflix quality ladder research (2024)
 * - YouTube encoding recommendations
 * - Bitmovin streaming best practices
 *
 * @module core/quality
 */

import type { QualityVariant, EncodingMode } from '../types/index.js';
import { checkHLSCompatibility, type HLSCompatibility } from './codecs.js';

// =============================================================================
// Quality Presets (Industry Standard 2024)
// =============================================================================

export interface QualityPreset {
  name: string;
  height: number;
  width: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  profile: 'baseline' | 'main' | 'high';
  level: string;
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
  '1080p': {
    name: '1080p HD',
    height: 1080,
    width: 1920,
    videoBitrate: '4000k',
    maxrate: '4800k',
    bufsize: '8000k',
    audioBitrate: '192k',
    profile: 'high',
    level: '4.1',
  },
  '720p': {
    name: '720p HD',
    height: 720,
    width: 1280,
    videoBitrate: '2800k',
    maxrate: '3360k',
    bufsize: '5600k',
    audioBitrate: '128k',
    profile: 'main',
    level: '3.1',
  },
  '480p': {
    name: '480p SD',
    height: 480,
    width: 854,
    videoBitrate: '1400k',
    maxrate: '1680k',
    bufsize: '2800k',
    audioBitrate: '128k',
    profile: 'main',
    level: '3.0',
  },
  '360p': {
    name: '360p',
    height: 360,
    width: 640,
    videoBitrate: '800k',
    maxrate: '960k',
    bufsize: '1600k',
    audioBitrate: '96k',
    profile: 'baseline',
    level: '3.0',
  },
};

// Bitrate lookup by resolution (kbps)
const BITRATES: Record<number, { video: number; audio: number }> = {
  360: { video: 800, audio: 96 },
  480: { video: 1400, audio: 128 },
  720: { video: 2800, audio: 128 },
  1080: { video: 4000, audio: 192 },
  1440: { video: 8000, audio: 192 },
  2160: { video: 16000, audio: 256 },
};

// =============================================================================
// Variant Selection
// =============================================================================

export interface VideoSource {
  height: number;
  width?: number;
  videoCodec: string;
  audioCodec?: string | null;
}

export interface SelectionOptions {
  maxHeight?: number;
  segmentDuration?: number;
  forceMode?: EncodingMode;
}

export interface SelectionResult {
  variant: QualityVariant;
  compatibility: HLSCompatibility;
  strategy: 'CODEC_COPY' | 'REENCODE_INCOMPATIBLE' | 'REENCODE_DOWNSCALE' | 'FORCED';
  reason: string;
}

/**
 * Select optimal HLS variant based on source characteristics
 *
 * Decision flow:
 * 1. Check codec compatibility (H.264/AAC = copy, VP9/Opus = transcode)
 * 2. Check resolution (downscale if needed)
 * 3. Apply encoding strategy
 *
 * @example
 * ```typescript
 * // H.264 720p source → codec copy (10-20x faster)
 * selectVariant({ height: 720, videoCodec: 'h264', audioCodec: 'aac' });
 *
 * // VP9 720p source → transcode (codec incompatible)
 * selectVariant({ height: 720, videoCodec: 'vp9', audioCodec: 'opus' });
 *
 * // H.264 1080p source with maxHeight:720 → transcode (downscale)
 * selectVariant({ height: 1080, videoCodec: 'h264' }, { maxHeight: 720 });
 * ```
 */
export function selectVariant(source: VideoSource, options: SelectionOptions = {}): SelectionResult {
  const { maxHeight = 720, segmentDuration = 4, forceMode } = options;

  const compatibility = checkHLSCompatibility(source.videoCodec, source.audioCodec);
  const targetHeight = Math.min(source.height, maxHeight);

  // Forced mode
  if (forceMode) {
    return {
      variant: buildVariant(targetHeight, forceMode, segmentDuration),
      compatibility,
      strategy: 'FORCED',
      reason: `Forced ${forceMode} mode`,
    };
  }

  // Incompatible codec → must transcode
  if (!compatibility.canCopy) {
    return {
      variant: buildVariant(targetHeight, 'reencode', segmentDuration),
      compatibility,
      strategy: 'REENCODE_INCOMPATIBLE',
      reason: `Source ${source.videoCodec}/${source.audioCodec ?? 'none'} not HLS-compatible`,
    };
  }

  // Downscale needed → must transcode
  if (source.height > maxHeight) {
    return {
      variant: buildVariant(targetHeight, 'reencode', segmentDuration),
      compatibility,
      strategy: 'REENCODE_DOWNSCALE',
      reason: `Downscaling ${source.height}p → ${targetHeight}p`,
    };
  }

  // Compatible codec + matching resolution → codec copy
  return {
    variant: buildVariant(source.height, 'copy', segmentDuration),
    compatibility,
    strategy: 'CODEC_COPY',
    reason: `Source ${source.height}p H.264/AAC, using codec copy (10-20x faster)`,
  };
}

function buildVariant(height: number, mode: EncodingMode, segmentDuration: number): QualityVariant {
  const bitrates = getBitrates(height);
  const isCopy = mode === 'copy';

  return {
    name: `${height}p`,
    height,
    videoBitrate: isCopy ? 0 : bitrates.video,
    audioBitrate: isCopy ? 0 : bitrates.audio,
    segmentDuration,
    encodingMode: mode,
  };
}

function getBitrates(height: number): { video: number; audio: number } {
  const heights = Object.keys(BITRATES).map(Number).sort((a, b) => a - b);
  for (const h of heights) {
    if (height <= h) return BITRATES[h]!;
  }
  return BITRATES[720]!;
}

// =============================================================================
// Quality Ladder Selection
// =============================================================================

/**
 * Select quality ladder for adaptive bitrate streaming
 * Never upscales - only generates variants at or below source resolution
 */
export function selectQualityLadder(
  sourceHeight: number,
  options: { min?: number; max?: number; maxVariants?: number } = {}
): string[] {
  const { min = 360, max = 1080, maxVariants } = options;

  let ladder: string[];
  if (sourceHeight >= 1080) ladder = ['1080p', '720p', '480p'];
  else if (sourceHeight >= 720) ladder = ['720p', '480p', '360p'];
  else if (sourceHeight >= 480) ladder = ['480p', '360p'];
  else ladder = ['360p'];

  // Filter by constraints
  ladder = ladder.filter(q => {
    const preset = QUALITY_PRESETS[q];
    return preset && preset.height >= min && preset.height <= max && preset.height <= sourceHeight;
  });

  // Limit variants
  if (maxVariants && maxVariants > 0) {
    ladder = ladder.slice(0, maxVariants);
  }

  return ladder;
}

/**
 * Get preset for a quality level
 */
export function getPreset(quality: string): QualityPreset | undefined {
  return QUALITY_PRESETS[quality];
}

/**
 * Convert QualityVariant to QualityPreset
 */
export function variantToPreset(variant: QualityVariant): QualityPreset {
  return {
    name: variant.name,
    height: variant.height,
    width: Math.round((variant.height * 16) / 9),
    videoBitrate: `${variant.videoBitrate}k`,
    maxrate: `${Math.round(variant.videoBitrate * 1.2)}k`,
    bufsize: `${variant.videoBitrate * 2}k`,
    audioBitrate: `${variant.audioBitrate}k`,
    profile: variant.height >= 720 ? 'high' : 'main',
    level: variant.height >= 1080 ? '4.1' : '3.1',
  };
}

/**
 * Create codec copy variant
 */
export function createCopyVariant(height: number, name?: string): QualityVariant {
  return {
    name: name ?? `${height}p`,
    height,
    videoBitrate: 0,
    audioBitrate: 0,
    encodingMode: 'copy',
    segmentDuration: 4,
  };
}
