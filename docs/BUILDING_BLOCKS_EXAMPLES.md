# Building Blocks Examples

Low-level utilities that enable **infinite possibilities** with FFmpeg.

## Philosophy

> "Don't give users a library of effects. Give them the tools to build any effect."

Instead of providing thousands of pre-built transitions/filters/effects, we provide:

1. **`applyFFmpegFilter()`** - Execute ANY FFmpeg operation
2. **GIF Size Optimization** - Smart size management for platform limits
3. **Type-Safe API** - Full IntelliSense support

This makes the package:

- ✅ **Minimal** (~83 KB bundle)
- ✅ **Future-proof** (AI agents can generate filter commands)
- ✅ **Extensible** (Users build custom recipes)

---

## 1. AI Agent Integration (Future-Proof)

**Vision**: User says "apply rainbow effect" → AI generates FFmpeg command → Calls our package

```typescript
import { applyFFmpegFilter } from "@classytic/vixel";

// AI Agent: GPT-4 generates this command based on user request
const aiGeneratedFilter =
  "eq=saturation=1.5:brightness=0.1,hue=h=sin(2*PI*t):s=1";

// Our package executes it
const result = await applyFFmpegFilter(
  { inputPath: "./video.mp4", duration: 120 },
  "./rainbow-effect.mp4",
  {
    videoFilter: aiGeneratedFilter,
    crf: 23,
    preset: "medium",
  },
);

console.log(
  `Effect applied! Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`,
);
```

**Why this is powerful**:

- No need to add transition/filter generators (would make package heavy)
- AI handles the creative part (generating filter commands)
- Our package handles execution (optimized, type-safe, reliable)

---

## 2. Custom Transitions (Customer Recipes)

Users can build their own effect libraries:

```typescript
import { applyFFmpegFilter } from "@classytic/vixel";

/**
 * Custom Recipe: Crossfade Transition
 * Users build this once, reuse forever
 */
export async function crossfadeTransition(
  video1: string,
  video2: string,
  output: string,
  duration: number = 1,
) {
  return applyFFmpegFilter(
    [
      { inputPath: video1, duration: 120 },
      { inputPath: video2, duration: 120 },
    ],
    output,
    {
      complexFilter: `
        [0:v][1:v]xfade=transition=fade:duration=${duration}:offset=5[vout];
        [0:a][1:a]acrossfade=d=${duration}[aout]
      `,
      maps: ["[vout]", "[aout]"],
      videoCodec: "libx264",
      audioCodec: "aac",
      preset: "medium",
    },
  );
}

// Usage
await crossfadeTransition("part1.mp4", "part2.mp4", "merged.mp4", 2);
```

**More Custom Recipes**:

```typescript
// Zoom in effect
export async function zoomIn(input: string, output: string) {
  return applyFFmpegFilter({ inputPath: input, duration: 120 }, output, {
    videoFilter: "zoompan=z='min(zoom+0.0015,1.5)':d=125",
  });
}

// Ken Burns effect (pan and zoom like documentaries)
export async function kenBurns(input: string, output: string) {
  return applyFFmpegFilter({ inputPath: input, duration: 120 }, output, {
    videoFilter:
      "zoompan=z='min(max(zoom,pzoom)+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
  });
}

// Vintage film effect
export async function vintageFilm(input: string, output: string) {
  return applyFFmpegFilter({ inputPath: input, duration: 120 }, output, {
    videoFilter:
      "eq=saturation=0.5:contrast=1.2,curves=vintage,noise=alls=20:allf=t+u",
  });
}

// Split screen (2 videos side by side)
export async function splitScreen(left: string, right: string, output: string) {
  return applyFFmpegFilter(
    [
      { inputPath: left, duration: 120 },
      { inputPath: right, duration: 120 },
    ],
    output,
    {
      complexFilter: `
        [0:v]scale=iw/2:ih[left];
        [1:v]scale=iw/2:ih[right];
        [left][right]hstack
      `,
      maps: ["[0:a]"],
    },
  );
}
```

---

## 3. Advanced Multi-Input Compositing

Picture-in-picture with logo overlay:

```typescript
import { applyFFmpegFilter } from "@classytic/vixel";

const result = await applyFFmpegFilter(
  [
    { inputPath: "./main.mp4", duration: 120 },
    { inputPath: "./webcam.mp4", duration: 120 },
    { inputPath: "./logo.png", duration: 120 },
  ],
  "./composite.mp4",
  {
    complexFilter: `
      [0:v]scale=1920:1080[main];
      [1:v]scale=480:270[pip];
      [2:v]scale=iw*0.2:-1[logo];
      [main][pip]overlay=W-w-10:H-h-10[tmp];
      [tmp][logo]overlay=10:10[vout]
    `,
    maps: ["[vout]", "0:a"],
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 23,
    preset: "medium",
    onProgress: (progress) => {
      console.log(`Progress: ${progress.percent.toFixed(1)}%`);
    },
  },
);
```

---

## 4. GIF Size Optimization (Platform Limits)

Smart GIF generation that fits platform requirements:

```typescript
import {
  generateGif,
  optimizeGifForSize,
  getRecommendedGifConfig,
  PLATFORM_LIMITS,
} from "@classytic/vixel";

// Example 1: Auto-optimize for Twitter (15 MB limit)
const optimized = optimizeGifForSize(
  { inputPath: "./video.mp4", duration: 120 },
  { start: 0, end: 10 },
  { width: 720, format: "gif" },
  PLATFORM_LIMITS.twitter, // 15 MB
);

console.log(`Optimized: ${optimized.width}px @ ${optimized.fps}fps`);
console.log(
  `Estimated: ${(optimized.estimatedSize / 1024 / 1024).toFixed(2)} MB`,
);

if (optimized.adjustments.widthReduced) {
  console.log("⚠️ Width reduced to fit size limit");
}

// Generate with optimized settings
const result = await generateGif(
  { inputPath: "./video.mp4", duration: 120 },
  { start: 0, end: 10 },
  "./output",
  {
    width: optimized.width,
    fps: optimized.fps,
    format: "gif",
  },
);

// Example 2: Get recommended config for platform
const discordConfig = getRecommendedGifConfig("discord", 5);
console.log("Discord GIF config:", discordConfig);
// { width: 480, fps: 15, optimization: 'quality' }

// Example 3: Platform limits
console.log("Twitter limit:", PLATFORM_LIMITS.twitter / 1024 / 1024, "MB"); // 15 MB
console.log("Discord limit:", PLATFORM_LIMITS.discord / 1024 / 1024, "MB"); // 8 MB
console.log("Slack limit:", PLATFORM_LIMITS.slack / 1024 / 1024, "MB"); // 5 MB
```

---

## 5. Progress Tracking & Monitoring

```typescript
import { applyFFmpegFilter } from "@classytic/vixel";

await applyFFmpegFilter(
  { inputPath: "./long-video.mp4", duration: 3600 },
  "./processed.mp4",
  {
    videoFilter: "scale=1920:1080,eq=contrast=1.2",
    onProgress: (progress) => {
      console.log(`
        Progress: ${progress.percent.toFixed(1)}%
        Time: ${progress.currentTime.toFixed(1)}s / ${progress.duration}s
        FPS: ${progress.fps.toFixed(1)}
        Speed: ${progress.speed.toFixed(2)}x
        Frame: ${progress.frame}
        Bitrate: ${progress.bitrate}
      `);

      // Update UI progress bar
      updateProgressBar(progress.percent);
    },
  },
);
```

---

## 6. Green Screen / Chroma Key

```typescript
export async function removeGreenScreen(
  videoWithGreenScreen: string,
  backgroundVideo: string,
  output: string,
) {
  return applyFFmpegFilter(
    [
      { inputPath: videoWithGreenScreen, duration: 120 },
      { inputPath: backgroundVideo, duration: 120 },
    ],
    output,
    {
      complexFilter: `
        [0:v]chromakey=0x00FF00:0.3:0.2[fg];
        [1:v]scale=1920:1080[bg];
        [bg][fg]overlay
      `,
      maps: ["0:a"],
    },
  );
}
```

---

## 7. Color Grading

```typescript
// Cinematic color grade
export async function cinematicGrade(input: string, output: string) {
  return applyFFmpegFilter({ inputPath: input, duration: 120 }, output, {
    videoFilter:
      "eq=contrast=1.1:brightness=-0.05:saturation=0.9,curves=blue='0/0 0.5/0.58 1/1'",
  });
}

// Instagram-like filters
export async function instagramFilter(
  input: string,
  output: string,
  filter: "valencia" | "xpro2" | "walden",
) {
  const filters = {
    valencia: "eq=contrast=1.08:saturation=1.1:gamma=1.2",
    xpro2: "curves=r='0/0.15 0.5/0.5 1/0.85':g='0/0.1 0.5/0.5 1/0.9'",
    walden:
      "eq=saturation=1.6:brightness=0.1,colorbalance=rs=0.1:gs=-0.05:bs=-0.1",
  };

  return applyFFmpegFilter({ inputPath: input, duration: 120 }, output, {
    videoFilter: filters[filter],
  });
}
```

---

## 8. Advanced Audio Processing

```typescript
// Audio ducking (lower music volume when voice is present)
export async function audioDucking(
  music: string,
  voice: string,
  output: string,
) {
  return applyFFmpegFilter(
    [
      { inputPath: music, duration: 120 },
      { inputPath: voice, duration: 120 },
    ],
    output,
    {
      complexFilter: `
        [0:a]volume=0.3[music];
        [1:a]asplit[voice1][voice2];
        [music][voice2]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=1000[bg];
        [bg][voice1]amix=inputs=2
      `,
    },
  );
}
```

---

## Why This Approach Wins

### ❌ Heavy Package Approach:

```typescript
// Would require MASSIVE package with thousands of effects:
import {
  crossfadeTransition,
  slideTransition,
  zoomTransition,
  rotateTransition,
  // ... 1000+ more transitions
  rainbowFilter,
  vintageFilter,
  sepiaFilter,
  // ... 1000+ more filters
} from "bloated-video-lib"; // 50+ MB package!
```

### ✅ Building Blocks Approach:

```typescript
// Minimal package (~83 KB)
import { applyFFmpegFilter } from "@classytic/vixel";

// AI generates filter command OR user creates custom recipe
const filter = getFilterFromAI("rainbow effect"); // AI-generated
await applyFFmpegFilter(source, output, { videoFilter: filter });
```

---

## Bundle Size Comparison

**Our Approach** (Building Blocks):

- Core: 83 KB
- GIF utilities: ~5 KB
- **Total: ~88 KB** ✅

**Heavy Approach** (Pre-built Effects):

- Core: 83 KB
- 100 transitions: ~500 KB
- 100 filters: ~500 KB
- 50 effects: ~300 KB
- Documentation: ~100 KB
- **Total: ~1.5 MB** ❌

**Even worse**: Each new effect request requires package update!

---

## AI Integration Example (Full Workflow)

```typescript
import { applyFFmpegFilter } from "@classytic/vixel";

// Step 1: User request
const userRequest = "Make this video look like an old 1970s film";

// Step 2: AI (GPT-4) generates FFmpeg filter
const aiResponse = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content:
        "You are an FFmpeg expert. Generate filter commands for video effects.",
    },
    {
      role: "user",
      content: `Generate FFmpeg video filter for: ${userRequest}`,
    },
  ],
});

const filterCommand = aiResponse.choices[0].message.content;
// Result: "eq=saturation=0.6:contrast=1.3,curves=vintage,noise=alls=10:allf=t+u,fps=24"

// Step 3: Our package executes it
const result = await applyFFmpegFilter(
  { inputPath: "./modern-video.mp4", duration: 120 },
  "./1970s-film.mp4",
  {
    videoFilter: filterCommand,
    crf: 23,
    preset: "medium",
    onProgress: (p) => console.log(`${p.percent.toFixed(1)}%`),
  },
);

console.log("✅ 1970s film effect applied!");
```

---

## Summary

**Building Blocks Philosophy**:

1. **One function** (`applyFFmpegFilter`) = Infinite possibilities
2. **AI-powered** = Future-proof (AI generates commands, we execute)
3. **Customer recipes** = Users build their own effect libraries
4. **Minimal bundle** = ~88 KB vs 1.5+ MB
5. **Type-safe** = Full IntelliSense support

This is how you build a **"thousand-dollar worth infrastructure"** - not by adding features, but by enabling infinite possibilities with minimal code.
