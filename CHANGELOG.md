# Changelog

## [0.2.0] — 2026-05-30

Consolidates all development since 0.1.0 — infrastructure, 14 new generators,
pipeline, typed errors, concurrency, and faceless-video / post-production
primitives. No breaking changes to the existing 11 generators.

### Added — infrastructure

- **`ffmpeg-spawn`** — shared subprocess manager (SIGTERM → SIGKILL, timeout,
  progress from `time=` stderr, last-500-chars stderr on failure)
- **`TempFileManager`** — guaranteed temp cleanup even on failure
- **Concurrency helpers** — `createLimiter`, `mapWithConcurrency`, `mapSettled`
- **Typed error system** — `VixelError`, `FFmpegError`, `HLSProcessorError`,
  `ErrorCode` constants, `isVixelError` / `isFFmpegError` guards, `tryCatch`
- **AbortSignal support** across every generator, pipeline, and spawn
- **Dry-run** + **`onCommand`** hook on every generator and the pipeline
- **`onProgress`** callback on every generator
- **Configurable `timeout`** on every generator
- HLS variant encoding is now **parallel** with a concurrency cap
- FFmpeg version check at startup; hardware acceleration auto-detect in HLS encoder

### Added — fluent pipeline

- `pipeline()` / `VideoPipeline` — chain generators, auto-manage temp files,
  `.run(out)` or `.toCommands(out)` (plan without executing)

### Added — 14 new generators

| Generator | What it does |
|---|---|
| `mixAudio()` | Voiceover + music ducking via `sidechaincompress` |
| `burnCaptions()` | Burn `.srt`/`.ass` subtitles or styled `drawtext` |
| `concatWithTransitions()` | `xfade` / `acrossfade` transitions with offset maths |
| `reframe()` | Re-aspect for vertical/square/etc. (blur-pad, crop-fill, solid-pad) |
| `fade()` | Video + audio fade in/out |
| `extractFrameAt()` | Single-frame export at exact timestamp |
| `kenBurns()` | Still image → moving clip via `zoompan` |
| `slideshow()` | Images → video with Ken Burns + transitions |
| `adjustColor()` | Brightness/contrast/saturation/gamma + sharpen |
| `applyLut()` | `.cube` 3D LUT via `lut3d` |
| `normalizeLoudness()` | EBU R128 two-pass loudnorm |
| `glow()` | Soft luminance bloom (blur-screen blend) |
| `parallax3d()` | Depth-map 2.5D parallax via `displace` |
| `audioMix()` | General-purpose multi-track audio mixer |

### Fixed — existing generators

- `changeSpeed`: `videoCodec`, `crf`, `maintainPitch` config was silently
  ignored — now applied. `maintainPitch: true` (default) keeps pitch via
  `atempo`; `false` shifts pitch via `asetrate`.
- `generateSprites`: `aspectRatio` + `height` now respected — previously all
  cells were forced 16:9.
- `probeVideo` reports `audioSampleRate`.
- `exactOptionalPropertyTypes` violations fixed across sprites, gif, crop-resize,
  concat, audio generators.

### Added — sprite cell aspect control
- **`generateSprites`** now accepts `aspectRatio` (width/height) and `height` in
  `SpriteConfig`. Previously every cell was forced to 16:9, so 9:16 vertical
  sources were letterboxed into a tiny centered strip with black bars. Pass
  `aspectRatio: 9/16` (or an explicit `height`) and frames fill the cell.
  - Precedence: `height` → `aspectRatio` → 16:9 default (unchanged when neither set).

### Fixed — `changeSpeed` config was silently ignored
- `videoCodec` and `crf` are now actually applied to the output (were hardcoded
  to `libx264` / `crf 23`).
- `maintainPitch` is now wired up: `true` (the new default) keeps pitch via
  `atempo`; `false` shifts pitch with speed via `asetrate` + `aresample` using the
  probed audio sample rate. The old default of `false` was misleading — the
  implementation always preserved pitch regardless.
- `probeVideo` now reports `audioSampleRate` (feeds the pitch-shift path).

### Tests
- 11 ffmpeg-free regression tests (dry-run + `onCommand`) covering sprite cell
  geometry and `changeSpeed` codec/crf/pitch wiring.

---

## [0.5.1] — 2026-05-29

### Added — "Living image" primitives
- **`glow()`** — soft luminance bloom (blur a copy, screen-blend back). Optional
  `highlightsOnly` masks bright pixels first. The dreamy Ghibli look. Pipeline: `.glow()`
- **`parallax3d()`** — depth-driven 2.5D "3D photo" move via `displace`: a still
  image + a grayscale depth map → a fake camera move where near pixels travel
  more than far ones. Modes: `sway` / `pan` / `orbit`.
  - *Honest limit:* ffmpeg `displace` has no occlusion handling, so large moves
    smear at depth edges — keep `amplitude` modest. The depth map itself must come
    from a depth model (Depth Anything / MiDaS) — that estimation is the host's job.

New builders: `buildGlowFilter`, `buildParallaxFilter`.

> These are the ffmpeg-native approximations of the "living image" look. Truly
> *generative* motion (water flowing, a character moving) is image-to-video and
> remains a model/provider's job, not vixel's.

### Tests
- 7 unit tests (builders + dry-run) + 3 e2e (glow, highlights glow, parallax) on real ffmpeg

---

## [0.5.0] — 2026-05-29

### Added — Faceless-video / motion primitives
Mechanical primitives for image-driven content (the faceless-YouTube staples).
All pipeline-aware where applicable, with dry-run / abort / typed errors and
pure unit-tested filter builders.

- **`kenBurns()`** — turn a still image into a moving clip via `zoompan`
  (zoom in/out, pan left/right/up/down). Pre-scales for jitter-free motion.
- **`slideshow()`** — assemble many images into a video: per-slide duration,
  optional Ken Burns (auto-alternating direction), and transitions. Composes
  `kenBurns` + the transition/concat primitives with managed temp files.
- **`adjustColor()`** — parametric grade: brightness / contrast / saturation /
  gamma (`eq`) + `sharpen` (`unsharp`). Emits only the knobs you change.
  Pipeline: `.adjust()`
- **`applyLut()`** — apply a `.cube` 3D LUT (`lut3d`, Windows-safe path).
  Pipeline: `.lut()`
- **`normalizeLoudness()`** — EBU R128 `loudnorm` to a target LUFS, **two-pass**
  by default (measure → apply, linear) for accuracy. Platform presets
  (`youtube`/`spotify`/`tiktok` = -14, `broadcast` = -23).

New pure builders: `buildKenBurnsFilter`, `buildColorAdjustFilter`,
`buildLut3dFilter`, `buildLoudnormFilter`, `parseLoudnormJson`.

### Scope note
vixel ships **mechanical, parametric ffmpeg primitives** (+ the
`applyFFmpegFilter` escape hatch). Content acquisition (TTS, stock, AI gen,
caption *timing*), creative/taste decisions (which LUT, how much grain), and
workflow orchestration beyond the pipeline remain the host/agent's job.

### Tests
- 18 new ffmpeg-free unit tests (builders + dry-run command shape)
- 4 new e2e tests proving Ken Burns / slideshow / color / loudnorm run on real ffmpeg

### Deferred
- Standardizing `duration` auto-probe across all generators into one helper
  (current behavior works; some probe-on-missing, some require it).

---

## [0.4.0] — 2026-05-29

### Added — Post-production primitives
Six new generators aimed at AI-video and post-production pipelines (the gaps an
agentic video tool hits first). All are pipeline-chainable and support
dry-run / AbortSignal / typed errors / progress like the rest of the library.

- **`mixAudio()`** — layer a voiceover and/or background music onto a video with
  automatic **ducking** (music drops under speech via `sidechaincompress`). Video
  stream is copied (no re-encode). Pipeline: `.mixAudio()`
- **`burnCaptions()`** — burn an `.srt`/`.ass` subtitle file (`subtitles` filter,
  with Windows-safe path escaping + `force_style`) or a styled `drawtext` overlay.
  Audio copied. Pipeline: `.captions()`
- **`concatWithTransitions()`** — join clips with crossfade/dissolve/wipe
  transitions (`xfade` + `acrossfade`), with correct offset maths and optional
  geometry normalization so mismatched clips blend cleanly.
- **`reframe()`** — re-aspect for vertical/square/etc. via blurred-background pad,
  crop-to-fill, or solid pad. 1080-class presets (`9:16`, `1:1`, `16:9`, `4:5`,
  `4:3`). Pipeline: `.reframe()`
- **`fade()`** — video + audio fade in/out (black or white). Pipeline: `.fade()`
- **`extractFrameAt()`** — single-frame export at an exact timestamp (fast `-ss`
  seek), png/jpg/webp. A focused primitive for end-frame continuity / storyboards.

Every filtergraph is built by a **pure, exported, unit-tested builder**
(`buildAudioMixFilter`, `buildSubtitlesFilter`, `buildDrawtextFilter`,
`buildXfadeGraph`, `buildReframeFilter`, `buildFadeFilters`).

### Tests
- 25 new ffmpeg-free unit tests (filter builders + dry-run command shape)
- New e2e suite proving all six filtergraphs execute against real ffmpeg

---

## [0.3.0] — 2026-05-29

### Added — Composition
- **Fluent `pipeline()` / `VideoPipeline`** — chain `trim` → `watermark` → `crop` → `compress` → `speed` → `convert` → `filter` and `.run(out)`. Intermediate temp files are created and cleaned up automatically; no manual file juggling
- **`.toCommands(out)`** — plan every ffmpeg command for a pipeline without executing (debugging / cost estimation / approval)

### Added — Control & observability
- **`AbortSignal` support** across `spawnFFmpeg`, every generator, and the pipeline — cancel in-flight renders (rejects with `AbortError`)
- **Dry-run** (`dryRun: true`) on every generator + pipeline — build the command, skip execution
- **Command capture** (`onCommand`) — receive the exact `{ ffmpegPath, args, command }` before execution, on every operation
- **`onStderr`** hook on `spawnFFmpeg` — custom stderr parsing (used by the filter for rich fps/bitrate/speed progress while sharing one process manager)

### Added — Infrastructure
- **`TempFileManager`** + `TempFileManager.scoped()` + `removeQuietly()` + `outputSize()` — guaranteed temp cleanup even on failure
- **Concurrency helpers** — `createLimiter`, `mapWithConcurrency`, `mapSettled` (dependency-free)
- **`AbortError`** + `isAbortError`, `ErrorCode.ABORTED`, `ErrorCode.PROBE_FAILED`
- **`configToSpawnOptions`** + `buildCommandString` exported for advanced callers

### Changed
- **HLS variant encoding is now parallel** with a concurrency cap (`EncodeOptions.concurrency`, default 2) — faster multi-variant ladders without risking OOM
- **`applyFFmpegFilter` now routes through `spawnFFmpeg`** — gains timeout, abort, dry-run, command capture, and consistent `FFmpegError`s (previously a separate spawn loop with raw `Error`s)
- **All ffprobe failures wrapped in `FFmpegError`** (`probe.ts`) with `PROBE_FAILED`
- **Chapter validation throws `VixelError`** instead of raw `Error`
- Dry-run never invokes ffprobe — `trim`/`speed` skip probing when `dryRun` is set

### Tests
- New suites: `errors`, `concurrency`, `temp-manager`, `ffmpeg-spawn`, `pipeline` — 34 ffmpeg-free unit tests (run on any OS, no binary required)

---

## [0.2.1] — 2026-05-29

### Added
- **Typed error system** (`src/errors.ts`) — `VixelError` base class, `FFmpegError`, `HLSProcessorError`, `ErrorCode` constants, `isVixelError` / `isFFmpegError` type guards, `tryCatch<T>` / `tryCatchSync<T>` Go-style result wrappers
- **Specific FFmpeg error codes** — `FFMPEG_TIMEOUT`, `FFMPEG_SPAWN_ERROR`, `FFMPEG_FAILED` replace the single generic code so callers can branch without parsing message strings

### Changed
- Error classes moved from `src/types/index.ts` to canonical `src/errors.ts`; re-exported from `src/types/index.ts` for backward compatibility
- `HLSProcessorError.details` marked `@deprecated` — use `.cause` (standard `Error` chain)

---

## [0.2.0] — 2026-05-28

### Added
- **Shared FFmpeg spawn utility** (`src/core/ffmpeg-spawn.ts`) — single subprocess manager for all generators: SIGTERM → 5 s → SIGKILL graceful shutdown, `time=` progress parsing, stderr capture (last 500 chars on failure)
- **Progress events** on every generator — `onProgress?: (p: { percentage, currentSec, totalSec }) => void` in all configs
- **Configurable timeout** on every generator — `timeout?: number` in all `BaseGeneratorConfig` subtypes
- **FFmpeg version check** at processor startup — warns if major version < 6
- **Hardware acceleration detection** in HLS encoder — runtime probe of `h264_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_videotoolbox`; auto-fallback to libx264
- **`-threads 0`** in HLS re-encode path — FFmpeg auto-allocates CPU cores
- `GeneratorProgressCallback` type alias exported from `src/types/generators.ts`
- `onProgress` added to `ConvertConfig` and `SpeedConfig`

### Fixed
- `exactOptionalPropertyTypes` violations across `sprites`, `gif`, `crop-resize`, `concat`, `audio` generators — all optional fields now typed `T | undefined`
- Missing `spawn` import in `thumbnails/generator.ts` (ffprobe helper uses raw `spawn`, not `spawnFFmpeg`)
- Missing `FFmpegError` import in `compression/generator.ts`

---

## [0.1.0] — initial release

- HLS processor with codec copy optimization (10-20x faster on compatible sources)
- 11 generators: GIF (two-pass + WebP), thumbnails, sprites + WebVTT, watermark (image + text), crop/resize, compression, trim, audio (extract / replace / volume / normalize), concat, speed, format conversion
- `applyFFmpegFilter()` building block for AI-generated filter strings
- `selectVariant()` / `selectQualityLadder()` quality presets
- `probeVideo()` via ffprobe
- GIF size optimizer with per-platform limits (Twitter, Discord, Slack, Tenor)
- Chapter generator (manual, auto scene-detect, transcript, smart modes)
- `checkFFmpegVersion()` utility
