/**
 * GIF Size Optimizer
 * ==================
 * Smart size estimation and optimization for platform limits
 */

import type { GifConfig, TimeRange, VideoSource } from '../../types/generators.js';
import type {
  GifPlatform,
  GifSizeEstimate,
  OptimizedGifConfig,
} from '../../types/building-blocks.js';
import { logger } from '../../core/logger.js';

/**
 * Platform-specific size limits (bytes)
 */
export const PLATFORM_LIMITS: Record<GifPlatform, number> = {
  twitter: 15 * 1024 * 1024,   // 15 MB
  discord: 8 * 1024 * 1024,     // 8 MB
  slack: 5 * 1024 * 1024,       // 5 MB
  github: 10 * 1024 * 1024,     // 10 MB
  tenor: 20 * 1024 * 1024,      // 20 MB
  giphy: 100 * 1024 * 1024,     // 100 MB
  custom: Infinity,
};

/**
 * Estimate GIF file size before generation
 *
 * Formula: frames * width * height * bytesPerPixel * compressionRatio
 * Compression ratio varies by content (0.1-0.4 typical)
 */
export function estimateGifSize(
  source: VideoSource,
  timeRange: TimeRange,
  config: GifConfig
): GifSizeEstimate {
  const duration = timeRange.end - timeRange.start;
  const width = config.width || 480;
  const fps = config.fps || 15;
  const frameCount = Math.ceil(duration * fps);

  // Estimate bytes per pixel based on optimization level
  let bytesPerPixel: number;
  switch (config.optimization) {
    case 'quality':
      bytesPerPixel = 0.35; // Two-pass palette, higher quality
      break;
    case 'speed':
      bytesPerPixel = 0.25; // Single-pass, faster but larger
      break;
    case 'balanced':
    default:
      bytesPerPixel = 0.20; // Good balance
      break;
  }

  // Calculate estimated size
  const height = Math.round(width * (source.height || 1080) / (source.width || 1920));
  const pixelsPerFrame = width * height;
  const bytesPerFrame = Math.round(pixelsPerFrame * bytesPerPixel);
  const estimatedSize = frameCount * bytesPerFrame;

  logger.debug(`GIF size estimation: ${frameCount} frames @ ${width}x${height} = ${(estimatedSize / 1024 / 1024).toFixed(2)} MB`);

  return {
    estimatedSize,
    width,
    fps,
    duration,
    frameCount,
    bytesPerFrame,
  };
}

/**
 * Optimize GIF configuration to fit target size
 *
 * Strategy:
 * 1. Reduce width (has biggest impact)
 * 2. Reduce FPS
 * 3. Reduce quality
 */
export function optimizeGifForSize(
  source: VideoSource,
  timeRange: TimeRange,
  config: GifConfig,
  targetSize: number
): OptimizedGifConfig {
  const duration = timeRange.end - timeRange.start;
  let width = config.width || 480;
  let fps = config.fps || 15;

  const original = { width, fps };
  const adjustments = {
    widthReduced: false,
    fpsReduced: false,
    qualityReduced: false,
  };

  // Try different configurations until size fits
  let estimate = estimateGifSize(source, timeRange, { ...config, width, fps });

  // Step 1: Reduce width (most effective)
  while (estimate.estimatedSize > targetSize && width > 240) {
    width = Math.round(width * 0.8); // Reduce by 20%
    estimate = estimateGifSize(source, timeRange, { ...config, width, fps });
    adjustments.widthReduced = true;
  }

  // Step 2: Reduce FPS
  while (estimate.estimatedSize > targetSize && fps > 10) {
    fps = Math.max(10, Math.round(fps * 0.8)); // Reduce by 20%, min 10fps
    estimate = estimateGifSize(source, timeRange, { ...config, width, fps });
    adjustments.fpsReduced = true;
  }

  // Step 3: Try speed optimization (reduces quality slightly)
  if (estimate.estimatedSize > targetSize) {
    estimate = estimateGifSize(source, timeRange, {
      ...config,
      width,
      fps,
      optimization: 'speed',
    });
    adjustments.qualityReduced = true;
  }

  const sizeReduction = ((original.width * original.width - width * width) / (original.width * original.width)) * 100;

  logger.info(`GIF optimized: ${original.width}x${original.fps}fps -> ${width}x${fps}fps (${sizeReduction.toFixed(0)}% size reduction)`);

  if (adjustments.widthReduced) {
    logger.warn(`Reduced width from ${original.width}px to ${width}px to fit size limit`);
  }
  if (adjustments.fpsReduced) {
    logger.warn(`Reduced FPS from ${original.fps} to ${fps} to fit size limit`);
  }

  return {
    width,
    fps,
    estimatedSize: estimate.estimatedSize,
    adjustments,
    original,
  };
}

/**
 * Get recommended configuration for platform
 */
export function getRecommendedGifConfig(
  platform: GifPlatform,
  duration: number
): Partial<GifConfig> {
  const limit = PLATFORM_LIMITS[platform];

  // Recommendations based on duration
  if (duration <= 5) {
    return {
      width: 640,
      fps: 24,
      optimization: 'quality',
      maxSize: limit,
    };
  } else if (duration <= 10) {
    return {
      width: 480,
      fps: 20,
      optimization: 'balanced',
      maxSize: limit,
    };
  } else if (duration <= 30) {
    return {
      width: 320,
      fps: 15,
      optimization: 'balanced',
      maxSize: limit,
    };
  } else {
    return {
      width: 240,
      fps: 12,
      optimization: 'speed',
      maxSize: limit,
    };
  }
}

/**
 * Validate if GIF is suitable for duration
 *
 * Beyond 60 seconds, recommend using WebP or video
 */
export function validateGifDuration(duration: number): {
  suitable: boolean;
  recommendation?: string;
} {
  if (duration > 120) {
    return {
      suitable: false,
      recommendation: 'Duration > 2 minutes. Use video format (MP4/WebM) instead of GIF.',
    };
  }

  if (duration > 60) {
    return {
      suitable: false,
      recommendation: 'Duration > 60 seconds. Consider using WebP animated format instead.',
    };
  }

  if (duration > 30) {
    return {
      suitable: true,
      recommendation: 'Long GIF. Consider using lower FPS (12-15) and width (240-320px).',
    };
  }

  return { suitable: true };
}
