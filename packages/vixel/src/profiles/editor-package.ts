/**
 * Editor-package profile.
 * ======================
 * The full set a video editor timeline needs for one clip, in one call:
 *   1. an editor proxy MP4 ({@link editorProxy}),
 *   2. a poster frame (midpoint by default), and
 *   3. a scrubbing sprite sheet + WebVTT cue map.
 *
 * It is pure composition over existing primitives — no duplicated ffmpeg. The
 * poster and sprite are derived from the ENCODED PROXY, not the original
 * source: the proxy is already downscaled (≤1080p), so extracting from it is
 * cheaper than re-decoding a 4K master and guarantees the thumbnails match the
 * exact frames the editor will display.
 *
 * Notes / contract:
 *  - **`poster.atSec` is validated against the PROXY duration**, not the source
 *    (the proxy is the source of truth here). A value computed from the original
 *    master's duration could exceed a slightly-shorter proxy and throw.
 *  - **Partial outputs on failure:** if the proxy succeeds but a later step
 *    fails, the proxy (and possibly the poster) remain on disk. The caller owns
 *    `outputDir` and its cleanup — deliberately, so an expensive proxy isn't
 *    discarded because a cheap thumbnail step hiccuped.
 *  - **`dryRun`:** no files are written and `outputDir` is not created; each
 *    sub-step reports its command via `onCommand`. The poster/sprite commands
 *    reference the (not-yet-created) proxy path, and their estimated dimensions
 *    require the source to carry `width`/`height` (a probed `Source` always does).
 *
 * @example
 * ```ts
 * const src = await Source.fromFile('master.mov');
 * const pkg = await editorPackage(src, './out');
 * pkg.proxy.outputPath;     // ./out/proxy.mp4
 * pkg.poster.outputPath;    // ./out/poster.jpg
 * pkg.sprite.imagePath;     // ./out/sprites.jpg
 * pkg.sprite.vttPath;       // ./out/sprites.vtt
 * ```
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { editorProxy, type EditorProxyConfig, type EditorProxyResult } from './editor-proxy.js';
import { extractFrameAt } from '../generators/frame/generator.js';
import { generateSprites } from '../generators/sprites/generator.js';
import type { FrameResult } from '../generators/frame/types.js';
import type {
  BaseGeneratorConfig,
  SpriteConfig,
  SpriteResult,
  VideoSource,
} from '../types/generators.js';

/** Default ceiling on sprite cells per sheet (11×11 best-practice). */
const DEFAULT_MAX_SPRITE_CELLS = 121;

export interface EditorPackageConfig extends BaseGeneratorConfig {
  /** Proxy encode options (resolution cap, crf, keyframes, …). */
  proxy?: EditorProxyConfig;
  /** Poster options. Defaults to a JPEG at the clip midpoint. */
  poster?: { atSec?: number; width?: number; quality?: number };
  /** Sprite options. Interval auto-derived to fit one sheet when omitted. */
  sprite?: SpriteConfig;
  /** Cell-count ceiling used to auto-derive the sprite interval. Default 121. */
  maxSpriteCells?: number;
}

export interface EditorPackageResult {
  /** The encoded proxy (full result: dims, duration, gop, level). */
  proxy: EditorProxyResult;
  /** The poster frame (full result: path, timestamp, format). */
  poster: FrameResult;
  /** The sprite sheet + WebVTT (full result: paths, grid, thumbnail size). */
  sprite: SpriteResult;
}

/** Default poster timestamp: the clip midpoint (pure; testable). */
export function defaultPosterSec(durationSec: number): number {
  return durationSec > 0 ? durationSec / 2 : 0;
}

/**
 * Default sprite interval (seconds): the smallest whole-second gap that keeps
 * the whole clip within one `maxCells` sheet. Pure; testable.
 */
export function defaultSpriteIntervalSec(
  durationSec: number,
  maxCells = DEFAULT_MAX_SPRITE_CELLS,
): number {
  if (durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / Math.max(1, maxCells)));
}

export async function editorPackage(
  source: VideoSource,
  outputDir: string,
  config: EditorPackageConfig = {},
): Promise<EditorPackageResult> {
  // Don't touch disk in dry-run (pure command preview).
  if (!config.dryRun) await mkdir(outputDir, { recursive: true });

  // Shared control fields flow to every sub-step so cancellation / dry-run /
  // custom binaries behave consistently across the package.
  const base: BaseGeneratorConfig = {
    ...(config.ffmpegPath !== undefined ? { ffmpegPath: config.ffmpegPath } : {}),
    ...(config.ffprobePath !== undefined ? { ffprobePath: config.ffprobePath } : {}),
    ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
    ...(config.signal !== undefined ? { signal: config.signal } : {}),
    ...(config.dryRun !== undefined ? { dryRun: config.dryRun } : {}),
    ...(config.onCommand !== undefined ? { onCommand: config.onCommand } : {}),
  };

  // 1. Proxy (the long step).
  const proxyPath = join(outputDir, 'proxy.mp4');
  const proxy = await editorProxy(source, proxyPath, { ...base, ...config.proxy });

  // The proxy is now the source for the thumbnails — already capped, so cheap.
  const proxySource: VideoSource = {
    inputPath: proxy.outputPath,
    duration: proxy.durationSec,
    width: proxy.width,
    height: proxy.height,
  };
  const aspectRatio = proxy.height > 0 ? proxy.width / proxy.height : 16 / 9;

  // 2 + 3. Poster + sprite, in parallel (both read the small proxy; the proxy
  // file handle is closed before this point — editorProxy awaits spawn + probe).
  const posterPath = join(outputDir, 'poster.jpg');
  const posterSec = config.poster?.atSec ?? defaultPosterSec(proxy.durationSec);
  const interval =
    config.sprite?.interval ?? defaultSpriteIntervalSec(proxy.durationSec, config.maxSpriteCells);

  const [poster, sprite] = await Promise.all([
    extractFrameAt(proxySource, posterSec, posterPath, {
      ...base,
      format: 'jpg',
      quality: config.poster?.quality ?? 80,
      ...(config.poster?.width !== undefined ? { width: config.poster.width } : {}),
    }),
    generateSprites(proxySource, outputDir, {
      ...base,
      interval,
      aspectRatio, // match the proxy aspect → no letterboxed cells on vertical clips
      ...config.sprite,
    }),
  ]);

  return { proxy, poster, sprite };
}
