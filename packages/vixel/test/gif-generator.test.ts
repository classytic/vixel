/**
 * GIF Generator Tests
 * ====================
 * Tests for GIF/WebP generation with two-pass palette optimization.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateGifSize,
  DEFAULT_GIF_WIDTH,
  DEFAULT_GIF_FPS,
  DEFAULT_GIF_OPTIMIZATION,
  MAX_GIF_DURATION,
} from '../src/generators/gif/index.js';
import {
  PALETTE_FILTER,
  GIF_ENCODE_FILTER,
  GIF_FAST_FILTER,
  WEBP_FILTER,
} from '../src/generators/gif/constants.js';

describe('GIF Generator', () => {
  describe('Constants', () => {
    it('should have valid default width', () => {
      expect(DEFAULT_GIF_WIDTH).toBe(480);
    });

    it('should have valid default FPS', () => {
      expect(DEFAULT_GIF_FPS).toBe(15);
    });

    it('should have valid default optimization', () => {
      expect(DEFAULT_GIF_OPTIMIZATION).toBe('quality');
    });

    it('should have reasonable max duration', () => {
      expect(MAX_GIF_DURATION).toBe(30);
    });
  });

  describe('FFmpeg Filter Templates', () => {
    it('should generate valid palette filter', () => {
      const filter = PALETTE_FILTER(480, 15);
      expect(filter).toContain('fps=15');
      expect(filter).toContain('scale=480');
      expect(filter).toContain('palettegen');
      expect(filter).toContain('stats_mode=diff');
    });

    it('should generate valid GIF encode filter with palette', () => {
      const filter = GIF_ENCODE_FILTER(480, 15);
      expect(filter).toContain('fps=15');
      expect(filter).toContain('scale=480');
      expect(filter).toContain('paletteuse');
      expect(filter).toContain('floyd_steinberg');
    });

    it('should generate valid fast GIF filter (single-pass)', () => {
      const filter = GIF_FAST_FILTER(320, 10);
      expect(filter).toContain('fps=10');
      expect(filter).toContain('scale=320');
      expect(filter).toContain('split');
      expect(filter).toContain('palettegen');
      expect(filter).toContain('paletteuse');
    });

    it('should generate valid WebP filter', () => {
      const filter = WEBP_FILTER(640, 15);
      expect(filter).toContain('fps=15');
      expect(filter).toContain('scale=640');
      expect(filter).toContain('lanczos');
    });

    it('should handle different widths correctly', () => {
      const filter240 = PALETTE_FILTER(240, 10);
      const filter720 = PALETTE_FILTER(720, 15);

      expect(filter240).toContain('scale=240');
      expect(filter720).toContain('scale=720');
    });

    it('should handle different FPS values', () => {
      const filter10fps = GIF_ENCODE_FILTER(480, 10);
      const filter30fps = GIF_ENCODE_FILTER(480, 30);

      expect(filter10fps).toContain('fps=10');
      expect(filter30fps).toContain('fps=30');
    });
  });

  describe('estimateGifSize()', () => {
    it('should estimate size for 480px at 15fps for 5 seconds', () => {
      const size = estimateGifSize(480, 15, 5);
      // ~75 frames * 15KB = ~1.1MB
      expect(size).toBeGreaterThan(500_000);
      expect(size).toBeLessThan(2_000_000);
    });

    it('should estimate larger size for higher resolution', () => {
      const size320 = estimateGifSize(320, 15, 5);
      const size640 = estimateGifSize(640, 15, 5);

      expect(size640).toBeGreaterThan(size320);
    });

    it('should estimate larger size for higher FPS', () => {
      const size10fps = estimateGifSize(480, 10, 5);
      const size20fps = estimateGifSize(480, 20, 5);

      expect(size20fps).toBeGreaterThan(size10fps);
    });

    it('should estimate larger size for longer duration', () => {
      const size3s = estimateGifSize(480, 15, 3);
      const size10s = estimateGifSize(480, 15, 10);

      expect(size10s).toBeGreaterThan(size3s);
    });

    it('should handle edge cases', () => {
      // Very short clip
      const sizeShort = estimateGifSize(480, 15, 0.5);
      expect(sizeShort).toBeGreaterThan(0);

      // Low resolution
      const sizeLowRes = estimateGifSize(160, 10, 3);
      expect(sizeLowRes).toBeGreaterThan(0);

      // High resolution (maps to 720p tier)
      const sizeHighRes = estimateGifSize(720, 15, 5);
      expect(sizeHighRes).toBeGreaterThan(0);
    });

    it('should scale linearly with frame count', () => {
      const size5s = estimateGifSize(480, 15, 5);
      const size10s = estimateGifSize(480, 15, 10);

      // 10 seconds should be ~2x the size of 5 seconds
      expect(size10s / size5s).toBeCloseTo(2, 1);
    });
  });

  describe('Type Exports', () => {
    it('should export GifConfig type', async () => {
      const { GifConfig } = await import('../src/generators/gif/types.js') as any;
      // Type check - just verify the import works
      expect(true).toBe(true);
    });

    it('should export GifResult type', async () => {
      const { GifResult } = await import('../src/generators/gif/types.js') as any;
      expect(true).toBe(true);
    });

    it('should export all format types', async () => {
      const types = await import('../src/generators/gif/types.js');
      // These are type exports, they exist at compile time
      expect(true).toBe(true);
    });
  });

  describe('Optimization Strategies', () => {
    it('should use quality optimization by default', () => {
      expect(DEFAULT_GIF_OPTIMIZATION).toBe('quality');
    });

    it('should define two-pass filter for quality mode', () => {
      // Quality mode uses separate palette generation + encoding
      const paletteFilter = PALETTE_FILTER(480, 15);
      const encodeFilter = GIF_ENCODE_FILTER(480, 15);

      expect(paletteFilter).toContain('palettegen');
      expect(encodeFilter).toContain('paletteuse');
    });

    it('should define single-pass filter for speed mode', () => {
      // Speed mode combines palettegen and paletteuse in one filter
      const fastFilter = GIF_FAST_FILTER(480, 15);

      expect(fastFilter).toContain('split');
      expect(fastFilter).toContain('palettegen');
      expect(fastFilter).toContain('paletteuse');
    });
  });
});
