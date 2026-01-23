/**
 * Format Conversion Generator Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { convertFormat } from '../src/generators/convert/index.js';
import {
  DEFAULT_CONVERT_CONFIG,
  VALID_VIDEO_FORMATS,
  validateFormatConfig,
  getCodecsForFormat,
} from '../src/generators/convert/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const OUTPUT_DIR = join(__dirname, 'output', 'convert');

describe('Format Conversion Generator', () => {
  beforeAll(async () => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('Constants', () => {
    it('should have correct default config', () => {
      expect(DEFAULT_CONVERT_CONFIG.crf).toBe(23);
      expect(DEFAULT_CONVERT_CONFIG.preset).toBe('medium');
    });

    it('should have all valid formats', () => {
      expect(VALID_VIDEO_FORMATS).toContain('mp4');
      expect(VALID_VIDEO_FORMATS).toContain('webm');
      expect(VALID_VIDEO_FORMATS).toContain('mov');
      expect(VALID_VIDEO_FORMATS).toContain('avi');
    });

    it('should get codecs for each format', () => {
      expect(getCodecsForFormat('mp4')).toEqual({
        videoCodec: 'libx264',
        audioCodec: 'aac',
      });

      expect(getCodecsForFormat('webm')).toEqual({
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
      });

      expect(getCodecsForFormat('mov')).toEqual({
        videoCodec: 'libx264',
        audioCodec: 'aac',
      });

      expect(getCodecsForFormat('avi')).toEqual({
        videoCodec: 'libx264',
        audioCodec: 'mp3',
      });
    });
  });

  describe('Validation', () => {
    it('should validate formats', () => {
      expect(() => validateFormatConfig('mp4')).not.toThrow();
      expect(() => validateFormatConfig('webm')).not.toThrow();
      expect(() => validateFormatConfig('mov')).not.toThrow();
      expect(() => validateFormatConfig('avi')).not.toThrow();
    });

    it('should throw for invalid format', () => {
      expect(() => validateFormatConfig('invalid' as any)).toThrow('Invalid video format');
    });
  });

  describe('Integration Tests', () => {
    it('should convert to WebM', async () => {
      const outputPath = join(OUTPUT_DIR, 'converted.webm');

      const result = await convertFormat(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'webm', crf: 28 }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.format).toBe('webm');
      expect(result.videoCodec).toBe('libvpx-vp9');
      expect(result.audioCodec).toBe('libopus');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it('should convert to MOV', async () => {
      const outputPath = join(OUTPUT_DIR, 'converted.mov');

      const result = await convertFormat(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'mov', crf: 23 }
      );

      expect(result.format).toBe('mov');
      expect(result.videoCodec).toBe('libx264');
      expect(result.audioCodec).toBe('aac');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it('should convert MP4 with high quality', async () => {
      const outputPath = join(OUTPUT_DIR, 'high-quality.mp4');

      const result = await convertFormat(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'mp4', crf: 18, preset: 'slow' }
      );

      expect(result.format).toBe('mp4');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it('should convert AVI with custom codecs', async () => {
      const outputPath = join(OUTPUT_DIR, 'converted.avi');

      const result = await convertFormat(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'avi', crf: 23 }
      );

      expect(result.format).toBe('avi');
      expect(result.videoCodec).toBe('libx264');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);
  });
});
