/**
 * Watermark Generator Tests
 * ===========================
 * Tests for adding image and text watermarks to videos.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import {
  addWatermark,
  type WatermarkPosition,
} from '../src/generators/watermark/index.js';
import {
  DEFAULT_WATERMARK_SCALE,
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_MARGIN,
  DEFAULT_TEXT_COLOR,
  buildImageOverlayFilter,
  buildTextOverlayFilter,
  calculateFontSize,
  POSITION_OVERLAYS,
} from '../src/generators/watermark/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const TEST_OUTPUT_DIR = join(__dirname, 'output', 'watermark');

// Cleanup before tests
async function cleanup() {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
}

describe('Watermark Generator', () => {
  beforeEach(async () => {
    await cleanup();
  });

  describe('Constants', () => {
    it('should have valid defaults', () => {
      expect(DEFAULT_WATERMARK_SCALE).toBe(0.1);
      expect(DEFAULT_WATERMARK_OPACITY).toBe(1.0);
      expect(DEFAULT_WATERMARK_MARGIN).toBe(10);
      expect(DEFAULT_TEXT_COLOR).toBe('white');
    });

    it('should have position overlays for all positions', () => {
      expect(POSITION_OVERLAYS).toHaveProperty('top-left');
      expect(POSITION_OVERLAYS).toHaveProperty('top-right');
      expect(POSITION_OVERLAYS).toHaveProperty('bottom-left');
      expect(POSITION_OVERLAYS).toHaveProperty('bottom-right');
      expect(POSITION_OVERLAYS).toHaveProperty('center');
    });
  });

  describe('Filter Builders', () => {
    it('should build image overlay filter for bottom-right', () => {
      const filter = buildImageOverlayFilter('bottom-right', 0.1, 1.0);
      expect(filter).toContain('scale=iw*0.1:-1');
      expect(filter).toContain('overlay=W-w-10:H-h-10');
    });

    it('should build image overlay filter with opacity', () => {
      const filter = buildImageOverlayFilter('center', 0.15, 0.8);
      expect(filter).toContain('scale=iw*0.15:-1');
      expect(filter).toContain('colorchannelmixer=aa=0.8');
      expect(filter).toContain('overlay=(W-w)/2:(H-h)/2');
    });

    it('should build text overlay filter', () => {
      const filter = buildTextOverlayFilter('Test', 'center', 24, 'white', 1.0);
      expect(filter).toContain("drawtext=text='Test'");
      expect(filter).toContain('fontsize=24');
      expect(filter).toContain('fontcolor=white@');
      expect(filter).toContain('x=(w-tw)/2:y=(h-th)/2');
    });

    it('should escape special characters in text', () => {
      const filter = buildTextOverlayFilter("Test: Don't", 'top-left', 24, 'white', 1.0);
      expect(filter).toContain("text='Test\\: Don\\'t'");
    });
  });

  describe('Font Size Calculation', () => {
    it('should calculate 3% of video height', () => {
      expect(calculateFontSize(1080)).toBe(32);
      expect(calculateFontSize(720)).toBe(22);
      expect(calculateFontSize(480)).toBe(14);
    });
  });

  describe('Integration Tests', () => {
    // Skip on Windows due to FFmpeg font configuration issues
    it.skipIf(process.platform === 'win32')('should add text watermark to video', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'text-watermark.mp4');

      const result = await addWatermark(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        {
          type: 'text',
          text: 'Test Watermark',
          position: 'bottom-right',
          fontSize: 24,
          fontColor: 'white',
          opacity: 0.9,
        }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.watermarkType).toBe('text');
      expect(result.position).toBe('bottom-right');
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.duration).toBe(10);

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    // Skip on Windows due to FFmpeg font configuration issues
    it.skipIf(process.platform === 'win32')('should add text watermark with auto font size', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'text-auto-font.mp4');

      const result = await addWatermark(
        { inputPath: TEST_VIDEO_PATH, duration: 10, height: 1080 },
        outputPath,
        {
          type: 'text',
          text: 'Copyright © 2026',
          position: 'bottom-center',
        }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.watermarkType).toBe('text');

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();
    }, 30000);

    // Skip on Windows due to FFmpeg font configuration issues
    it.skipIf(process.platform === 'win32')('should handle different positions', async () => {
      const positions: WatermarkPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

      for (const position of positions) {
        const outputPath = join(TEST_OUTPUT_DIR, `text-${position}.mp4`);

        const result = await addWatermark(
          { inputPath: TEST_VIDEO_PATH, duration: 10 },
          outputPath,
          {
            type: 'text',
            text: position,
            position,
          }
        );

        expect(result.position).toBe(position);
        await expect(fs.access(outputPath)).resolves.not.toThrow();
      }
    }, 90000);

    it('should throw error for non-existent input', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'error.mp4');

      await expect(
        addWatermark(
          { inputPath: join(__dirname, 'non-existent.mp4'), duration: 10 },
          outputPath,
          { type: 'text', text: 'Test' }
        )
      ).rejects.toThrow('Input file not found');
    });

    it('should throw error for missing output path', async () => {
      await expect(
        addWatermark(
          { inputPath: TEST_VIDEO_PATH, duration: 10 },
          '',
          { type: 'text', text: 'Test' }
        )
      ).rejects.toThrow('Input path and output path are required');
    });
  });
});
