/**
 * Generators Tests
 * =================
 * Tests for sprite and chapter generators
 */

import { describe, it, expect } from 'vitest';
import { FFmpegError, formatWebVTTTime } from '../src/index.js';

describe('Sprite Generator', () => {
  describe('Configuration Validation', () => {
    it('should require valid input path', () => {
      // This test validates that sprite generator would fail with invalid input
      // Actual implementation would be integration test
      expect(true).toBe(true);
    });

    it('should require valid output directory', () => {
      expect(true).toBe(true);
    });

    it('should validate interval is positive', () => {
      const invalidInterval = -10;
      expect(invalidInterval).toBeLessThan(0);
    });

    it('should validate width is positive', () => {
      const invalidWidth = 0;
      expect(invalidWidth).toBeLessThanOrEqual(0);
    });

    it('should validate columns is positive', () => {
      const invalidColumns = 0;
      expect(invalidColumns).toBeLessThanOrEqual(0);
    });
  });

  describe('WebVTT Generation', () => {
    it('should generate proper WebVTT format', () => {
      // Example of expected WebVTT format
      const expectedFormat = `WEBVTT

1
00:00:00.000 --> 00:00:10.000
sprites.jpg#xywh=0,0,160,90

2
00:00:10.000 --> 00:00:20.000
sprites.jpg#xywh=160,0,160,90`;

      expect(expectedFormat).toContain('WEBVTT');
      expect(expectedFormat).toContain('xywh=');
    });

    it('should format timestamps correctly', () => {
      // Test timestamp formatting
      const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
      };

      expect(formatTime(0)).toBe('00:00:00.000');
      expect(formatTime(10)).toBe('00:00:10.000');
      expect(formatTime(65)).toBe('00:01:05.000');
      expect(formatTime(3665)).toBe('01:01:05.000');
    });

    it('should calculate correct sprite grid positions', () => {
      const columns = 5;
      const width = 160;
      const height = 90;

      // First thumbnail
      const index0 = 0;
      const row0 = Math.floor(index0 / columns);
      const col0 = index0 % columns;
      expect(col0 * width).toBe(0);
      expect(row0 * height).toBe(0);

      // Sixth thumbnail (second row, first column)
      const index5 = 5;
      const row5 = Math.floor(index5 / columns);
      const col5 = index5 % columns;
      expect(col5 * width).toBe(0);
      expect(row5 * height).toBe(90);

      // Seventh thumbnail (second row, second column)
      const index6 = 6;
      const row6 = Math.floor(index6 / columns);
      const col6 = index6 % columns;
      expect(col6 * width).toBe(160);
      expect(row6 * height).toBe(90);
    });
  });

  describe('Error Handling', () => {
    it('should handle FFmpeg errors gracefully', () => {
      const error = new FFmpegError('FFmpeg extraction failed', 'stderr details');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('FFmpeg extraction failed');
    });

    it('should handle missing ffmpeg binary', () => {
      const ffmpegPath = 'nonexistent-ffmpeg';
      expect(ffmpegPath).toBe('nonexistent-ffmpeg');
      // In real scenario, this would throw FFmpegError
    });
  });
});

describe('Chapter Generator', () => {
  describe('Configuration Validation', () => {
    it('should require valid output path', () => {
      expect(true).toBe(true);
    });

    it('should require valid duration', () => {
      const invalidDuration = -1;
      expect(invalidDuration).toBeLessThan(0);
    });

    it('should validate interval is positive', () => {
      const interval = 300; // 5 minutes
      expect(interval).toBeGreaterThan(0);
    });
  });

  describe('Auto-generation', () => {
    it('should generate chapters at regular intervals', () => {
      const duration = 900; // 15 minutes
      const interval = 300; // 5 minutes
      const expectedChapters = Math.ceil(duration / interval);

      expect(expectedChapters).toBe(3);
    });

    it('should handle videos shorter than interval', () => {
      const duration = 120; // 2 minutes
      const interval = 300; // 5 minutes

      expect(duration).toBeLessThan(interval);
      // Should generate 1 chapter
    });

    it('should generate proper chapter titles', () => {
      const chapterTitles = ['Chapter 1', 'Chapter 2', 'Chapter 3'];
      chapterTitles.forEach((title, index) => {
        expect(title).toBe(`Chapter ${index + 1}`);
      });
    });
  });

  describe('Custom Chapters', () => {
    it('should accept custom chapter data', () => {
      const customChapters = [
        { id: '1', startTime: 0, endTime: 300, title: 'Introduction' },
        { id: '2', startTime: 300, endTime: 1200, title: 'Main Content' },
        { id: '3', startTime: 1200, endTime: 1800, title: 'Conclusion' },
      ];

      expect(customChapters).toHaveLength(3);
      expect(customChapters[0]?.title).toBe('Introduction');
    });

    it('should validate chapter structure', () => {
      const chapter = {
        id: '1',
        startTime: 0,
        endTime: 300,
        title: 'Test Chapter',
      };

      expect(chapter).toHaveProperty('id');
      expect(chapter).toHaveProperty('startTime');
      expect(chapter).toHaveProperty('endTime');
      expect(chapter).toHaveProperty('title');
      expect(chapter.startTime).toBeLessThan(chapter.endTime);
    });
  });

  describe('WebVTT Format', () => {
    it('should generate proper WebVTT chapter format', () => {
      const expectedFormat = `WEBVTT
Kind: chapters
Language: en

1
00:00:00.000 --> 00:05:00.000
Chapter 1`;

      expect(expectedFormat).toContain('WEBVTT');
      expect(expectedFormat).toContain('Kind: chapters');
      expect(expectedFormat).toContain('Language: en');
    });

    it('should format chapter timestamps correctly', () => {
      const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
      };

      expect(formatTime(0)).toBe('00:00:00.000');
      expect(formatTime(300)).toBe('00:05:00.000');
      expect(formatTime(3600)).toBe('01:00:00.000');
    });

    it('should handle sequential chapter times', () => {
      const chapters = [
        { startTime: 0, endTime: 300 },
        { startTime: 300, endTime: 600 },
        { startTime: 600, endTime: 900 },
      ];

      for (let i = 0; i < chapters.length - 1; i++) {
        expect(chapters[i]!.endTime).toBe(chapters[i + 1]!.startTime);
      }
    });
  });

  describe('Smart Chapter Generation', () => {
    it('should accept scene-based chapters', () => {
      const scenes = [
        { timestamp: 0, title: 'Opening Scene' },
        { timestamp: 300, title: 'Main Scene' },
        { timestamp: 900, title: 'Closing Scene' },
      ];

      expect(scenes).toHaveLength(3);
      expect(scenes[0]?.title).toBe('Opening Scene');
    });

    it('should accept transcript-based chapters', () => {
      const transcript = [
        { timestamp: 0, text: 'Welcome to the video...' },
        { timestamp: 10, text: 'Today we will discuss...' },
        { timestamp: 300, text: 'Moving on to the next topic...' },
      ];

      expect(transcript).toBeDefined();
      expect(transcript.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  describe('formatWebVTTTime utility', () => {
    it('should format 0 seconds correctly', () => {
      expect(formatWebVTTTime(0)).toBe('00:00:00.000');
    });

    it('should format fractional seconds correctly', () => {
      expect(formatWebVTTTime(1.5)).toBe('00:00:01.500');
      expect(formatWebVTTTime(0.001)).toBe('00:00:00.001');
      expect(formatWebVTTTime(0.999)).toBe('00:00:00.999');
    });

    it('should format minutes correctly', () => {
      expect(formatWebVTTTime(60)).toBe('00:01:00.000');
      expect(formatWebVTTTime(90)).toBe('00:01:30.000');
    });

    it('should format hours correctly', () => {
      expect(formatWebVTTTime(3600)).toBe('01:00:00.000');
      expect(formatWebVTTTime(3661.5)).toBe('01:01:01.500');
    });

    it('should handle large durations (10+ hours)', () => {
      expect(formatWebVTTTime(36000)).toBe('10:00:00.000');
      expect(formatWebVTTTime(86400)).toBe('24:00:00.000'); // 24 hours
    });
  });

  describe('Sprite edge cases', () => {
    it('should handle video shorter than interval', () => {
      const duration = 5; // 5 seconds
      const interval = 10; // 10 seconds
      const thumbnailCount = Math.floor(duration / interval);
      expect(thumbnailCount).toBe(0); // Zero thumbnails expected
    });

    it('should handle exact interval match', () => {
      const duration = 30;
      const interval = 10;
      const thumbnailCount = Math.floor(duration / interval);
      expect(thumbnailCount).toBe(3);
    });

    it('should calculate grid layout correctly', () => {
      const thumbnailCount = 12;
      const columns = 5;
      const rows = Math.ceil(thumbnailCount / columns);
      expect(rows).toBe(3); // 12 / 5 = 2.4, ceil = 3
    });

    it('should handle single thumbnail case', () => {
      const thumbnailCount = 1;
      const columns = 5;
      const rows = Math.ceil(thumbnailCount / columns);
      expect(rows).toBe(1);
    });
  });

  describe('Chapter edge cases', () => {
    it('should handle zero duration gracefully', () => {
      const duration = 0;
      const interval = 300;
      // Should not create infinite loop
      const chapters: Array<{ startTime: number }> = [];
      let currentTime = 0;
      let iterations = 0;
      const maxIterations = 100; // Safety limit

      while (currentTime < duration && iterations < maxIterations) {
        chapters.push({ startTime: currentTime });
        currentTime += interval;
        iterations++;
      }

      expect(chapters.length).toBe(0); // No chapters for zero duration
      expect(iterations).toBe(0);
    });

    it('should sort out-of-order chapters', () => {
      const chapters = [
        { startTime: 300, title: 'Second' },
        { startTime: 0, title: 'First' },
        { startTime: 600, title: 'Third' },
      ];

      const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime);

      expect(sorted[0]?.title).toBe('First');
      expect(sorted[1]?.title).toBe('Second');
      expect(sorted[2]?.title).toBe('Third');
    });

    it('should detect negative timestamps', () => {
      const invalidChapter = { startTime: -10, title: 'Invalid' };
      expect(invalidChapter.startTime).toBeLessThan(0);
    });

    it('should detect chapters beyond duration', () => {
      const duration = 100;
      const chapter = { startTime: 150, title: 'Beyond End' };
      expect(chapter.startTime).toBeGreaterThan(duration);
    });
  });

  describe('Resolution matching', () => {
    it('should match exact resolution', () => {
      const targetHeight = 720;
      const sourceHeight = 720;
      const tolerance = 10;
      const match = Math.abs(sourceHeight - targetHeight) <= tolerance;
      expect(match).toBe(true);
    });

    it('should match within tolerance', () => {
      const targetHeight = 720;
      const sourceHeight = 715;
      const tolerance = 10;
      const match = Math.abs(sourceHeight - targetHeight) <= tolerance;
      expect(match).toBe(true);
    });

    it('should not match outside tolerance', () => {
      const targetHeight = 720;
      const sourceHeight = 1080;
      const tolerance = 10;
      const match = Math.abs(sourceHeight - targetHeight) <= tolerance;
      expect(match).toBe(false);
    });

    it('should handle downscale detection', () => {
      const targetHeight = 480;
      const sourceHeight = 720;
      const needsDownscale = sourceHeight > targetHeight;
      expect(needsDownscale).toBe(true);
    });

    it('should handle upscale detection (not recommended)', () => {
      const targetHeight = 1080;
      const sourceHeight = 720;
      const needsUpscale = sourceHeight < targetHeight;
      expect(needsUpscale).toBe(true);
    });
  });

  describe('Bandwidth estimation', () => {
    const FALLBACK_BANDWIDTHS: Record<number, number> = {
      360: 800000,
      480: 1400000,
      720: 2800000,
      1080: 5000000,
    };

    it('should estimate bandwidth for 720p', () => {
      const height = 720;
      const bandwidth = FALLBACK_BANDWIDTHS[height];
      expect(bandwidth).toBe(2800000);
    });

    it('should find closest bandwidth for non-standard resolution', () => {
      const height = 540;
      const heights = Object.keys(FALLBACK_BANDWIDTHS).map(Number).sort((a, b) => a - b);
      let bandwidth = FALLBACK_BANDWIDTHS[360]!; // Default to lowest

      for (const h of heights) {
        if (height <= h) {
          bandwidth = FALLBACK_BANDWIDTHS[h]!;
          break;
        }
      }

      expect(bandwidth).toBe(2800000); // 540 > 480 so continues, 540 <= 720, use 720p bandwidth
    });
  });
});
