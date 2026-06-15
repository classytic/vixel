# HLS Processor Tests

Comprehensive test suite for the HLS processor package.

## Test Files

### 1. `hls-processor.test.ts` - Integration Tests
Full integration tests that process the `test.mp4` video file through various scenarios:

- Single variant processing (720p)
- Multiple variants (720p, 480p, 360p)
- Sprite generation
- Chapter generation
- Codec copy mode
- Progress reporting
- Custom segment duration
- All features combined
- Error handling
- Configuration validation

### 2. `codec-copy.test.ts` - Unit Tests
Unit tests for codec copy detection logic:

- Explicit mode overrides
- Codec compatibility checks
- Resolution matching
- Bitrate validation
- Force mode
- Auto-detection
- Custom tolerance

### 3. `run-simple-test.ts` - Quick Test Script
Standalone test script that runs without the vitest framework.
Perfect for quick validation during development.

## Running Tests

### Quick Test (Recommended for Development)
```bash
npm run build
node test/run-simple-test.ts
```

This runs 4 basic tests:
1. Single variant (720p)
2. Multiple variants (720p, 480p, 360p)
3. Single variant with sprites
4. Codec copy mode

### Full Test Suite (Vitest)
```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Interactive UI
npm run test:ui

# Coverage report
npm run test:coverage
```

### Run Specific Tests
```bash
# Only integration tests
npx vitest run test/hls-processor.test.ts

# Only codec copy tests
npx vitest run test/codec-copy.test.ts
```

## Test Video

The `test.mp4` file (7MB) is used for all integration tests.
- Duration: ~1 minute
- Resolution: 1280x720 (720p)
- Codec: H.264
- Audio: AAC

## Output

Tests create temporary output in `test/output/` directory.
This is automatically cleaned up after each test.

## Test Duration

- Quick test: ~2-5 minutes (depends on CPU)
- Full test suite: ~10-15 minutes
- Codec copy tests: ~30 seconds

## Debugging Tests

### Enable FFmpeg Logs
The processor logs FFmpeg progress to console:
```
[HLS] Encoding variants...
[HLS] Encoding strategy: REENCODE
[HLS] Reason: Non-zero bitrate specified
```

### Check Output Files
If a test fails, check the output directory:
```bash
ls -la test/output/
cat test/output/master.m3u8
```

### Common Issues

1. **FFmpeg not found**: Install FFmpeg and ensure it's in PATH
   ```bash
   ffmpeg -version
   ```

2. **Test timeout**: Increase timeout in `vitest.config.ts`
   ```typescript
   testTimeout: 300000, // 5 minutes
   ```

3. **Memory issues**: Reduce number of variants or video resolution

## Adding New Tests

1. Import the processor:
   ```typescript
   import { HLSProcessor } from '../src/processor.js';
   ```

2. Create test configuration:
   ```typescript
   const config: HLSProcessorConfig = {
     variants: [/* ... */],
     features: { sprites: true },
   };
   ```

3. Process video:
   ```typescript
   const processor = new HLSProcessor(config);
   const result = await processor.process({
     inputPath: TEST_VIDEO_PATH,
     outputDir: TEST_OUTPUT_DIR,
   });
   ```

4. Assert results:
   ```typescript
   expect(result.success).toBe(true);
   expect(result.variants).toHaveLength(1);
   ```

## CI/CD Integration

For CI environments, use the quick test script:

```yaml
# .github/workflows/test.yml
- name: Install FFmpeg
  run: sudo apt-get install -y ffmpeg

- name: Run tests
  run: |
    npm run build
    node test/run-simple-test.ts
```

Or use vitest with coverage:

```yaml
- name: Run full test suite
  run: npm run test:coverage
```
