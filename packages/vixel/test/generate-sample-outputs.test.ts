/**
 * Generate Sample Outputs (No Cleanup)
 * ======================================
 * Run this to generate sample outputs that persist after the test completes.
 *
 * Usage:
 *   npm test -- generate-sample-outputs.test.ts
 *
 * Outputs will be saved to: test/samples/
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import {
  cropResize,
  compressVideo,
  detectHardwareAccel,
  extractThumbnail,
  extractThumbnails,
  generateGif,
  generateSprites,
  trimVideo,
  extractAudio,
  concatenateVideos,
  changeSpeed,
  convertFormat,
} from '../src/index.js';

const TEST_VIDEO_PATH = join(__dirname, 'test.mp4');
const SAMPLES_DIR = join(__dirname, 'samples');

describe('Generate Sample Outputs (Persistent)', () => {
  it('should generate all sample outputs', async () => {
    // Create samples directory
    await fs.mkdir(SAMPLES_DIR, { recursive: true });

    console.log('\n🎬 Generating sample outputs...\n');

    // 1. Crop/Resize Samples
    console.log('📐 Generating aspect ratio conversions...');

    await cropResize(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '1-reels-9x16.mp4'),
      { preset: 'reels' }
    );
    console.log('  ✅ 1-reels-9x16.mp4 (1080x1920)');

    await cropResize(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '2-youtube-16x9.mp4'),
      { preset: 'youtube' }
    );
    console.log('  ✅ 2-youtube-16x9.mp4 (1920x1080)');

    await cropResize(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '3-square-1x1.mp4'),
      { preset: 'square' }
    );
    console.log('  ✅ 3-square-1x1.mp4 (1080x1080)');

    // 2. Compression Samples
    console.log('\n🗜️  Generating compression comparisons...');

    const result1 = await compressVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '4-compressed-high-quality-crf18.mp4'),
      { crf: 18, preset: 'slow' }
    );
    console.log(`  ✅ 4-compressed-high-quality-crf18.mp4 (${(result1.compressedSize / 1024 / 1024).toFixed(2)} MB)`);

    const result2 = await compressVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '5-compressed-balanced-crf23.mp4'),
      { crf: 23, preset: 'medium' }
    );
    console.log(`  ✅ 5-compressed-balanced-crf23.mp4 (${(result2.compressedSize / 1024 / 1024).toFixed(2)} MB)`);

    const result3 = await compressVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '6-compressed-medium-crf28.mp4'),
      { crf: 28, preset: 'fast' }
    );
    console.log(`  ✅ 6-compressed-medium-crf28.mp4 (${(result3.compressedSize / 1024 / 1024).toFixed(2)} MB)`);

    const result4 = await compressVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '7-compressed-h265-crf28.mp4'),
      { videoCodec: 'libx265', crf: 28, preset: 'medium' }
    );
    console.log(`  ✅ 7-compressed-h265-crf28.mp4 (${(result4.compressedSize / 1024 / 1024).toFixed(2)} MB, H.265)`);

    // 3. Hardware Acceleration Sample (if available)
    console.log('\n⚡ Checking hardware acceleration...');

    const availableHw = await detectHardwareAccel('ffmpeg');
    console.log(`  🔧 Available: ${availableHw.join(', ')}`);

    if (availableHw.length > 1) {
      const hwAccel = availableHw.find(h => h !== 'none') || 'none';
      const result5 = await compressVideo(
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        join(SAMPLES_DIR, `8-compressed-hw-${hwAccel}.mp4`),
        { hardwareAccel: hwAccel, crf: 23, preset: 'medium' }
      );
      console.log(`  ✅ 8-compressed-hw-${hwAccel}.mp4 (${(result5.compressedSize / 1024 / 1024).toFixed(2)} MB, ${result5.videoCodec})`);
    }

    // 4. Thumbnail Samples
    console.log('\n🖼️  Generating thumbnails...');

    const thumb1 = await extractThumbnail(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      1,
      join(SAMPLES_DIR, '9-thumbnail-1sec.jpg'),
      { width: 1280, format: 'jpg', quality: 85 }
    );
    console.log(`  ✅ 9-thumbnail-1sec.jpg (${(thumb1.fileSize / 1024).toFixed(0)} KB, ${thumb1.dimensions.width}x${thumb1.dimensions.height})`);

    const thumb2 = await extractThumbnail(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      5,
      join(SAMPLES_DIR, '10-thumbnail-5sec.webp'),
      { width: 1280, format: 'webp', quality: 80 }
    );
    console.log(`  ✅ 10-thumbnail-5sec.webp (${(thumb2.fileSize / 1024).toFixed(0)} KB, WebP format)`);

    const thumbsResult = await extractThumbnails(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, 'thumbnails'),
      { strategy: 'interval', interval: 2 },
      { width: 640, format: 'jpg' }
    );
    console.log(`  ✅ thumbnails/*.jpg (${thumbsResult.thumbnails.length} thumbnails at 2sec intervals)`);

    // 5. GIF Samples
    console.log('\n🎞️  Generating GIFs...');

    const gifResult1 = await generateGif(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      { start: 0, end: 3 },
      SAMPLES_DIR,
      { format: 'gif', width: 480, fps: 15, optimization: 'quality' }
    );
    console.log(`  ✅ ${gifResult1.outputPath.split('\\').pop()} (${(gifResult1.fileSize / 1024 / 1024).toFixed(2)} MB, 3sec GIF)`);

    const gifResult2 = await generateGif(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      { start: 0, end: 3 },
      SAMPLES_DIR,
      { format: 'webp', width: 480, fps: 15 }
    );
    console.log(`  ✅ ${gifResult2.outputPath.split('\\').pop()} (${(gifResult2.fileSize / 1024 / 1024).toFixed(2)} MB, WebP animated)`);

    // 6. Sprite Sheet Sample
    console.log('\n🎴 Generating sprite sheet...');

    const spriteResult = await generateSprites(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      SAMPLES_DIR,
      { interval: 2, width: 160, columns: 5, format: 'jpg' }
    );
    console.log(`  ✅ sprites.jpg (${spriteResult.thumbnailCount} thumbnails in ${spriteResult.grid.rows}x${spriteResult.grid.columns} grid)`);
    console.log(`  ✅ sprites.vtt (WebVTT coordinates file)`);

    // 7. Trim/Clip Samples
    console.log('\n✂️  Generating video clips...');

    const trimResult1 = await trimVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '11-clip-fast-2-5sec.mp4'),
      { start: 2, end: 5, accurate: false }
    );
    console.log(`  ✅ 11-clip-fast-2-5sec.mp4 (${(trimResult1.fileSize / 1024 / 1024).toFixed(2)} MB, fast trim 3sec)`);

    const trimResult2 = await trimVideo(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '12-clip-accurate-0-3sec.mp4'),
      { start: 0, end: 3, accurate: true }
    );
    console.log(`  ✅ 12-clip-accurate-0-3sec.mp4 (${(trimResult2.fileSize / 1024 / 1024).toFixed(2)} MB, accurate trim)`);

    // 8. Audio Extraction Samples
    console.log('\n🎵 Extracting audio...');

    const audioResult1 = await extractAudio(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '13-audio.mp3'),
      { format: 'mp3', bitrate: '192k' }
    );
    console.log(`  ✅ 13-audio.mp3 (${(audioResult1.fileSize / 1024 / 1024).toFixed(2)} MB, MP3 192k)`);

    const audioResult2 = await extractAudio(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '14-audio.aac'),
      { format: 'aac', bitrate: '128k' }
    );
    console.log(`  ✅ 14-audio.aac (${(audioResult2.fileSize / 1024 / 1024).toFixed(2)} MB, AAC 128k)`);

    // 9. Concatenation Sample
    console.log('\n🔗 Concatenating clips...');

    const concatResult = await concatenateVideos(
      [
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
        { inputPath: TEST_VIDEO_PATH, duration: 10 },
      ],
      join(SAMPLES_DIR, '15-concatenated.mp4'),
      { method: 'auto' }
    );
    console.log(`  ✅ 15-concatenated.mp4 (${(concatResult.fileSize / 1024 / 1024).toFixed(2)} MB, ${concatResult.fileCount} clips, ${concatResult.method} method)`);

    // 10. Speed Adjustment Samples
    console.log('\n⏱️  Adjusting playback speed...');

    const speedResult1 = await changeSpeed(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '16-speed-0.5x-slow.mp4'),
      { speed: 0.5 }
    );
    console.log(`  ✅ 16-speed-0.5x-slow.mp4 (${(speedResult1.fileSize / 1024 / 1024).toFixed(2)} MB, half speed)`);

    const speedResult2 = await changeSpeed(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '17-speed-2x-fast.mp4'),
      { speed: 2.0 }
    );
    console.log(`  ✅ 17-speed-2x-fast.mp4 (${(speedResult2.fileSize / 1024 / 1024).toFixed(2)} MB, double speed)`);

    // 11. Format Conversion Samples
    console.log('\n🔄 Converting formats...');

    const convertResult1 = await convertFormat(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '18-converted.webm'),
      { format: 'webm', crf: 28 }
    );
    console.log(`  ✅ 18-converted.webm (${(convertResult1.fileSize / 1024 / 1024).toFixed(2)} MB, WebM VP9)`);

    const convertResult2 = await convertFormat(
      { inputPath: TEST_VIDEO_PATH, duration: 10 },
      join(SAMPLES_DIR, '19-converted.mov'),
      { format: 'mov', crf: 23 }
    );
    console.log(`  ✅ 19-converted.mov (${(convertResult2.fileSize / 1024 / 1024).toFixed(2)} MB, MOV H.264)`);

    // Summary
    const files = await fs.readdir(SAMPLES_DIR);
    const stats = await Promise.all(
      files.map(async (file) => {
        const filePath = join(SAMPLES_DIR, file);
        const stat = await fs.stat(filePath);
        return { file, size: stat.size };
      })
    );

    const totalSize = stats.reduce((sum, s) => sum + s.size, 0);

    console.log('\n📊 Summary:');
    console.log(`  Total files: ${stats.length}`);
    console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\n📁 Output directory: ${SAMPLES_DIR}`);
    console.log('\n✨ All sample outputs generated successfully!\n');

    // Verify files were created (some may fail on Windows due to FFmpeg font/codec issues)
    expect(stats.length).toBeGreaterThanOrEqual(20);
  }, 600000); // 10 minute timeout for all operations
});
