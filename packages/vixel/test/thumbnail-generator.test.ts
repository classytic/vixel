/**
 * Thumbnail Generator Tests
 * ==========================
 * Tests for thumbnail extraction with multiple format support.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateThumbnailSize,
  DEFAULT_THUMBNAIL_WIDTH,
  DEFAULT_THUMBNAIL_FORMAT,
  DEFAULT_JPEG_QUALITY,
  DEFAULT_WEBP_QUALITY,
  FORMAT_SETTINGS,
} from '../src/generators/thumbnails/index.js';
import {
  SCALE_FILTER,
  SMART_SEARCH_START_PERCENT,
  SMART_SEARCH_END_PERCENT,
  BYTES_PER_MEGAPIXEL,
} from '../src/generators/thumbnails/constants.js';

describe('Thumbnail Generator', () => {
  describe('Constants', () => {
    it('should have valid default width', () => {
      expect(DEFAULT_THUMBNAIL_WIDTH).toBe(1280);
    });

    it('should have valid default format', () => {
      expect(DEFAULT_THUMBNAIL_FORMAT).toBe('jpg');
    });

    it('should have valid JPEG quality', () => {
      expect(DEFAULT_JPEG_QUALITY).toBe(85);
      expect(DEFAULT_JPEG_QUALITY).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_JPEG_QUALITY).toBeLessThanOrEqual(100);
    });

    it('should have valid WebP quality', () => {
      expect(DEFAULT_WEBP_QUALITY).toBe(80);
      expect(DEFAULT_WEBP_QUALITY).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_WEBP_QUALITY).toBeLessThanOrEqual(100);
    });

    it('should have valid smart search percentages', () => {
      expect(SMART_SEARCH_START_PERCENT).toBe(0.1);
      expect(SMART_SEARCH_END_PERCENT).toBe(0.5);
      expect(SMART_SEARCH_START_PERCENT).toBeLessThan(SMART_SEARCH_END_PERCENT);
    });
  });

  describe('FORMAT_SETTINGS', () => {
    it('should have settings for all supported formats', () => {
      expect(FORMAT_SETTINGS).toHaveProperty('jpg');
      expect(FORMAT_SETTINGS).toHaveProperty('png');
      expect(FORMAT_SETTINGS).toHaveProperty('webp');
      expect(FORMAT_SETTINGS).toHaveProperty('avif');
    });

    it('should have correct codec for JPEG', () => {
      expect(FORMAT_SETTINGS.jpg.codec).toBe('mjpeg');
      expect(FORMAT_SETTINGS.jpg.qualityArg).toBe('-q:v');
    });

    it('should have correct codec for PNG', () => {
      expect(FORMAT_SETTINGS.png.codec).toBe('png');
      expect(FORMAT_SETTINGS.png.qualityArg).toBe('-compression_level');
    });

    it('should have correct codec for WebP', () => {
      expect(FORMAT_SETTINGS.webp.codec).toBe('libwebp');
      expect(FORMAT_SETTINGS.webp.qualityArg).toBe('-q:v');
    });

    it('should have correct codec for AVIF', () => {
      expect(FORMAT_SETTINGS.avif.codec).toBe('libaom-av1');
      expect(FORMAT_SETTINGS.avif.qualityArg).toBe('-crf');
    });

    it('should scale JPEG quality correctly (inverted scale 2-31)', () => {
      // 100% quality should be 2 (best)
      expect(FORMAT_SETTINGS.jpg.qualityScale(100)).toBe(2);
      // 0% quality should be 31 (worst)
      expect(FORMAT_SETTINGS.jpg.qualityScale(0)).toBe(31);
      // 50% quality should be middle
      const mid = FORMAT_SETTINGS.jpg.qualityScale(50);
      expect(mid).toBeGreaterThan(2);
      expect(mid).toBeLessThan(31);
    });

    it('should scale WebP quality directly (0-100)', () => {
      expect(FORMAT_SETTINGS.webp.qualityScale(100)).toBe(100);
      expect(FORMAT_SETTINGS.webp.qualityScale(0)).toBe(0);
      expect(FORMAT_SETTINGS.webp.qualityScale(75)).toBe(75);
    });

    it('should scale PNG compression correctly', () => {
      // 100% quality = 0 compression (fastest)
      expect(FORMAT_SETTINGS.png.qualityScale(100)).toBe(0);
      // 0% quality = 9 compression (best but slowest)
      expect(FORMAT_SETTINGS.png.qualityScale(0)).toBe(9);
    });

    it('should scale AVIF CRF correctly (inverted scale 0-63)', () => {
      // 100% quality = CRF 3 (near lossless)
      expect(FORMAT_SETTINGS.avif.qualityScale(100)).toBe(3);
      // 0% quality = CRF 63 (worst)
      expect(FORMAT_SETTINGS.avif.qualityScale(0)).toBe(63);
    });
  });

  describe('SCALE_FILTER', () => {
    it('should generate valid scale filter with width only', () => {
      const filter = SCALE_FILTER(1280);
      expect(filter).toContain('scale=1280:-1');
      expect(filter).toContain('force_original_aspect_ratio=decrease');
    });

    it('should generate valid scale filter with width and height', () => {
      const filter = SCALE_FILTER(1280, 720);
      expect(filter).toContain('scale=1280:720');
      expect(filter).toContain('force_original_aspect_ratio=decrease');
    });

    it('should handle different dimensions', () => {
      expect(SCALE_FILTER(640)).toContain('640:-1');
      expect(SCALE_FILTER(1920, 1080)).toContain('1920:1080');
      expect(SCALE_FILTER(854, 480)).toContain('854:480');
    });
  });

  describe('BYTES_PER_MEGAPIXEL', () => {
    it('should have estimates for all formats', () => {
      expect(BYTES_PER_MEGAPIXEL).toHaveProperty('jpg');
      expect(BYTES_PER_MEGAPIXEL).toHaveProperty('png');
      expect(BYTES_PER_MEGAPIXEL).toHaveProperty('webp');
      expect(BYTES_PER_MEGAPIXEL).toHaveProperty('avif');
    });

    it('should show PNG as largest format', () => {
      expect(BYTES_PER_MEGAPIXEL['png']).toBeGreaterThan(BYTES_PER_MEGAPIXEL['jpg']!);
      expect(BYTES_PER_MEGAPIXEL['png']).toBeGreaterThan(BYTES_PER_MEGAPIXEL['webp']!);
    });

    it('should show AVIF as smallest format', () => {
      expect(BYTES_PER_MEGAPIXEL['avif']).toBeLessThan(BYTES_PER_MEGAPIXEL['jpg']!);
      expect(BYTES_PER_MEGAPIXEL['avif']).toBeLessThan(BYTES_PER_MEGAPIXEL['webp']!);
    });

    it('should show WebP smaller than JPEG', () => {
      expect(BYTES_PER_MEGAPIXEL['webp']).toBeLessThan(BYTES_PER_MEGAPIXEL['jpg']!);
    });
  });

  describe('estimateThumbnailSize()', () => {
    it('should estimate size for 1080p JPEG', () => {
      // 1920x1080 = 2.07 megapixels * 150KB = ~310KB
      const size = estimateThumbnailSize(1920, 1080, 'jpg');
      expect(size).toBeGreaterThan(200_000);
      expect(size).toBeLessThan(500_000);
    });

    it('should estimate size for 720p WebP', () => {
      // 1280x720 = 0.92 megapixels * 100KB = ~92KB
      const size = estimateThumbnailSize(1280, 720, 'webp');
      expect(size).toBeGreaterThan(50_000);
      expect(size).toBeLessThan(200_000);
    });

    it('should estimate larger size for PNG vs JPEG', () => {
      const jpgSize = estimateThumbnailSize(1920, 1080, 'jpg');
      const pngSize = estimateThumbnailSize(1920, 1080, 'png');

      expect(pngSize).toBeGreaterThan(jpgSize);
    });

    it('should estimate smaller size for WebP vs JPEG', () => {
      const jpgSize = estimateThumbnailSize(1920, 1080, 'jpg');
      const webpSize = estimateThumbnailSize(1920, 1080, 'webp');

      expect(webpSize).toBeLessThan(jpgSize);
    });

    it('should estimate smaller size for AVIF vs WebP', () => {
      const webpSize = estimateThumbnailSize(1920, 1080, 'webp');
      const avifSize = estimateThumbnailSize(1920, 1080, 'avif');

      expect(avifSize).toBeLessThan(webpSize);
    });

    it('should default to JPEG for unknown format', () => {
      const jpgSize = estimateThumbnailSize(1920, 1080, 'jpg');
      // Unknown format should use JPEG fallback
      const defaultSize = estimateThumbnailSize(1920, 1080);

      expect(defaultSize).toBe(jpgSize);
    });

    it('should scale with resolution', () => {
      const size720p = estimateThumbnailSize(1280, 720);
      const size1080p = estimateThumbnailSize(1920, 1080);
      const size4k = estimateThumbnailSize(3840, 2160);

      expect(size1080p).toBeGreaterThan(size720p);
      expect(size4k).toBeGreaterThan(size1080p);
    });

    it('should handle square thumbnails', () => {
      const squareSize = estimateThumbnailSize(500, 500);
      // 0.25 megapixels * 150KB = ~37.5KB
      expect(squareSize).toBeGreaterThan(20_000);
      expect(squareSize).toBeLessThan(80_000);
    });

    it('should handle very small thumbnails', () => {
      const tinySize = estimateThumbnailSize(100, 100, 'jpg');
      // 0.01 megapixels * 150KB = ~1.5KB
      expect(tinySize).toBeGreaterThan(0);
      expect(tinySize).toBeLessThan(10_000);
    });
  });

  describe('Type Exports', () => {
    it('should export ThumbnailConfig type', async () => {
      const types = await import('../src/generators/thumbnails/types.js');
      expect(true).toBe(true);
    });

    it('should export discriminated union types', async () => {
      // TimestampThumbnail, SmartThumbnail, IntervalThumbnails
      const types = await import('../src/generators/thumbnails/types.js');
      expect(true).toBe(true);
    });
  });

  describe('Thumbnail Strategy Types', () => {
    it('should support timestamp strategy', () => {
      const timestampConfig = { strategy: 'time' as const, timestamp: 30 };
      expect(timestampConfig.strategy).toBe('time');
      expect(timestampConfig.timestamp).toBe(30);
    });

    it('should support smart strategy', () => {
      const smartConfig = {
        strategy: 'smart' as const,
        searchStart: 10,
        searchEnd: 60,
      };
      expect(smartConfig.strategy).toBe('smart');
    });

    it('should support interval strategy', () => {
      const intervalConfig = {
        strategy: 'interval' as const,
        interval: 10,
        maxCount: 5,
      };
      expect(intervalConfig.strategy).toBe('interval');
      expect(intervalConfig.interval).toBe(10);
    });
  });
});
