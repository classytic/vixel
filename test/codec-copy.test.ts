/**
 * Codec Compatibility Tests
 * =========================
 * Tests HLS codec compatibility detection
 */

import { describe, test, expect } from 'vitest';
import {
  checkHLSCompatibility,
  isHLSVideoCodec,
  isHLSAudioCodec,
  HLS_VIDEO_CODECS,
  HLS_AUDIO_CODECS,
} from '../src/core/codecs.js';

describe('HLS Codec Compatibility', () => {
  describe('Video Codec Detection', () => {
    test('should detect H.264 as HLS-compatible', () => {
      expect(isHLSVideoCodec('h264')).toBe(true);
      expect(isHLSVideoCodec('H264')).toBe(true);
      expect(isHLSVideoCodec('avc')).toBe(true);
      expect(isHLSVideoCodec('avc1')).toBe(true);
    });

    test('should detect HEVC as HLS-compatible', () => {
      expect(isHLSVideoCodec('hevc')).toBe(true);
      expect(isHLSVideoCodec('h265')).toBe(true);
      expect(isHLSVideoCodec('hvc1')).toBe(true);
      expect(isHLSVideoCodec('hev1')).toBe(true);
    });

    test('should detect VP9 as NOT HLS-compatible', () => {
      expect(isHLSVideoCodec('vp9')).toBe(false);
      expect(isHLSVideoCodec('VP9')).toBe(false);
    });

    test('should detect VP8 as NOT HLS-compatible', () => {
      expect(isHLSVideoCodec('vp8')).toBe(false);
    });

    test('should detect AV1 as NOT HLS-compatible', () => {
      expect(isHLSVideoCodec('av1')).toBe(false);
      expect(isHLSVideoCodec('av01')).toBe(false);
    });
  });

  describe('Audio Codec Detection', () => {
    test('should detect AAC as HLS-compatible', () => {
      expect(isHLSAudioCodec('aac')).toBe(true);
      expect(isHLSAudioCodec('AAC')).toBe(true);
      expect(isHLSAudioCodec('mp4a')).toBe(true);
    });

    test('should detect MP3 as HLS-compatible', () => {
      expect(isHLSAudioCodec('mp3')).toBe(true);
    });

    test('should detect AC3/EAC3 as HLS-compatible', () => {
      expect(isHLSAudioCodec('ac3')).toBe(true);
      expect(isHLSAudioCodec('eac3')).toBe(true);
      expect(isHLSAudioCodec('ec3')).toBe(true);
    });

    test('should detect Opus as NOT HLS-compatible', () => {
      expect(isHLSAudioCodec('opus')).toBe(false);
      expect(isHLSAudioCodec('OPUS')).toBe(false);
    });

    test('should detect Vorbis as NOT HLS-compatible', () => {
      expect(isHLSAudioCodec('vorbis')).toBe(false);
    });

    test('should treat null/undefined audio as compatible (silent video)', () => {
      expect(isHLSAudioCodec(null)).toBe(true);
      expect(isHLSAudioCodec(undefined)).toBe(true);
    });
  });

  describe('Full Compatibility Check', () => {
    test('should detect H.264+AAC as fully compatible (can copy)', () => {
      const result = checkHLSCompatibility('h264', 'aac');
      expect(result.canCopy).toBe(true);
      expect(result.video).toBe(true);
      expect(result.audio).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should detect HEVC+AAC as fully compatible', () => {
      const result = checkHLSCompatibility('hevc', 'aac');
      expect(result.canCopy).toBe(true);
    });

    test('should detect H.264+MP3 as fully compatible', () => {
      const result = checkHLSCompatibility('h264', 'mp3');
      expect(result.canCopy).toBe(true);
    });

    test('should detect VP9+Opus as NOT compatible', () => {
      const result = checkHLSCompatibility('vp9', 'opus');
      expect(result.canCopy).toBe(false);
      expect(result.video).toBe(false);
      expect(result.audio).toBe(false);
      expect(result.reason).toContain('video');
      expect(result.reason).toContain('audio');
    });

    test('should detect H.264+Opus as partially incompatible (audio issue)', () => {
      const result = checkHLSCompatibility('h264', 'opus');
      expect(result.canCopy).toBe(false);
      expect(result.video).toBe(true);
      expect(result.audio).toBe(false);
      expect(result.reason).toContain('audio');
    });

    test('should detect VP9+AAC as partially incompatible (video issue)', () => {
      const result = checkHLSCompatibility('vp9', 'aac');
      expect(result.canCopy).toBe(false);
      expect(result.video).toBe(false);
      expect(result.audio).toBe(true);
      expect(result.reason).toContain('video');
    });

    test('should handle silent videos (no audio codec)', () => {
      const result = checkHLSCompatibility('h264', null);
      expect(result.canCopy).toBe(true);
      expect(result.audioCodec).toBeNull();
    });
  });

  describe('Codec Constants', () => {
    test('should export HLS-compatible video codecs', () => {
      expect(HLS_VIDEO_CODECS).toContain('h264');
      expect(HLS_VIDEO_CODECS).toContain('hevc');
      expect(HLS_VIDEO_CODECS.length).toBeGreaterThan(0);
    });

    test('should export HLS-compatible audio codecs', () => {
      expect(HLS_AUDIO_CODECS).toContain('aac');
      expect(HLS_AUDIO_CODECS).toContain('mp3');
      expect(HLS_AUDIO_CODECS.length).toBeGreaterThan(0);
    });
  });
});
