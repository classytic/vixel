/**
 * HLS Processor Integration Tests
 * ================================
 * Tests the complete HLS processing pipeline with real video file
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { HLSProcessor } from '../src/processor.js';
import type { HLSProcessorConfig } from '../src/types/index.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const TEST_OUTPUT_DIR = join(__dirname, 'output');

/**
 * Cleanup test output directory
 */
async function cleanup() {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Verify HLS output files exist
 */
async function verifyHLSOutput(outputDir: string, variantCount: number) {
  // Check master playlist
  const masterPlaylist = await fs.readFile(join(outputDir, 'master.m3u8'), 'utf8');
  if (!masterPlaylist.includes('#EXTM3U')) {
    throw new Error('Invalid master playlist');
  }

  // Check each variant
  for (let i = 0; i < variantCount; i++) {
    const variantDir = join(outputDir, `v${i}`);
    const playlist = await fs.readFile(join(variantDir, 'playlist.m3u8'), 'utf8');

    if (!playlist.includes('#EXTM3U')) {
      throw new Error(`Invalid variant ${i} playlist`);
    }

    // Check segments exist
    const files = await fs.readdir(variantDir);
    const segments = files.filter(f => f.endsWith('.ts'));

    if (segments.length === 0) {
      throw new Error(`No segments found for variant ${i}`);
    }
  }
}

describe('HLS Processor - Integration Tests', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  test('should process video with single variant (720p)', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '720p',
          height: 720,
          videoBitrate: 2800,
          audioBitrate: 128,
        },
      ],
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.name).toBe('720p');
    expect(result.metadata.duration).toBeGreaterThan(0);

    await verifyHLSOutput(TEST_OUTPUT_DIR, 1);
  }, 60000);

  test('should process video with multiple variants', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '720p',
          height: 720,
          videoBitrate: 2800,
          audioBitrate: 128,
        },
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
        {
          name: '360p',
          height: 360,
          videoBitrate: 800,
          audioBitrate: 96,
        },
      ],
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.name).toBe('720p');
    expect(result.variants[1]?.name).toBe('480p');
    expect(result.variants[2]?.name).toBe('360p');

    await verifyHLSOutput(TEST_OUTPUT_DIR, 3);
  }, 180000);

  test('should generate thumbnail sprites when enabled', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
      ],
      features: {
        sprites: true,
      },
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.sprites).toBeDefined();
    expect(result.sprites?.imagePath).toBeTruthy();
    expect(result.sprites?.vttPath).toBeTruthy();

    // Verify sprite files exist
    const spriteImage = join(TEST_OUTPUT_DIR, 'sprites.jpg');
    const spriteVtt = join(TEST_OUTPUT_DIR, 'sprites.vtt');

    await expect(fs.access(spriteImage)).resolves.not.toThrow();
    await expect(fs.access(spriteVtt)).resolves.not.toThrow();

    // Verify sprite image has content
    const stats = await fs.stat(spriteImage);
    expect(stats.size).toBeGreaterThan(1000);
  }, 90000);

  test('should generate chapters when enabled', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
      ],
      features: {
        chapters: true,
      },
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      featuresConfig: {
        chapters: [
          { id: '1', startTime: 0, endTime: 30, title: 'Introduction' },
          { id: '2', startTime: 30, endTime: 60, title: 'Main Content' },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.chapters).toBeDefined();
    expect(result.chapters?.vttPath).toBeTruthy();

    // Verify chapter file exists
    const chapterVtt = join(TEST_OUTPUT_DIR, 'chapters.vtt');
    await expect(fs.access(chapterVtt)).resolves.not.toThrow();
  }, 90000);

  test('should use codec copy when source matches variant resolution', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: 'source',
          height: 720, // Assuming test.mp4 is 720p
          videoBitrate: 0, // Zero bitrate = codec copy
          audioBitrate: 0,
          encodingMode: 'copy',
        },
      ],
      ffmpeg: {
        codecCopy: {
          enabled: true,
          autoDetect: true,
        },
      },
    };

    const processor = new HLSProcessor(config);
    const startTime = Date.now();

    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    const processingTime = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.variants).toHaveLength(1);

    // Codec copy should be much faster (typically < 10s for 5min video)
    console.log(`Processing time: ${processingTime}ms`);

    await verifyHLSOutput(TEST_OUTPUT_DIR, 1);
  }, 60000);

  test('should report progress during encoding', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
      ],
    };

    const progressUpdates: number[] = [];
    const processor = new HLSProcessor(config);

    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      onProgress: (progress) => {
        progressUpdates.push(progress.percent);
      },
    });

    expect(result.success).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);
    // Progress should increase over time
    expect(Math.max(...progressUpdates)).toBeGreaterThan(0);
  }, 90000);

  test('should handle custom segment duration', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
          segmentDuration: 6, // 6 seconds
        },
      ],
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.success).toBe(true);

    // Verify playlist has correct segment duration
    const playlist = await fs.readFile(
      join(TEST_OUTPUT_DIR, 'v0', 'playlist.m3u8'),
      'utf8'
    );
    expect(playlist).toContain('#EXT-X-TARGETDURATION:6');
  }, 90000);

  test('should generate all features together', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '720p',
          height: 720,
          videoBitrate: 2800,
          audioBitrate: 128,
        },
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
      ],
      features: {
        sprites: true,
        chapters: true,
      },
    };

    const processor = new HLSProcessor(config);
    const result = await processor.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      featuresConfig: {
        chapters: [
          { id: '1', startTime: 0, endTime: 30, title: 'Intro' },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.variants).toHaveLength(2);
    expect(result.sprites).toBeDefined();
    expect(result.chapters).toBeDefined();

    await verifyHLSOutput(TEST_OUTPUT_DIR, 2);

    // Verify all files
    await expect(fs.access(join(TEST_OUTPUT_DIR, 'sprites.jpg'))).resolves.not.toThrow();
    await expect(fs.access(join(TEST_OUTPUT_DIR, 'sprites.vtt'))).resolves.not.toThrow();
    await expect(fs.access(join(TEST_OUTPUT_DIR, 'chapters.vtt'))).resolves.not.toThrow();
  }, 180000);

  test('should throw error for non-existent input file', async () => {
    const config: HLSProcessorConfig = {
      variants: [
        {
          name: '480p',
          height: 480,
          videoBitrate: 1400,
          audioBitrate: 128,
        },
      ],
    };

    const processor = new HLSProcessor(config);

    await expect(
      processor.process({
        inputPath: join(__dirname, 'non-existent.mp4'),
        outputDir: TEST_OUTPUT_DIR,
      })
    ).rejects.toThrow();
  });

  test('should validate configuration before processing', () => {
    // Empty variants
    expect(() => {
      new HLSProcessor({
        variants: [],
      });
    }).toThrow('At least one variant is required');

    // Duplicate variant names
    expect(() => {
      new HLSProcessor({
        variants: [
          { name: '720p', height: 720, videoBitrate: 2800, audioBitrate: 128 },
          { name: '720p', height: 480, videoBitrate: 1400, audioBitrate: 128 },
        ],
      });
    }).toThrow('Duplicate variant name');

    // Invalid segment duration
    expect(() => {
      new HLSProcessor({
        variants: [
          { name: '720p', height: 720, videoBitrate: 2800, audioBitrate: 128, segmentDuration: 0 },
        ],
      });
    }).toThrow('Invalid segment duration');

    // Invalid height
    expect(() => {
      new HLSProcessor({
        variants: [
          { name: '720p', height: 0, videoBitrate: 2800, audioBitrate: 128 },
        ],
      });
    }).toThrow('Invalid variant height');
  });

  test('should validate codec copy configuration', () => {
    // Zero bitrates without codec copy enabled
    expect(() => {
      new HLSProcessor({
        variants: [
          { name: 'source', height: 720, videoBitrate: 0, audioBitrate: 0 },
        ],
      });
    }).toThrow('Zero bitrates require codec copy to be enabled');

    // Codec copy with non-zero bitrates (should warn but not error)
    expect(() => {
      new HLSProcessor({
        variants: [
          {
            name: 'source',
            height: 720,
            videoBitrate: 2800,
            audioBitrate: 128,
            encodingMode: 'copy',
          },
        ],
      });
    }).not.toThrow(); // Should warn but not throw
  });
});
