/**
 * Quality Presets Tests
 * ======================
 * Tests for quality ladder selection and variant utilities
 */

import { describe, it, expect } from 'vitest';
import {
  QUALITY_PRESETS,
  selectQualityLadder,
  selectVariant,
  variantToPreset,
  createCopyVariant,
  getPreset,
} from '../src/core/quality.js';
import type { QualityVariant } from '../src/types/index.js';

describe('Quality Presets', () => {
  describe('QUALITY_PRESETS constant', () => {
    it('should have all standard presets defined', () => {
      expect(QUALITY_PRESETS).toHaveProperty('1080p');
      expect(QUALITY_PRESETS).toHaveProperty('720p');
      expect(QUALITY_PRESETS).toHaveProperty('480p');
      expect(QUALITY_PRESETS).toHaveProperty('360p');
    });

    it('should have valid 1080p preset', () => {
      const preset = QUALITY_PRESETS['1080p'];
      expect(preset.height).toBe(1080);
      expect(preset.width).toBe(1920);
      expect(preset.videoBitrate).toBe('4000k');
      expect(preset.audioBitrate).toBe('192k');
    });

    it('should have valid 720p preset', () => {
      const preset = QUALITY_PRESETS['720p'];
      expect(preset.height).toBe(720);
      expect(preset.width).toBe(1280);
      expect(preset.videoBitrate).toBe('2800k');
      expect(preset.audioBitrate).toBe('128k');
    });

    it('should have valid 480p preset', () => {
      const preset = QUALITY_PRESETS['480p'];
      expect(preset.height).toBe(480);
      expect(preset.width).toBe(854);
      expect(preset.videoBitrate).toBe('1400k');
      expect(preset.audioBitrate).toBe('128k');
    });

    it('should have valid 360p preset', () => {
      const preset = QUALITY_PRESETS['360p'];
      expect(preset.height).toBe(360);
      expect(preset.width).toBe(640);
      expect(preset.videoBitrate).toBe('800k');
      expect(preset.audioBitrate).toBe('96k');
    });

    it('should have proper H.264 encoding parameters', () => {
      Object.values(QUALITY_PRESETS).forEach((preset) => {
        expect(preset.profile).toMatch(/^(high|main|baseline)$/);
        expect(preset.level).toMatch(/^\d+\.\d+$/);
      });
    });
  });

  describe('selectQualityLadder()', () => {
    it('should select full ladder for 1080p source', () => {
      const ladder = selectQualityLadder(1080);
      expect(ladder).toEqual(['1080p', '720p', '480p']);
    });

    it('should select appropriate ladder for 720p source', () => {
      const ladder = selectQualityLadder(720);
      expect(ladder).toEqual(['720p', '480p', '360p']);
    });

    it('should select appropriate ladder for 480p source', () => {
      const ladder = selectQualityLadder(480);
      expect(ladder).toEqual(['480p', '360p']);
    });

    it('should not upscale - only include qualities <= source', () => {
      const ladder = selectQualityLadder(480);
      expect(ladder).not.toContain('720p');
      expect(ladder).not.toContain('1080p');
    });

    it('should limit variants based on maxVariants option', () => {
      const ladder = selectQualityLadder(1080, { maxVariants: 2 });
      expect(ladder).toHaveLength(2);
    });

    it('should respect min option', () => {
      const ladder = selectQualityLadder(1080, { min: 480 });
      expect(ladder).not.toContain('360p');
      expect(ladder).toContain('480p');
    });

    it('should handle low resolution source', () => {
      const ladder = selectQualityLadder(360);
      expect(ladder).toEqual(['360p']);
    });
  });

  describe('selectVariant()', () => {
    it('should select codec copy for H.264 720p source at 720p', () => {
      const result = selectVariant({
        height: 720,
        videoCodec: 'h264',
        audioCodec: 'aac',
      });

      expect(result.strategy).toBe('CODEC_COPY');
      expect(result.variant.encodingMode).toBe('copy');
      expect(result.variant.height).toBe(720);
    });

    it('should select re-encode for VP9 source (incompatible codec)', () => {
      const result = selectVariant({
        height: 720,
        videoCodec: 'vp9',
        audioCodec: 'opus',
      });

      expect(result.strategy).toBe('REENCODE_INCOMPATIBLE');
      expect(result.variant.encodingMode).toBe('reencode');
      expect(result.compatibility.canCopy).toBe(false);
    });

    it('should select re-encode for downscaling', () => {
      const result = selectVariant(
        { height: 1080, videoCodec: 'h264', audioCodec: 'aac' },
        { maxHeight: 720 }
      );

      expect(result.strategy).toBe('REENCODE_DOWNSCALE');
      expect(result.variant.height).toBe(720);
      expect(result.variant.encodingMode).toBe('reencode');
    });

    it('should respect forced mode', () => {
      const result = selectVariant(
        { height: 720, videoCodec: 'h264', audioCodec: 'aac' },
        { forceMode: 'reencode' }
      );

      expect(result.strategy).toBe('FORCED');
      expect(result.variant.encodingMode).toBe('reencode');
    });

    it('should set zero bitrates for codec copy', () => {
      const result = selectVariant({
        height: 720,
        videoCodec: 'h264',
        audioCodec: 'aac',
      });

      expect(result.variant.videoBitrate).toBe(0);
      expect(result.variant.audioBitrate).toBe(0);
    });

    it('should set proper bitrates for re-encode', () => {
      const result = selectVariant({
        height: 720,
        videoCodec: 'vp9',
        audioCodec: 'opus',
      });

      expect(result.variant.videoBitrate).toBeGreaterThan(0);
      expect(result.variant.audioBitrate).toBeGreaterThan(0);
    });
  });

  describe('variantToPreset()', () => {
    it('should convert 720p variant to preset', () => {
      const variant: QualityVariant = {
        name: '720p',
        height: 720,
        videoBitrate: 2800,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.name).toBe('720p');
      expect(preset.height).toBe(720);
      expect(preset.videoBitrate).toBe('2800k');
      expect(preset.audioBitrate).toBe('128k');
      expect(preset.profile).toBe('high');
    });

    it('should convert 480p variant to preset', () => {
      const variant: QualityVariant = {
        name: '480p',
        height: 480,
        videoBitrate: 1400,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.name).toBe('480p');
      expect(preset.height).toBe(480);
      expect(preset.videoBitrate).toBe('1400k');
    });

    it('should calculate proper maxrate (120% of bitrate)', () => {
      const variant: QualityVariant = {
        name: '720p',
        height: 720,
        videoBitrate: 2000,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.maxrate).toBe('2400k'); // 2000 * 1.2
    });

    it('should calculate proper bufsize (2x bitrate)', () => {
      const variant: QualityVariant = {
        name: '720p',
        height: 720,
        videoBitrate: 2000,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.bufsize).toBe('4000k'); // 2000 * 2
    });

    it('should handle custom variants with non-standard heights', () => {
      const variant: QualityVariant = {
        name: 'custom',
        height: 540,
        videoBitrate: 2000,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.name).toBe('custom');
      expect(preset.height).toBe(540);
      expect(preset.width).toBe(960); // 16:9 aspect ratio
    });

    it('should use high profile for HD content', () => {
      const variant: QualityVariant = {
        name: '1080p',
        height: 1080,
        videoBitrate: 5000,
        audioBitrate: 192,
      };

      const preset = variantToPreset(variant);

      expect(preset.profile).toBe('high');
      expect(preset.level).toBe('4.1');
    });

    it('should use main profile for SD content', () => {
      const variant: QualityVariant = {
        name: '480p',
        height: 480,
        videoBitrate: 1400,
        audioBitrate: 128,
      };

      const preset = variantToPreset(variant);

      expect(preset.profile).toBe('main');
      expect(preset.level).toBe('3.1');
    });
  });

  describe('createCopyVariant()', () => {
    it('should create codec copy variant with zero bitrates', () => {
      const variant = createCopyVariant(720);

      expect(variant.height).toBe(720);
      expect(variant.name).toBe('720p');
      expect(variant.videoBitrate).toBe(0);
      expect(variant.audioBitrate).toBe(0);
      expect(variant.encodingMode).toBe('copy');
    });

    it('should allow custom name', () => {
      const variant = createCopyVariant(720, 'source');
      expect(variant.name).toBe('source');
    });
  });

  describe('getPreset()', () => {
    it('should return preset for valid quality', () => {
      const preset = getPreset('720p');
      expect(preset).toBeDefined();
      expect(preset?.height).toBe(720);
    });

    it('should return undefined for invalid quality', () => {
      const preset = getPreset('invalid');
      expect(preset).toBeUndefined();
    });
  });
});
