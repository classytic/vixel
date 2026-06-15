# Vixel

> **Composable FFmpeg primitives for AI/agentic video** — typed, dry-runnable, tree-shakeable.

Bring a `Source`, compose a video. Vixel is a clean primitive engine for agents
and developers who need full control: a declarative `compose()` renderer,
bring-your-own-style animated captions, editor/HLS profile builders, and ~24
single-op generators — each importable from its own subpath so the package
stays lean.

## Subpaths

Import only what you need; everything is tree-shakeable and ESM-only.

| Subpath | What's in it |
| --- | --- |
| `@classytic/vixel` | `Source` + ingest, dimensions, typed errors, every primitive re-exported |
| `@classytic/vixel/compose` | **`compose()`** — declarative multi-track renderer (the MCP surface) |
| `@classytic/vixel/compositing` | `chromaKey` · `blend` · `mask` — descriptor-backed `mixer2` primitives |
| `@classytic/vixel/captions` | `burnCaptions` / `buildAss` — BYO-styled animated captions (CapCut modes) |
| `@classytic/vixel/profiles` | `editorProxy` · `editorPackage` · `hlsLadder` |
| `@classytic/vixel/generators` | ~24 single-op transforms (trim, kenBurns, reframe, glow, …) |
| `@classytic/vixel/utils` | `Logger`, time formatting helpers |

## Features

- ✅ **Declarative compose** — one `VixelSpec` → one `filter_complex`: clips +
  transitions, ducked audio bed, image/GIF + BYO-text overlays, ken-burns
- ✅ **BYO-style captions** — libass/ASS with your own `TextStyle`; `karaoke`,
  `pop`, `word-by-word`, `highlight`, `highlight-box` (CapCut active-word)
- ✅ **`Source` ingest** — probed file/buffer/remote handle, SSRF-guarded fetch
- ✅ **Profiles** — editor proxy (scrub-accurate), editor package, HLS ladder
- ✅ **Fluent Pipeline** — chain trim → caption → reframe → mix → fade → … with auto temp-file cleanup
- ✅ **HLS Streaming** — codec copy optimization (10-20x faster), parallel variant encoding
- ✅ **~24 Generators** — GIF, thumbnails, sprites, trim, concat, speed, compress, watermark, crop, audio, convert, audio-mix+ducking, caption burn-in, xfade, reframe, fade, frame-extract, **Ken Burns, slideshow, color/LUT, loudness (LUFS)**
- ✅ **Cancellable** — `AbortSignal` on every operation
- ✅ **Debuggable** — dry-run + exact ffmpeg command capture
- ✅ **Building Blocks** — `applyFFmpegFilter()` for any FFmpeg operation
- ✅ **Typed Errors** — `VixelError`, `tryCatch()` wrapper, error codes, type guards
- ✅ **Minimal** — tree-shakeable, ESM-only, zero runtime deps (peer: fluent-ffmpeg, @aws-sdk/client-s3)

## Requirements

- **Node.js**: 18+
- **FFmpeg**: 6+ (system binary — not bundled)

### Install FFmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt-get install ffmpeg

# Windows (via Winget)
winget install Gyan.FFmpeg

# Windows (via Chocolatey)
choco install ffmpeg
```

Verify installation:

```bash
ffmpeg -version    # should print 6.x or higher
ffprobe -version
```

## Installation

```bash
npm install @classytic/vixel
```

## Quick Start — compose a video from one spec

`compose()` is the headline primitive: a declarative `VixelSpec` becomes a
single `filter_complex` render. Video clips with transitions, a ducked music
bed, and image/text overlays — in one call.

```typescript
import { compose } from '@classytic/vixel/compose';

await compose(
  {
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      {
        type: 'video',
        clips: [
          { source: 'a.mp4', duration: 3,
            transition: { type: 'dissolve', duration: 0.5 },
            animation: { preset: 'kenBurns', direction: 'in' } },
          { source: 'b.mp4', duration: 3 },
        ],
      },
      { type: 'audio', items: [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }] },
      {
        type: 'overlay',
        items: [
          { kind: 'image', source: 'logo.png', at: 0, duration: 3, position: 'top-right', width: 0.2 },
          { kind: 'text', at: 0, duration: 3, text: 'hi there',
            style: { animation: 'highlight', highlightColor: '#39FF14' } },
        ],
      },
    ],
  },
  'out.mp4',
);
```

Pass `{ dryRun: true, onCommand: (c) => … }` to inspect the exact ffmpeg
invocation without rendering.

> **v1 limits** (rejected loudly — never silently mis-rendered): mixed
> hard-cut + crossfade in one track, more than one audio bed, `fit: cover`, and
> overlay `slide`/`pop` variants.

**Transition presets** — a clip's `transition.type` accepts raw `xfade` names
(`dissolve`, `wipeleft`, …) *and* CapCut-flavored presets from `TRANSITION_PRESETS`:
`whip-pan` · `zoom-blur` · `blur` · `glitch` · `radial` · `ripple` · `squeeze` ·
`iris`. The catalog is exported as **data** (`name → { xfade, defaultDuration }`)
so an editor UI or browser preview can read the same names vixel renders from —
no renderer import, spec stays intent-level.

### HLS streaming

`HLSProcessor` is a **named** export (it was the default before 0.3.0):

```typescript
import { HLSProcessor } from '@classytic/vixel';

const processor = new HLSProcessor({
  variants: [
    { name: '720p', height: 720, videoBitrate: 2800, audioBitrate: 128 },
    { name: '480p', height: 480, videoBitrate: 1400, audioBitrate: 128 },
  ],
  ffmpeg: { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', timeout: 60 * 60 * 1000 },
});

const result = await processor.process({
  inputPath: './input.webm',
  outputDir: './output/hls',
  onProgress: (p) => console.log(`${p.percent}% complete`),
});
```

## Pipeline (compose multiple steps)

Chain operations into one call. Vixel manages the intermediate temp files and
cleans them up for you — even if a step fails.

```typescript
import { pipeline } from '@classytic/vixel';

const result = await pipeline('./input.mp4')
  .trim({ start: 10, end: 40 })
  .watermark({ type: 'image', imagePath: './logo.png', position: 'bottom-right' })
  .compress({ crf: 23, preset: 'fast' })
  .run('./output.mp4');

console.log(result.steps);    // ['trim', 'watermark', 'compress']
console.log(result.commands); // exact ffmpeg commands that ran
```

**Cancellation + overall progress:**

```typescript
const ac = new AbortController();
setTimeout(() => ac.abort(), 30_000); // cancel after 30s

await pipeline(source, {
  signal: ac.signal,
  onProgress: (p) => console.log(`${p.step}: ${p.overall.toFixed(0)}%`),
})
  .compress({ crf: 28 })
  .run('./out.mp4');
```

**Dry-run — inspect commands without running ffmpeg** (great for debugging & cost estimation):

```typescript
const commands = await pipeline('./input.mp4')
  .trim({ start: 0, end: 5 })
  .speed({ speed: 2 })
  .toCommands('./out.mp4');

commands.forEach((c) => console.log(c.command));
// ffmpeg -ss 0 -t 5 -i ... "<temp>.mp4"
// ffmpeg -i <temp>.mp4 -filter:v setpts=... ./out.mp4
```

Every standalone generator also accepts `signal`, `dryRun`, and `onCommand`:

```typescript
await compressVideo(source, './out.mp4', {
  crf: 23,
  signal: ac.signal,
  onCommand: (cmd) => console.log(cmd.command), // audit the exact command
});
```

## Captions (bring your own style)

`@classytic/vixel/captions` burns animated, word-timed captions via libass/ASS.
You bring a `TextStyle` (font, fill, stroke, highlight, shadow) and pick an
animation mode — or start from a preset and override.

```typescript
import { Source } from '@classytic/vixel';
import { burnCaptions } from '@classytic/vixel/captions';

const src = await Source.fromFile('in.mp4');
await burnCaptions(
  src,
  [
    { text: 'made with vixel', startMs: 0, endMs: 1600, words: [
      { text: 'made', startMs: 0,   endMs: 400 },
      { text: 'with', startMs: 400, endMs: 800 },
      { text: 'vixel', startMs: 800, endMs: 1600 },
    ] },
  ],
  'out.mp4',
  {
    preset: 'active-word',                  // tiktok-bold | minimal | karaoke-highlight | word-focus | active-word | boxed
    style: { highlightColor: '#39FF14' },   // ...overridden field-by-field with your own TextStyle
  },
);
```

**Animation modes:** `none` · `fade` · `karaoke` · `pop` · `word-by-word` ·
`highlight` · `highlight-box` (CapCut-style active-word emphasis). All accept a
fully custom `TextStyle`, so hosts can expose stroke/font/color to end users.

## Motion dynamics

CapCut-grade motion, as pure ffmpeg primitives. `speedRamp` gives variable speed
with **optical-flow slow-motion** — buttery slow-mo (interpolated frames), not
stuttered duplicates — driven by an intent-level segment list.

```typescript
import { Source, speedRamp } from '@classytic/vixel';

const src = await Source.fromFile('jump.mp4'); // 6s
await speedRamp(src, 'ramped.mp4', {
  segments: [
    { throughSec: 2, speed: 1 },    // run-up, real-time
    { throughSec: 3, speed: 0.3 },  // slow-mo on the action (motion-interpolated)
    { throughSec: 6, speed: 2 },    // fast landing
  ],
});
// → result.plan maps source-time → output-time so your timeline stays in sync
```

**Keyframed overlay motion** — a sticker / lower-third can travel a path. The
keyframe model (`[{ t, x, y, easing }]`) compiles to an ffmpeg `overlay=x/y`
time-expression, and is the same data a host's keyframe-curve editor renders:

```typescript
import { compose } from '@classytic/vixel/compose';
await compose({
  version: 1, output: { width: 1080, height: 1920, fps: 30 },
  tracks: [
    { type: 'video', clips: [{ source: 'a.mp4', duration: 3 }] },
    { type: 'overlay', items: [{
      kind: 'image', source: 'sticker.png', at: 0, duration: 3, width: 0.15,
      motion: [
        { t: 0, x: 0.1, y: 0.1 },
        { t: 1.5, x: 0.9, y: 0.3, easing: 'easeInOut' },
        { t: 3, x: 0.5, y: 0.9, easing: 'easeOut' },
      ],
    }] },
  ],
}, 'out.mp4');
```

`motionEffect` adds the trending in-filter "energy" effects — all pure ffmpeg,
no per-frame canvas pass:

```typescript
import { Source, motionEffect } from '@classytic/vixel';

const src = await Source.fromFile('clip.mp4');
await motionEffect(src, 'glitched.mp4', { effect: 'glitch', intensity: 0.7 });
// effects: 'glitch' | 'shake' | 'rgb-split' | 'zoom-punch'
```

**Auto-edit on the beat.** `detectBeats` finds audio onsets (zero-dependency —
ffmpeg decodes PCM, peak-picking is pure JS) and `beatSyncSpec` snaps clip cuts
to them, emitting a `VixelSpec` you hand straight to `compose()`:

```typescript
import { detectBeats, beatSyncSpec } from '@classytic/vixel/compose';
import { compose } from '@classytic/vixel/compose';

const { beats } = await detectBeats({ inputPath: 'song.mp3', duration: 30 });
const spec = beatSyncSpec({
  sources: ['clip1.mp4', 'clip2.mp4', 'clip3.mp4'], // cycled across the beats
  beats,
  output: { width: 1080, height: 1920, fps: 30 },
  audioSource: 'song.mp3', // dropped in as the music bed
});
await compose(spec, 'beat-cut.mp4');
```

## Compositing (the `mixer2` family)

`@classytic/vixel/compositing` are the two-input compositing primitives —
green-screen keying, blend modes, and shaped masks. Each ships a
**machine-readable descriptor** (typed params + input arity) so an agent or an
editor UI can enumerate it as data.

```typescript
import { Source } from '@classytic/vixel';
import { chromaKey, blend, mask, COMPOSITING_DESCRIPTORS } from '@classytic/vixel/compositing';

// green-screen the foreground over a background
await chromaKey(await Source.fromFile('subject.mp4'), await Source.fromFile('bg.mp4'), 'out.mp4',
  { color: '00FF00', similarity: 0.2 });

// screen-blend two layers
await blend(await Source.fromFile('a.mp4'), await Source.fromFile('b.mp4'), 'lightleak.mp4', { mode: 'screen' });

// circular alpha cutout (round avatar / PiP) — outputs alpha
await mask(await Source.fromFile('face.mp4'), 'avatar.mov', { shape: 'circle', feather: 0.06 });

COMPOSITING_DESCRIPTORS; // → the catalog as data (id, arity, typed params) for hosts/agents
```

> **Design boundary** — vixel ships the compositing that's expressible as an
> ffmpeg filter graph. Animated/roto mattes, arbitrary blend stacks, and nested
> comps are **compositor-tier** and stay in the host editor. The full rationale
> (grounded in OpenTimelineIO / MLT / OpenFX / frei0r / movis) is in
> [DESIGN.md](DESIGN.md).

## Building a UI editor on vixel

vixel is the engine + the contract; the editor UI is yours. Three published
pieces are all a Node.js editor needs — no engine internals, no hardcoding:

```typescript
import { planTimeline, formatTimecode } from '@classytic/vixel/compose';
import { COMPOSITING_DESCRIPTORS } from '@classytic/vixel/compositing';

// 1. The DOCUMENT your UI edits is the VixelSpec (drag clips, drop transitions).
// 2. The frame-exact render model — drives a zoomable timeline + playhead:
const plan = planTimeline(spec.tracks[0].clips, spec.output.fps);
plan.totalFrames;                 // the zoom domain — multiply by pixels-per-frame
plan.clips[0].frameDuration;      // exact clip widths on the ruler
plan.transitions[0].frameOffset;  // exact transition markers
formatTimecode(2.5, spec.output.fps); // "00:00:02:12" — ruler/playhead labels
// 3. The PARAMS PANEL auto-builds from descriptors (typed, ranged, units):
COMPOSITING_DESCRIPTORS;          // [{ id, arity, params:[{name,type,min,max,step,unit,…}] }]
```

Because the spec is intent-level and the plan is frame-exact, the same document
an **agent** emits is the one a **human editor** zooms into — one source of
truth, two authors. Rendering is always `compose(spec, out)`. The boundary (what
the engine does vs. what your UI owns) is spelled out in [DESIGN.md](DESIGN.md).

Saved projects stay loadable across versions via `migrateSpec(json)`, and a
clip's `source` can be an `external` (proxy-swappable), `generator`, or `missing`
(offline) reference — so an editor can save a project with unresolved media and
reopen it later.

## Profiles

`@classytic/vixel/profiles` are opinionated, single-call builders for the common
shapes an editor or streaming host needs.

```typescript
import { Source } from '@classytic/vixel';
import { editorProxy, editorPackage, hlsLadder } from '@classytic/vixel/profiles';

const src = await Source.fromFile('master.mov'); // any VideoSource: { inputPath, duration, width?, height? }

// Scrub-accurate H.264 proxy: faststart, fixed GOP, forced keyframes, 1080p cap
await editorProxy(src, 'proxy.mp4');

// Proxy + poster frame + sprite sheet in one call
const pkg = await editorPackage(src, './out');

// No-upscale adaptive HLS ladder sized to the source
await hlsLadder(src, './hls');
```

## Source & ingest

`Source` is a probed handle over a file, buffer, or remote URL. Remote ingest is
byte-capped and SSRF-guarded (private/reserved IPv4+IPv6, redirect
re-validation, userinfo stripping).

```typescript
import { Source } from '@classytic/vixel';

const src = await Source.fromFile('clip.mp4');
console.log(src.width, src.height, src.duration, src.hasAudio);

const remote = await Source.fromUrl('https://example.com/clip.mp4'); // guarded fetch + probe
```

## Post-production primitives

Higher-level operations for AI-video and editing pipelines — each is a generator
*and* a pipeline step.

```typescript
import { mixAudio, burnSubtitles, concatWithTransitions, reframe, fade, extractFrameAt } from '@classytic/vixel';

// Voiceover over auto-ducked background music (music drops under speech)
await mixAudio({ inputPath: './visuals.mp4', duration: 30 }, './final.mp4', {
  voiceover: './vo.mp3',
  music: './bed.mp3',           // duck defaults on when both are present
});

// Burn a subtitle FILE or a static styled text block (distinct from the animated
// `burnCaptions` in @classytic/vixel/captions — see that section above).
await burnSubtitles(source, './captioned.mp4', { subtitlePath: './captions.srt', forceStyle: 'Fontsize=30' });
await burnSubtitles(source, './titled.mp4',    { text: 'Chapter One', position: 'center', fontSize: 48 });

// Crossfade/dissolve/wipe between clips (instead of hard cuts)
await concatWithTransitions([shot1, shot2, shot3], './reel.mp4', {
  transition: 'dissolve', duration: 0.75, width: 1080, height: 1920,
});

// Re-aspect 16:9 → vertical 9:16 with a blurred background
await reframe(source, './vertical.mp4', { aspect: '9:16', mode: 'blur-pad' });

// Fade in/out (video + audio)
await fade(source, './faded.mp4', { fadeIn: 0.5, fadeOut: 1 });

// Grab the last frame for shot-to-shot continuity
await extractFrameAt(source, source.duration - 0.04, './end-frame.png');
```

They chain in the pipeline too:

```typescript
await pipeline('./raw.mp4')
  .reframe({ aspect: '9:16', mode: 'blur-pad' })
  .captions({ subtitlePath: './subs.srt' })
  .mixAudio({ music: './bed.mp3' })
  .fade({ fadeIn: 0.5, fadeOut: 0.5 })
  .run('./social.mp4');
```

## Faceless-video primitives (images → motion)

```typescript
import { kenBurns, slideshow, adjustColor, applyLut, normalizeLoudness } from '@classytic/vixel';

// Still image → moving clip (zoom/pan)
await kenBurns('./photo.jpg', './clip.mp4', { duration: 5, direction: 'in' });

// Many images → a video with Ken Burns + transitions
await slideshow(['a.jpg', 'b.jpg', 'c.jpg'], './reel.mp4', {
  durationPer: 4, transition: 'fade', width: 1080, height: 1920,
});

// Color grade (parametric — you pick the values)
await adjustColor(source, './graded.mp4', { contrast: 1.1, saturation: 1.2, sharpen: 0.8 });
await applyLut(source, './look.mp4', { lutPath: './teal-orange.cube' });

// Loudness to a platform target (two-pass EBU R128)
await normalizeLoudness(source, './out.mp4', { preset: 'youtube' }); // -14 LUFS
```

A full faceless pipeline, end to end:

```typescript
// (host generates the VO + SRT + images; vixel assembles)
const reel = await slideshow(images, './base.mp4', { width: 1080, height: 1920, transition: 'fade' });

await pipeline('./base.mp4')
  .captions({ subtitlePath: './captions.srt' })
  .adjust({ contrast: 1.05, saturation: 1.1 })
  .mixAudio({ voiceover: './vo.mp3', music: './bed.mp3' }) // ducked
  .fade({ fadeIn: 0.5, fadeOut: 0.5 })
  .run('./final.mp4');
```

> **Scope:** vixel ships mechanical primitives + the `applyFFmpegFilter` escape hatch.
> Voiceover/TTS, stock/AI footage, and caption *timing* are the host's job; vixel
> only renders. Which LUT / how much grade is the agent's call — vixel exposes the knob.

## Concurrency control

Process many items without spawning unbounded ffmpeg processes (which would OOM):

```typescript
import { mapWithConcurrency } from '@classytic/vixel';

const outputs = await mapWithConcurrency(videos, 3, (video, i) =>
  compressVideo({ inputPath: video, duration: 60 }, `out-${i}.mp4`, { crf: 28 }),
);
```

HLS variant encoding is parallel by default (cap via `concurrency`, default 2).

## Error Handling

All vixel operations throw `VixelError` (or a subclass). Use `tryCatch()` for the cleanest call sites:

```typescript
import { tryCatch, ErrorCode, isFFmpegError } from '@classytic/vixel';

// Returns [value, null] on success, [null, VixelError] on failure
const [gif, err] = await tryCatch(() =>
  generateGif(source, { start: 10, end: 15 }, './out', { width: 480 })
);

if (err) {
  switch (err.code) {
    case ErrorCode.FFMPEG_TIMEOUT:
      console.error('Encoding took too long');
      break;
    case ErrorCode.FFMPEG_NOT_FOUND:
      console.error('ffmpeg binary not found — is it installed?');
      break;
    case ErrorCode.FFMPEG_FAILED:
      console.error('FFmpeg error:', err.cause); // last 500 chars of stderr
      break;
    default:
      throw err; // re-throw unexpected errors
  }
}
```

Or with a plain `try/catch` using the type guard and `code` field:

```typescript
import { isFFmpegError, isVixelError, ErrorCode } from '@classytic/vixel';

try {
  const result = await processor.process({ inputPath, outputDir });
} catch (err) {
  if (isFFmpegError(err)) {
    // err.code is one of ErrorCode.FFMPEG_*
    // err.cause contains raw stderr or the original Error
    console.error(`[${err.code}] ${err.message}`);
  } else if (isVixelError(err)) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    throw err;
  }
}
```

### Error Codes

| Code | Class | When |
|---|---|---|
| `FFMPEG_ERROR` | `FFmpegError` | Generic FFmpeg failure |
| `FFMPEG_TIMEOUT` | `FFmpegError` | Process exceeded `timeout` |
| `FFMPEG_SPAWN_ERROR` | `FFmpegError` | Binary not found / spawn failed |
| `FFMPEG_FAILED` | `FFmpegError` | Non-zero exit code |
| `PROBE_FAILED` | `FFmpegError` | ffprobe failed / no video stream |
| `ABORTED` | `AbortError` | Cancelled via `AbortSignal` |
| `INVALID_CONFIG` | `HLSProcessorError` | Bad variant / processor config |
| `PROCESSING_FAILED` | `HLSProcessorError` | Pipeline failure |
| `UNKNOWN` | `VixelError` | Wrapped non-vixel error |

## Codec Copy (10-20x Faster)

Automatically uses codec copy when source matches target resolution:

```typescript
const processor = new HLSProcessor({
  variants: [{ name: '720p', height: 720, videoBitrate: 2800 }],
  ffmpeg: {
    codecCopy: {
      enabled: true,
      autoDetect: true,       // auto-detect compatibility
      resolutionTolerance: 10,
    },
  },
});

// 720p VP9 source → re-encode (incompatible codec)
// 720p H.264 source → codec copy (10-20x faster!)
```

**Performance**: 5-10s vs 60-90s for a 5-minute video

## Hardware Acceleration

Vixel auto-detects GPU encoders at startup (nvenc → qsv → vaapi → videotoolbox → software fallback). No config required — it just works faster when a GPU is available.

```typescript
import { detectHardwareAccel } from '@classytic/vixel/generators';

const accel = await detectHardwareAccel(); // 'nvenc' | 'qsv' | 'vaapi' | 'videotoolbox' | 'none'
console.log(`Using: ${accel}`);
```

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

Execute AI-generated FFmpeg commands safely:

```typescript
import { applyFFmpegFilter } from '@classytic/vixel';

// AI generates this filter string
const filter = 'eq=saturation=1.5,hue=h=30';

await applyFFmpegFilter(
  { inputPath: './video.mp4', duration: 60 },
  './output.mp4',
  { videoFilter: filter }
);
```

## Generators

```typescript
import {
  generateGif,
  extractThumbnail,
  trimVideo,
  changeSpeed,
  compressVideo,
  addWatermark,
  concatenateVideos,
  convertFormat,
  cropResize,
  extractAudio,
} from '@classytic/vixel/generators';

// GIF with platform size optimization
await generateGif(source, { start: 10, end: 15 }, './out', {
  width: 480,
  fps: 15,
  format: 'gif',         // or 'webp' for 50-80% smaller
  optimization: 'quality', // two-pass palette (YouTube-quality)
});

// Smart thumbnail — picks the most visually interesting frame
await extractThumbnails(source, './thumbs', { strategy: 'smart' });

// Thumbnail at specific timestamp
await extractThumbnail(source, 5, './thumb.jpg', { width: 320, format: 'webp' });

// Trim
await trimVideo(source, './trimmed.mp4', { start: 10, end: 30 });

// Speed — audio stays in sync. Pitch is preserved by default (atempo);
// pass maintainPitch:false for a tape-style pitch shift. videoCodec/crf honored.
await changeSpeed(source, './fast.mp4', { speed: 2.0 });
await changeSpeed(source, './tape.mp4', { speed: 0.75, maintainPitch: false, videoCodec: 'libx265', crf: 20 });

// Sprite sheet (YouTube-style scrubbing). Defaults to 16:9 cells; for vertical
// (9:16) sources pass aspectRatio (or an explicit height) so frames fill the
// cell instead of being letterboxed with black bars.
await generateSprites(source, './sprites', { interval: 1, width: 90, aspectRatio: 9 / 16 });

// Compress with hardware acceleration
await compressVideo(source, './out.mp4', { crf: 28, preset: 'fast' });

// Watermark
await addWatermark(source, './branded.mp4', {
  type: 'image',
  imagePath: './logo.png',
  position: 'bottom-right',
  opacity: 0.8,
});

// Concat
await concatenateVideos([source1, source2], './joined.mp4', { method: 'auto' });

// Audio
await extractAudio(source, './audio.mp3', { format: 'mp3' });
```

All generators accept `timeout` and `onProgress` in their config:

```typescript
await trimVideo(source, './out.mp4', {
  start: 10, end: 30,
  timeout: 30_000,
  onProgress: ({ percentage }) => console.log(`${percentage.toFixed(0)}%`),
});
```

## Cleanup

Processor doesn't auto-cleanup output directories:

```typescript
import { rm } from 'fs/promises';

try {
  const result = await processor.process({ inputPath, outputDir });
  await uploadToStorage(outputDir);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
```

## API Reference

### HLSProcessorConfig

```typescript
{
  variants: QualityVariant[];
  features?: {
    sprites?: boolean;      // YouTube-style timeline thumbnails
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

## TypeScript

```typescript
import type {
  HLSProcessorConfig,
  QualityVariant,
  VixelResult,
  VixelError,
  FFmpegError,
} from '@classytic/vixel';
```

## License

MIT © [Classytic](https://github.com/classytic/vixel)
