/**
 * Compression Generator Tests
 * =============================
 * Tests for video compression with quality control and hardware acceleration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import {
  compressVideo,
  detectHardwareAccel,
} from '../src/generators/compression/index.js';
import {
  DEFAULT_VIDEO_CODEC,
  DEFAULT_CRF,
  DEFAULT_PRESET,
  DEFAULT_AUDIO_CODEC,
  DEFAULT_AUDIO_BITRATE,
  HARDWARE_ENCODERS,
  buildVideoEncoderArgs,
  buildAudioEncoderArgs,
  getHardwareEncoder,
} from '../src/generators/compression/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const TEST_OUTPUT_DIR = join(__dirname, 'output', 'compression');

// Cleanup before tests
async function cleanup() {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
}

describe('Compression Generator', () => {
  beforeEach(async () => {
    await cleanup();
  });

  describe('Constants', () => {
    it('should have valid defaults', () => {
      expect(DEFAULT_VIDEO_CODEC).toBe('libx264');
      expect(DEFAULT_CRF).toBe(23);
      expect(DEFAULT_PRESET).toBe('medium');
      expect(DEFAULT_AUDIO_CODEC).toBe('aac');
      expect(DEFAULT_AUDIO_BITRATE).toBe('128k');
    });

    it('should have hardware encoder mappings', () => {
      expect(HARDWARE_ENCODERS).toHaveProperty('none');
      expect(HARDWARE_ENCODERS).toHaveProperty('nvenc');
      expect(HARDWARE_ENCODERS).toHaveProperty('qsv');
      expect(HARDWARE_ENCODERS).toHaveProperty('videotoolbox');
      expect(HARDWARE_ENCODERS).toHaveProperty('vaapi');
    });

    it('should have correct NVENC encoder names', () => {
      expect(HARDWARE_ENCODERS.nvenc).toEqual({
        h264: 'h264_nvenc',
        h265: 'hevc_nvenc',
      });
    });
  });

  describe('Hardware Encoder Helpers', () => {
    it('should get hardware encoder for NVENC H.264', () => {
      const encoder = getHardwareEncoder('libx264', 'nvenc');
      expect(encoder).toBe('h264_nvenc');
    });

    it('should get hardware encoder for NVENC H.265', () => {
      const encoder = getHardwareEncoder('libx265', 'nvenc');
      expect(encoder).toBe('hevc_nvenc');
    });

    it('should return null for none acceleration', () => {
      const encoder = getHardwareEncoder('libx264', 'none');
      expect(encoder).toBeNull();
    });
  });

  describe('Encoder Args Builders', () => {
    it('should build software H.264 args', () => {
      const args = buildVideoEncoderArgs('libx264', 'none', 23, 'medium');
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-crf');
      expect(args).toContain('23');
      expect(args).toContain('-preset');
      expect(args).toContain('medium');
      expect(args).toContain('-movflags');
      expect(args).toContain('+faststart');
    });

    it('should build hardware NVENC args', () => {
      const args = buildVideoEncoderArgs('libx264', 'nvenc', 23, 'medium');
      expect(args).toContain('-c:v');
      expect(args).toContain('h264_nvenc');
      expect(args).toContain('-qp');
      expect(args).toContain('23');
    });

    it('should build AAC audio args', () => {
      const args = buildAudioEncoderArgs('aac', '128k');
      expect(args).toEqual(['-c:a', 'aac', '-b:a', '128k']);
    });

    it('should build copy audio args', () => {
      const args = buildAudioEncoderArgs('copy', '128k');
      expect(args).toEqual(['-c:a', 'copy']);
    });
  });

  describe('Hardware Detection', () => {
    it('should detect available hardware acceleration', async () => {
      const available = await detectHardwareAccel('ffmpeg');

      expect(Array.isArray(available)).toBe(true);
      expect(available).toContain('none'); // Always available

      console.log(`🔧 Available hardware acceleration: ${available.join(', ')}`);
    }, 10000);
  });

  describe('Integration Tests', () => {
    it('should compress video with default settings', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-default.mp4');

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
      expect(result.savedBytes).toBeGreaterThanOrEqual(0);
      expect(result.videoCodec).toBe('libx264');
      expect(result.audioCodec).toBe('aac');

      // Verify file exists
      await expect(fs.access(outputPath)).resolves.not.toThrow();

      console.log(`✅ Default compression:`);
      console.log(`   Original: ${(result.originalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Compressed: ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Ratio: ${(result.compressionRatio * 100).toFixed(1)}%`);
      console.log(`   Saved: ${(result.savedBytes / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should compress with high quality (CRF 18)', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-high-quality.mp4');

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { crf: 18, preset: 'slow' }
      );

      expect(result.compressedSize).toBeGreaterThan(0);

      console.log(`✅ High quality (CRF 18): ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }, 90000);

    it.skipIf(process.platform === 'win32')('should compress with medium quality (CRF 28)', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-medium-quality.mp4');

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { crf: 28, preset: 'fast' }
      );

      expect(result.compressedSize).toBeGreaterThan(0);

      console.log(`✅ Medium quality (CRF 28): ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);

    it('should compress with H.265/HEVC codec', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-h265.mp4');

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { videoCodec: 'libx265', crf: 28, preset: 'medium' }
      );

      expect(result.videoCodec).toBe('libx265');
      expect(result.compressedSize).toBeGreaterThan(0);

      console.log(`✅ H.265 compression: ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }, 90000);

    it('should attempt hardware acceleration if available', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-hw-accel.mp4');

      // Detect available hardware
      const available = await detectHardwareAccel('ffmpeg');
      const hwAccel = available.find(h => h !== 'none') || 'nvenc';

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { hardwareAccel: hwAccel, crf: 23, preset: 'medium' }
      );

      expect(result.compressedSize).toBeGreaterThan(0);

      console.log(`✅ Hardware acceleration (${hwAccel}): ${result.videoCodec}`);
      console.log(`   Size: ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);

    it('should fallback to software if hardware not available', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-fallback.mp4');

      // Try unavailable hardware (should fallback)
      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { hardwareAccel: 'nvenc', crf: 23 } // May not be available
      );

      expect(result.compressedSize).toBeGreaterThan(0);

      console.log(`✅ Fallback test: ${result.videoCodec}`);
    }, 60000);

    it('should handle copy audio codec', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'compressed-audio-copy.mp4');

      const result = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { audioCodec: 'copy' }
      );

      expect(result.audioCodec).toBe('copy');

      console.log(`✅ Audio copy: ${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }, 60000);

    it('should throw error for non-existent input', async () => {
      const outputPath = join(TEST_OUTPUT_DIR, 'error.mp4');

      await expect(
        compressVideo(
          { inputPath: join(__dirname, 'non-existent.mp4'), duration: 10 },
          outputPath
        )
      ).rejects.toThrow('Input file not found');
    });

    it('should throw error for missing output path', async () => {
      await expect(
        compressVideo(
          { inputPath: TEST_VIDEO_PATH, duration: 10 },
          ''
        )
      ).rejects.toThrow('Input path and output path are required');
    });
  });
});
