/**
 * Concatenation Generator Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { concatenateVideos } from '../src/generators/concat/index.js';
import { DEFAULT_CONCAT_CONFIG, validateConcatConfig } from '../src/generators/concat/constants.js';
import { trimVideo } from '../src/generators/trim/index.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const OUTPUT_DIR = join(__dirname, 'output', 'concat');

describe('Concatenation Generator', () => {
  beforeAll(async () => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Create test clips for concatenation
    await trimVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(OUTPUT_DIR, 'clip1.mp4'),
      { start: 0, end: 2 }
    );

    await trimVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(OUTPUT_DIR, 'clip2.mp4'),
      { start: 3, end: 5 }
    );

    await trimVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(OUTPUT_DIR, 'clip3.mp4'),
      { start: 6, end: 8 }
    );
  });

  afterAll(async () => {
    try {
      await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('Constants', () => {
    it('should have correct default config', () => {
      expect(DEFAULT_CONCAT_CONFIG.method).toBe('auto');
      expect(DEFAULT_CONCAT_CONFIG.videoCodec).toBe('libx264');
      expect(DEFAULT_CONCAT_CONFIG.crf).toBe(23);
    });
  });

  describe('Validation', () => {
    it('should validate file count', () => {
      expect(() => validateConcatConfig(2)).not.toThrow();
      expect(() => validateConcatConfig(10)).not.toThrow();
    });

    it('should throw for too few files', () => {
      expect(() => validateConcatConfig(1)).toThrow('requires at least 2 files');
    });

    it('should throw for too many files', () => {
      expect(() => validateConcatConfig(101)).toThrow('Too many files');
    });
  });

  describe('Integration Tests', () => {
    // Skip on Windows due to FFmpeg codec compatibility issues
    it.skipIf(process.platform === 'win32')('should concatenate videos with auto method', async () => {
      const outputPath = join(OUTPUT_DIR, 'concatenated-auto.mp4');

      const sources = [
        { inputPath: join(OUTPUT_DIR, 'clip1.mp4'), duration: 2 },
        { inputPath: join(OUTPUT_DIR, 'clip2.mp4'), duration: 2 },
        { inputPath: join(OUTPUT_DIR, 'clip3.mp4'), duration: 2 },
      ];

      const result = await concatenateVideos(sources, outputPath, { method: 'auto' });

      expect(result.outputPath).toBe(outputPath);
      expect(result.fileCount).toBe(3);
      expect(result.method).toMatch(/fast|reencode/);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    // Skip on Windows due to FFmpeg codec compatibility issues
    it.skipIf(process.platform === 'win32')('should concatenate videos with fast method', async () => {
      const outputPath = join(OUTPUT_DIR, 'concatenated-fast.mp4');

      const sources = [
        { inputPath: join(OUTPUT_DIR, 'clip1.mp4'), duration: 2 },
        { inputPath: join(OUTPUT_DIR, 'clip2.mp4'), duration: 2 },
      ];

      const result = await concatenateVideos(sources, outputPath, { method: 'fast' });

      expect(result.method).toBe('fast');
      expect(result.fileCount).toBe(2);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    // Skip on Windows due to FFmpeg codec compatibility issues
    it.skipIf(process.platform === 'win32')('should concatenate videos with reencode method', async () => {
      const outputPath = join(OUTPUT_DIR, 'concatenated-reencode.mp4');

      const sources = [
        { inputPath: join(OUTPUT_DIR, 'clip1.mp4'), duration: 2 },
        { inputPath: join(OUTPUT_DIR, 'clip2.mp4'), duration: 2 },
        { inputPath: join(OUTPUT_DIR, 'clip3.mp4'), duration: 2 },
      ];

      const result = await concatenateVideos(sources, outputPath, {
        method: 'reencode',
        targetWidth: 1280,
        targetHeight: 720,
      });

      expect(result.method).toBe('reencode');
      expect(result.fileCount).toBe(3);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);
  });
});
