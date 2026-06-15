/**
 * Editor-proxy profile.
 * =====================
 * Encodes a source into a **browser-editor-optimized H.264 MP4 proxy**: it seeks
 * fast in a `<video>` timeline, starts streaming instantly, plays everywhere,
 * and can't OOM a worker on a 4K input. This is the "make vixel an editor
 * engine" primitive — a single named recipe instead of hand-assembled flags.
 *
 * Flag choices (grounded in current ffmpeg guidance + a proven production profile):
 *  - `-movflags +faststart` — moov atom to the front → instant progressive play
 *    + HTTP-range seeking.
 *  - Regular GOP (`-g`/`-keyint_min` = fps × interval) + `-sc_threshold 0` +
 *    `-force_key_frames expr:gte(t,n_forced*N)` → deterministic keyframes the
 *    player can snap scrubs to. `allIntra` makes every frame a keyframe for
 *    truly frame-accurate stepping (larger files). NOTE: on a VFR source `-g`
 *    counts frames while `force_key_frames` uses time, so the GOP is slightly
 *    irregular — acceptable for a proxy.
 *  - `-profile:v high` + `-pix_fmt yuv420p` + a **level derived from the output
 *    size/fps** (4.1, auto-bumped to 4.2 for 1080p60) → universal browser/iOS
 *    playback without silently violating the pinned level. (10-bit/HDR sources
 *    are converted to 8-bit; tone-mapping is a future enhancement — a proxy must
 *    stay 8-bit for `<video>`.)
 *  - `-crf` + `-preset veryfast` → proxies favor throughput. `tune` is OPT-IN:
 *    we do NOT default to `fastdecode` because it forces CAVLC (disables CABAC),
 *    undermining `-profile high` and bloating the file ~10-15%; modern devices
 *    decode CABAC trivially. Pass `tune: 'fastdecode'` only for genuinely weak
 *    decode clients.
 *  - 1080p downscale cap that never upscales ({@link downscaleFilter}).
 *
 * For frame-accurate EDITOR scrubbing this progressive MP4 (+ a sprite strip,
 * separate op) beats segmented HLS; reserve HLS for end-viewer adaptive delivery.
 */

import {
  spawnFFmpeg,
  configToSpawnOptions,
  type SpawnFFmpegProgress,
} from '../core/ffmpeg-spawn.js';
import { probeVideo } from '../core/probe.js';
import {
  downscaleFilter,
  fitWithin,
  MAX_PROXY_WIDTH,
  MAX_PROXY_HEIGHT,
  type Dimensions,
} from '../core/dimensions.js';
import { ConfigError } from '../errors.js';
import type { BaseGeneratorConfig, VideoSource } from '../types/generators.js';

export interface EditorProxyConfig extends BaseGeneratorConfig {
  /** Resolution cap box. Default 1920×1080. Sources within it are untouched. */
  maxWidth?: number;
  maxHeight?: number;
  /** x264 CRF (lower = better/larger). Default 24 (proxy-appropriate). */
  crf?: number;
  /** x264 speed preset. Default `veryfast` (proxies favor throughput). */
  preset?: string;
  /** x264 `-tune` (opt-in; e.g. `'fastdecode'`). Omitted by default — see notes. */
  tune?: string;
  /** Keyframe interval in seconds for scrub snap-points. Default 1. */
  keyframeIntervalSec?: number;
  /** Every frame a keyframe (frame-accurate stepping; larger files). */
  allIntra?: boolean;
  /** AAC audio bitrate. Default `128k`. */
  audioBitrate?: string;
  /** Progress callback (0–100). */
  onProgress?: (p: SpawnFFmpegProgress) => void;
}

export interface EditorProxyResult {
  /** The encoded proxy file. */
  outputPath: string;
  /** Probed output width (authoritative). */
  width: number;
  /** Probed output height (authoritative). */
  height: number;
  /** Probed output duration (seconds). */
  durationSec: number;
  /** Whether the proxy carries audio. */
  hasAudio: boolean;
  /** GOP size (frames) used; `1` for all-intra. */
  gop: number;
  /** H.264 level pinned in the output (`'4.1'` or `'4.2'`). */
  level: string;
}

const DEFAULT_CRF = 24;
const DEFAULT_PRESET = 'veryfast';
const DEFAULT_KEYFRAME_INTERVAL_SEC = 1;
const DEFAULT_AUDIO_BITRATE = '128k';
const FALLBACK_FPS = 30;
// H.264 Level 4.1 macroblocks/sec ceiling (≈ 1080p30). Above it → 4.2 (1080p60).
const LEVEL_4_1_MAX_MBPS = 245760;

function effectiveFps(source: VideoSource): number {
  return source.fps && source.fps > 0 ? source.fps : FALLBACK_FPS;
}

/** Resolution cap box from config; rejects non-positive dimensions (L4). */
function boxFor(config: EditorProxyConfig): Dimensions {
  const width = config.maxWidth ?? MAX_PROXY_WIDTH;
  const height = config.maxHeight ?? MAX_PROXY_HEIGHT;
  if (width <= 0 || height <= 0) {
    throw new ConfigError('maxWidth/maxHeight must be positive', {
      context: { maxWidth: width, maxHeight: height },
    });
  }
  return { width, height };
}

/** GOP (keyframe spacing in frames) the proxy will use. Single source of truth. */
function computeGop(source: VideoSource, config: EditorProxyConfig): number {
  if (config.allIntra) return 1;
  const interval = config.keyframeIntervalSec ?? DEFAULT_KEYFRAME_INTERVAL_SEC;
  return Math.max(1, Math.round(effectiveFps(source) * interval));
}

/** Pick the lowest H.264 level that legally carries the output size/fps. */
function levelFor(dims: Dimensions, fps: number): '4.1' | '4.2' {
  if (dims.width <= 0 || dims.height <= 0) return '4.1';
  const mbPerSec = Math.ceil(dims.width / 16) * Math.ceil(dims.height / 16) * Math.max(1, fps);
  return mbPerSec > LEVEL_4_1_MAX_MBPS ? '4.2' : '4.1';
}

/**
 * Build the exact ffmpeg argument vector for the editor proxy. Pure — no I/O —
 * so it can be golden-command snapshot-tested without ffmpeg.
 */
export function buildEditorProxyArgs(
  source: VideoSource,
  outputPath: string,
  config: EditorProxyConfig = {},
): string[] {
  const box = boxFor(config);
  const gop = computeGop(source, config);
  const fps = effectiveFps(source);
  const outDims = fitWithin({ width: source.width ?? 0, height: source.height ?? 0 }, box);
  const level = levelFor(outDims, fps);
  const intervalSec = config.keyframeIntervalSec ?? DEFAULT_KEYFRAME_INTERVAL_SEC;

  const args: string[] = [
    '-i', source.inputPath,
    '-vf', downscaleFilter(box),
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level:v', level,
    '-preset', config.preset ?? DEFAULT_PRESET,
  ];
  if (config.tune) args.push('-tune', config.tune); // opt-in (no fastdecode default)
  args.push(
    '-crf', String(config.crf ?? DEFAULT_CRF),
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
  );
  // Deterministic wall-clock keyframes (skip for all-intra — every frame is one).
  if (!config.allIntra) {
    args.push('-force_key_frames', `expr:gte(t,n_forced*${intervalSec})`);
  }
  args.push(
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', config.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  );
  return args;
}

/**
 * Encode `source` to an editor proxy at `outputPath`, then probe the result for
 * authoritative dimensions/duration. In `dryRun` the command is reported via
 * `onCommand` and the result is estimated from the source (no probe).
 */
export async function editorProxy(
  source: VideoSource,
  outputPath: string,
  config: EditorProxyConfig = {},
): Promise<EditorProxyResult> {
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const args = buildEditorProxyArgs(source, outputPath, config);
  const gop = computeGop(source, config);
  const box = boxFor(config);
  const outDims = fitWithin({ width: source.width ?? 0, height: source.height ?? 0 }, box);
  const level = levelFor(outDims, effectiveFps(source));

  await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));

  if (config.dryRun) {
    // A Source carries hasAudio; a bare VideoSource doesn't — estimate honestly.
    const srcHasAudio = (source as Partial<{ hasAudio: boolean }>).hasAudio ?? false;
    return {
      outputPath,
      width: outDims.width,
      height: outDims.height,
      durationSec: source.duration,
      hasAudio: srcHasAudio,
      gop,
      level,
    };
  }

  const meta = await probeVideo(outputPath, config.ffprobePath);
  return {
    outputPath,
    width: meta.width,
    height: meta.height,
    durationSec: meta.duration,
    hasAudio: meta.hasAudio,
    gop,
    level,
  };
}
