/**
 * Trim/Clip Generator Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { trimVideo } from '../src/generators/trim/index.js';
import { DEFAULT_TRIM_CONFIG, validateTrimConfig } from '../src/generators/trim/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const OUTPUT_DIR = join(__dirname, 'output', 'trim');

describe('Trim Generator', () => {
  beforeAll(async () => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('Constants', () => {
    it('should have correct default config', () => {
      expect(DEFAULT_TRIM_CONFIG.accurate).toBe(false);
      expect(DEFAULT_TRIM_CONFIG.videoCodec).toBe('copy');
      expect(DEFAULT_TRIM_CONFIG.crf).toBe(23);
    });
  });

  describe('Validation', () => {
    it('should validate trim config', () => {
      expect(() => validateTrimConfig(1, 5, 10)).not.toThrow();
    });

    it('should throw for negative start time', () => {
      expect(() => validateTrimConfig(-1, 5, 10)).toThrow('Start time cannot be negative');
    });

    it('should throw when start exceeds duration', () => {
      expect(() => validateTrimConfig(15, 20, 10)).toThrow('exceeds video duration');
    });

    it('should throw when end is before start', () => {
      expect(() => validateTrimConfig(5, 3, 10)).toThrow('must be greater than start time');
    });

    it('should throw when end exceeds duration', () => {
      expect(() => validateTrimConfig(1, 15, 10)).toThrow('exceeds video duration');
    });
  });

  describe('Integration Tests', () => {
    it('should trim video with fast method (codec copy)', async () => {
      const outputPath = join(OUTPUT_DIR, 'fast-trim.mp4');

      const result = await trimVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { start: 2, end: 5, accurate: false }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.method).toBe('fast');
      expect(result.start).toBe(2);
      expect(result.duration).toBe(3);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);

      // Verify file exists
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it('should trim video with accurate method (re-encode)', async () => {
      const outputPath = join(OUTPUT_DIR, 'accurate-trim.mp4');

      const result = await trimVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { start: 1, end: 3, accurate: true, videoCodec: 'libx264', crf: 23 }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.method).toBe('accurate');
      expect(result.start).toBe(1);
      expect(result.duration).toBe(2);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(process.platform === 'win32')('should trim from start without end time', async () => {
      const outputPath = join(OUTPUT_DIR, 'trim-to-end.mp4');

      const result = await trimVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { start: 7 }
      );

      expect(result.start).toBe(7);
      expect(result.duration).toBe(3); // 10 - 7
      expect(result.method).toBe('fast');

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(process.platform === 'win32')('should handle H.265 codec', async () => {
      const outputPath = join(OUTPUT_DIR, 'trim-h265.mp4');

      const result = await trimVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { start: 0, end: 2, accurate: true, videoCodec: 'libx265', crf: 28 }
      );

      expect(result.method).toBe('accurate');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);
  });
});
