# Vixel

> **AI-powered video processing engine** - Minimal, extensible, future-proof.

Production-ready HLS streaming with **10-20x codec copy optimization**. Built for AI agents and developers who need full control.

## Features

- ✅ **HLS Streaming** - Codec copy optimization (10-20x faster)
- ✅ **Video Generators** - GIF, thumbnails, trim, concat, speed, compress
- ✅ **Building Blocks** - `applyFFmpegFilter()` for ANY FFmpeg operation
- ✅ **AI-Ready** - Execute AI-generated filter commands
- ✅ **Minimal** - ~103 KB bundle with tree-shaking
- ✅ **Type-Safe** - Full TypeScript support

## Installation

```bash
npm install @classytic/vixel
```

## Quick Start

```typescript
import { HLSProcessor } from '@classytic/vixel';

const processor = new HLSProcessor({
  variants: [
    { name: '720p', height: 720, videoBitrate: 2800, audioBitrate: 128 },
    { name: '480p', height: 480, videoBitrate: 1400, audioBitrate: 128 },
  ],
  ffmpeg: {
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    timeout: 60 * 60 * 1000, // 60 minutes (default: 10 min)
  },
});

const result = await processor.process({
  inputPath: './input.webm',
  outputDir: './output/hls',
  onProgress: (p) => console.log(`${p.percent}% complete`),
});
```

## Codec Copy (10-20x Faster)

Automatically uses codec copy when source matches target resolution:

```typescript
const processor = new HLSProcessor({
  variants: [{ name: '720p', height: 720, videoBitrate: 2800 }],
  ffmpeg: {
    codecCopy: {
      enabled: true,          // Enable codec copy
      autoDetect: true,       // Auto-detect compatibility
      resolutionTolerance: 10,
    },
  },
});

// 720p VP9 source → re-encode (incompatible codec)
// 720p H.264 source → codec copy (10-20x faster!)
```

**Performance**: 5-10s vs 60-90s for 5min video

## Smart Variant Selection

```typescript
import { selectVariant } from '@classytic/vixel';

const { variant, strategy, reason } = selectVariant({
  height: 720,
  videoCodec: 'vp9',
  audioCodec: 'opus',
}, { maxHeight: 720 });

// strategy: 'reencode'
// reason: 'Source codec vp9 is not HLS-compatible'
```

## Building Blocks (AI Integration)

Execute AI-generated FFmpeg commands:

```typescript
import { applyFFmpegFilter } from '@classytic/vixel';

// AI generates this filter
const filter = 'eq=saturation=1.5,hue=h=30';

await applyFFmpegFilter(
  { inputPath: './video.mp4', duration: 60 },
  './output.mp4',
  { videoFilter: filter }
);
```

Create custom effects:

```typescript
// Custom rainbow filter
async function applyRainbow(input, output) {
  return applyFFmpegFilter(input, output, {
    videoFilter: 'hue=h=sin(2*PI*t):s=1',
  });
}
```

## Generators

```typescript
import {
  generateGif,
  extractThumbnail,
  trimVideo,
  changeSpeed,
} from '@classytic/vixel/generators';

// GIF with auto size optimization
await generateGif(source, { start: 10, end: 15 }, './out.gif', {
  width: 480,
  fps: 15,
  platform: 'twitter', // Auto-optimizes for 15MB limit
});

// Thumbnail
await extractThumbnail(source, 5, './thumb.jpg', { width: 320 });

// Trim
await trimVideo(source, './trimmed.mp4', { start: 10, end: 30 });

// Speed adjustment
await changeSpeed(source, './fast.mp4', { speed: 2.0 });
```

## API Reference

### HLSProcessorConfig

```typescript
{
  variants: QualityVariant[];
  features?: {
    sprites?: boolean;      // YouTube-style thumbnails
    chapters?: boolean;     // WebVTT chapters
  };
  ffmpeg?: {
    ffmpegPath?: string;
    ffprobePath?: string;
    timeout?: number;       // ms (default: 10 min)
    codecCopy?: {
      enabled?: boolean;
      autoDetect?: boolean;
      resolutionTolerance?: number;
    };
  };
  debug?: boolean;
}
```

### QualityVariant

```typescript
{
  name: string;           // '720p'
  height: number;         // 720
  videoBitrate: number;   // kbps (0 = codec copy)
  audioBitrate: number;   // kbps (0 = codec copy)
  encodingMode?: 'auto' | 'reencode' | 'copy';
}
```

## Cleanup

**Important**: Processor doesn't auto-cleanup output directory.

```typescript
import { rm } from 'fs/promises';

try {
  const result = await processor.process({ inputPath, outputDir });
  await uploadToS3(outputDir); // Your upload logic
  await rm(outputDir, { recursive: true, force: true });
} catch (error) {
  await rm(outputDir, { recursive: true, force: true });
  throw error;
}
```

## TypeScript

```typescript
import type {
  HLSProcessor,
  HLSProcessorConfig,
  QualityVariant,
  FFmpegFilterConfig,
} from '@classytic/vixel';
```

## Requirements

- **Node.js**: 18+
- **FFmpeg**: 4.0+
- **Platform**: Linux, macOS, Windows

## License

MIT © [Classytic](https://github.com/classytic/vixel)
