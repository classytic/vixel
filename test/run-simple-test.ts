/**
 * Simple Test Runner - Quick HLS Processor Test
 * ==============================================
 * Runs a basic HLS processing test without vitest framework
 */

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HLSProcessor } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const TEST_OUTPUT_DIR = join(__dirname, 'output');

async function cleanup() {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
}

async function runTest() {
  console.log('🧪 HLS Processor - Simple Test\n');
  console.log('='.repeat(50));

  try {
    // Cleanup before test
    await cleanup();

    // Test 1: Single variant processing
    console.log('\n📹 Test 1: Single variant (720p)...');
    const config1 = {
      variants: [
        {
          name: '720p',
          height: 720,
          videoBitrate: 2800,
          audioBitrate: 128,
        },
      ],
    };

    const processor1 = new HLSProcessor(config1);
    const startTime1 = Date.now();

    const result1 = await processor1.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      onProgress: (progress) => {
        process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
      },
    });

    const duration1 = ((Date.now() - startTime1) / 1000).toFixed(1);
    console.log(`\n   ✓ Success! (${duration1}s)`);
    console.log(`   - Variants: ${result1.variants.length}`);
    console.log(`   - Duration: ${result1.metadata.duration.toFixed(1)}s`);
    console.log(`   - Resolution: ${result1.metadata.resolution.width}x${result1.metadata.resolution.height}`);
    console.log(`   - Segments: ${result1.variants[0]?.segmentCount}`);
    console.log(`   - Output: ${result1.outputDir}`);

    // Cleanup after test 1
    await cleanup();

    // Test 2: Multiple variants
    console.log('\n📹 Test 2: Multiple variants (720p, 480p, 360p)...');
    const config2 = {
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

    const processor2 = new HLSProcessor(config2);
    const startTime2 = Date.now();

    const result2 = await processor2.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      onProgress: (progress) => {
        process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
      },
    });

    const duration2 = ((Date.now() - startTime2) / 1000).toFixed(1);
    console.log(`\n   ✓ Success! (${duration2}s)`);
    console.log(`   - Variants: ${result2.variants.length}`);
    result2.variants.forEach((v, i) => {
      const sizeMB = (v.totalSize / 1024 / 1024).toFixed(2);
      console.log(`     ${i + 1}. ${v.name}: ${v.segmentCount} segments (${sizeMB} MB)`);
    });

    // Cleanup after test 2
    await cleanup();

    // Test 3: With sprites
    console.log('\n📹 Test 3: Single variant with sprites...');
    const config3 = {
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

    const processor3 = new HLSProcessor(config3);
    const startTime3 = Date.now();

    const result3 = await processor3.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
      onProgress: (progress) => {
        process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
      },
    });

    const duration3 = ((Date.now() - startTime3) / 1000).toFixed(1);
    console.log(`\n   ✓ Success! (${duration3}s)`);
    console.log(`   - Variants: ${result3.variants.length}`);
    console.log(`   - Sprites: ${result3.sprites ? 'Generated' : 'Not generated'}`);
    if (result3.sprites) {
      console.log(`     • Thumbnails: ${result3.sprites.thumbnailCount}`);
      console.log(`     • Dimensions: ${result3.sprites.dimensions.width}x${result3.sprites.dimensions.height}`);
    }

    // Test 4: Codec copy mode (if source is 720p H.264)
    console.log('\n📹 Test 4: Codec copy mode (fast)...');
    const config4 = {
      variants: [
        {
          name: 'source',
          height: 720, // Adjust if test.mp4 is different resolution
          videoBitrate: 0,
          audioBitrate: 0,
          encodingMode: 'copy' as const,
        },
      ],
      ffmpeg: {
        codecCopy: {
          enabled: true,
          autoDetect: true,
        },
      },
    };

    const processor4 = new HLSProcessor(config4);
    const startTime4 = Date.now();

    const result4 = await processor4.process({
      inputPath: TEST_VIDEO_PATH,
      outputDir: TEST_OUTPUT_DIR,
    });

    const duration4 = ((Date.now() - startTime4) / 1000).toFixed(1);
    console.log(`   ✓ Success! (${duration4}s)`);
    console.log(`   - Mode: Codec copy (10-20x faster than re-encoding)`);
    console.log(`   - Segments: ${result4.variants[0]?.segmentCount}`);

    // Final cleanup
    await cleanup();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await cleanup();
    process.exit(1);
  }
}

runTest();
