/**
 * Speed Adjustment Generator Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { changeSpeed } from '../src/generators/speed/index.js';
import { DEFAULT_SPEED_CONFIG, MIN_SPEED, MAX_SPEED, validateSpeedConfig } from '../src/generators/speed/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const OUTPUT_DIR = join(__dirname, 'output', 'speed');

describe('Speed Adjustment Generator', () => {
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
      expect(DEFAULT_SPEED_CONFIG.maintainPitch).toBe(false);
      expect(DEFAULT_SPEED_CONFIG.videoCodec).toBe('libx264');
      expect(DEFAULT_SPEED_CONFIG.crf).toBe(23);
    });

    it('should have correct speed limits', () => {
      expect(MIN_SPEED).toBe(0.25);
      expect(MAX_SPEED).toBe(4.0);
    });
  });

  describe('Validation', () => {
    it('should validate speed values', () => {
      expect(() => validateSpeedConfig(0.5)).not.toThrow();
      expect(() => validateSpeedConfig(1.0)).not.toThrow();
      expect(() => validateSpeedConfig(2.0)).not.toThrow();
      expect(() => validateSpeedConfig(0.25)).not.toThrow();
      expect(() => validateSpeedConfig(4.0)).not.toThrow();
    });

    it('should throw for invalid speed', () => {
      expect(() => validateSpeedConfig(0)).toThrow('must be greater than 0');
      expect(() => validateSpeedConfig(-1)).toThrow('must be greater than 0');
      expect(() => validateSpeedConfig(0.2)).toThrow('Speed too slow');
      expect(() => validateSpeedConfig(5.0)).toThrow('Speed too fast');
    });
  });

  describe('Integration Tests', () => {
    it('should slow down video to half speed', async () => {
      const outputPath = join(OUTPUT_DIR, 'slow-0.5x.mp4');

      const result = await changeSpeed(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { speed: 0.5 }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.speed).toBe(0.5);
      expect(result.originalDuration).toBe(10);
      expect(result.newDuration).toBe(20);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should speed up video to double speed', async () => {
      const outputPath = join(OUTPUT_DIR, 'fast-2x.mp4');

      const result = await changeSpeed(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { speed: 2.0 }
      );

      expect(result.speed).toBe(2.0);
      expect(result.originalDuration).toBe(10);
      expect(result.newDuration).toBe(5);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should handle 1.5x speed', async () => {
      const outputPath = join(OUTPUT_DIR, 'medium-1.5x.mp4');

      const result = await changeSpeed(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { speed: 1.5 }
      );

      expect(result.speed).toBe(1.5);
      expect(result.originalDuration).toBe(10);
      expect(result.newDuration).toBeCloseTo(6.67, 1);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should handle minimum speed (0.25x)', async () => {
      const outputPath = join(OUTPUT_DIR, 'slow-0.25x.mp4');

      const result = await changeSpeed(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { speed: 0.25 }
      );

      expect(result.speed).toBe(0.25);
      expect(result.newDuration).toBe(40);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 120000);
  });
});
