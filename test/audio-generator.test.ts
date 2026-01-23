/**
 * Audio Generator Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import {
  extractAudio,
  replaceAudio,
  adjustVolume,
  normalizeAudio,
} from '../src/generators/audio/index.js';
import { DEFAULT_AUDIO_CONFIG, validateAudioFormat, validateVolume } from '../src/generators/audio/constants.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const OUTPUT_DIR = join(__dirname, 'output', 'audio');

describe('Audio Generator', () => {
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
      expect(DEFAULT_AUDIO_CONFIG.format).toBe('mp3');
      expect(DEFAULT_AUDIO_CONFIG.bitrate).toBe('192k');
    });
  });

  describe('Validation', () => {
    it('should validate audio formats', () => {
      expect(() => validateAudioFormat('mp3')).not.toThrow();
      expect(() => validateAudioFormat('aac')).not.toThrow();
      expect(() => validateAudioFormat('wav')).not.toThrow();
      expect(() => validateAudioFormat('opus')).not.toThrow();
      expect(() => validateAudioFormat('flac')).not.toThrow();
    });

    it('should throw for invalid format', () => {
      expect(() => validateAudioFormat('invalid' as any)).toThrow('Invalid audio format');
    });

    it('should validate volume', () => {
      expect(() => validateVolume(0.5)).not.toThrow();
      expect(() => validateVolume(1.0)).not.toThrow();
      expect(() => validateVolume(2.0)).not.toThrow();
    });

    it('should throw for invalid volume', () => {
      expect(() => validateVolume(0)).toThrow('must be greater than 0');
      expect(() => validateVolume(-1)).toThrow('must be greater than 0');
      expect(() => validateVolume(11)).toThrow('cannot exceed 10');
    });
  });

  describe('Integration Tests', () => {
    it('should extract audio as MP3', async () => {
      const outputPath = join(OUTPUT_DIR, 'audio.mp3');

      const result = await extractAudio(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'mp3', bitrate: '192k' }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.audioCodec).toBe('libmp3lame');
      expect(result.bitrate).toBe('192k');
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it('should extract audio as AAC', async () => {
      const outputPath = join(OUTPUT_DIR, 'audio.aac');

      const result = await extractAudio(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { format: 'aac', bitrate: '128k' }
      );

      expect(result.audioCodec).toBe('aac');
      expect(result.bitrate).toBe('128k');

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(process.platform === 'win32')('should replace audio in video', async () => {
      // First extract audio
      const audioPath = join(OUTPUT_DIR, 'temp-audio.mp3');
      await extractAudio(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        audioPath
      );

      // Then replace it
      const outputPath = join(OUTPUT_DIR, 'replaced-audio.mp4');
      const result = await replaceAudio(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        audioPath,
        outputPath
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 60000);

    it.skipIf(process.platform === 'win32')('should adjust volume to 50%', async () => {
      const outputPath = join(OUTPUT_DIR, 'volume-50.mp4');

      const result = await adjustVolume(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { volume: 0.5 }
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(process.platform === 'win32')('should adjust volume to 200%', async () => {
      const outputPath = join(OUTPUT_DIR, 'volume-200.mp4');

      const result = await adjustVolume(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath,
        { volume: 2.0 }
      );

      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(process.platform === 'win32')('should normalize audio', async () => {
      const outputPath = join(OUTPUT_DIR, 'normalized.mp4');

      const result = await normalizeAudio(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        outputPath
      );

      expect(result.outputPath).toBe(outputPath);
      expect(result.fileSize).toBeGreaterThan(0);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);
  });
});
