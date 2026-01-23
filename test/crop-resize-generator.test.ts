/**
 * Crop/Resize Generator Tests
 * =============================
 * Tests for aspect ratio conversion and video resizing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { cropResize } from '../src/generators/crop-resize/index.js';
import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_CRF,
  buildCropScaleFilter,
} from '../src/generators/crop-resize/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const TEST_OUTPUT_DIR = join(__dirname, 'output', 'crop-resize');

// Cleanup before tests
async function cleanup() {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
}

describe('Crop/Resize Generator', () => {
  beforeEach(async () => {
    await cleanup();
  });

  describe('Constants', () => {
    it('should have valid default CRF', () => {
      expect(DEFAULT_CRF).toBe(23);
      expect(DEFAULT_CRF).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_CRF).toBeLessThanOrEqual(51);
    });

    it('should have presets for all aspect ratios', () => {
      expect(ASPECT_RATIO_PRESETS).toHaveProperty('reels');
      expect(ASPECT_RATIO_PRESETS).toHaveProperty('youtube');
      expect(ASPECT_RATIO_PRESETS).toHaveProperty('square');
      expect(ASPECT_RATIO_PRESETS).toHaveProperty('custom');
    });

    it('should have correct reels dimensions (9:16)', () => {
      const reels = ASPECT_RATIO_PRESETS.reels;
      expect(reels).toEqual({ width: 1080, height: 1920 });
    });

    it('should have correct youtube dimensions (16:9)', () => {
      const youtube = ASPECT_RATIO_PRESETS.youtube;
      expect(youtube).toEqual({ width: 1920, height: 1080 });
    });

    it('should have correct square dimensions (1:1)', () => {
      const square = ASPECT_RATIO_PRESETS.square;
      expect(square).toEqual({ width: 1080, height: 1080 });
    });
  });

  describe('Filter Builders', () => {
    it('should build crop and scale filter', () => {
      const filter = buildCropScaleFilter(1080, 1920);
      expect(filter).toContain('scale=1080:1920');
      expect(filter).toContain('force_original_aspect_ratio=increase');
      expect(filter).toContain('crop=1080:1920');
    });

    it('should build filter for different dimensions', () => {
      const filter = buildCropScaleFilter(1920, 1080);
      expect(filter).toContain('scale=1920:1080');
      expect(filter).toContain('crop=1920:1080');
    });
  });

  describe('Integration Tests', () => {
    it('should convert video to reels format (9:16)', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'reels.mp4');

      const result = await cropResize(
        { inputPath: TEST_VIDEO_PATH, duration: 10, width: 1920, height: 1080 },
        outputPath,
        { preset: 'reels' }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.outputDimensions).toEqual({ width: 1080, height: 1920 });
      expect(result.originalDimensions.width).toBe(1920);
      expect(result.originalDimensions.height).toBe(1080);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.duration).toBe(10);

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);

      console.log(`✅ Reels output: ${outputPath}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);

    it('should convert video to youtube format (16:9)', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'youtube.mp4');

      const result = await cropResize(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { preset: 'youtube' }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.outputDimensions).toEqual({ width: 1920, height: 1080 });

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();

      console.log(`✅ YouTube output: ${outputPath}`);
    }, 60000);

    it('should convert video to square format (1:1)', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'square.mp4');

      const result = await cropResize(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { preset: 'square' }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.outputDimensions).toEqual({ width: 1080, height: 1080 });

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();

      console.log(`✅ Square output: ${outputPath}`);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should handle custom dimensions', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'custom.mp4');

      const result = await cropResize(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        {
          preset: 'custom',
          width: 1280,
          height: 720,
          crf: 25,
        }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.outputDimensions).toEqual({ width: 1280, height: 720 });

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();

      console.log(`✅ Custom output: ${outputPath}`);
    }, 60000);

    // Skip on Windows due to FFmpeg probing issues
    it.skipIf(process.platform === 'win32')('should auto-probe dimensions if not provided', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'auto-probe.mp4');

      const result = await cropResize(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { preset: 'square' }
      );

      expect(result.originalDimensions.width).toBeGreaterThan(0);
      expect(result.originalDimensions.height).toBeGreaterThan(0);

      console.log(`✅ Auto-probed dimensions: ${result.originalDimensions.width}x${result.originalDimensions.height}`);
    }, 60000);

    it('should throw error for non-existent input', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'error.mp4');

      await expect(
        cropResize(
          { inputPath: join(__dirname, 'non-existent.mp4'), duration: 10 },
          outputPath,
          { preset: 'reels' }
        )
      ).rejects.toThrow('Input file not found');
    });

    it('should throw error for custom preset without dimensions', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'error.mp4');

      await expect(
        cropResize(
          { inputPath: TEST_VIDEO_PATH, duration: 10 },
          outputPath,
          { preset: 'custom' }
        )
      ).rejects.toThrow('Custom preset requires width and height');
    });
  });
});
