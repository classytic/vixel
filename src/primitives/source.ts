/**
 * Source — the input primitive.
 * =============================
 * A `Source` names a piece of input media and carries its **immutable, probed
 * metadata**. It is the single thing every operation consumes.
 *
 * Why a class (not just the `{ inputPath, duration, … }` bag)?
 *  - **Construct without hand-probing.** `await Source.fromFile(path)` probes
 *    once and freezes the result — callers stop juggling ffprobe themselves.
 *  - **Immutable.** Metadata is frozen at construction; a Source can be shared
 *    across a pipeline without defensive copying.
 *  - **Drop-in.** A `Source` structurally satisfies the legacy {@link VideoSource}
 *    shape (`inputPath`, `duration`, `width`, `height`, `fps`), so it passes to
 *    every existing operation unchanged.
 *  - **AI/agent-friendly.** {@link Source.toJSON} yields a stable, serializable
 *    description (kind + path + full metadata) for caching and tool I/O.
 *
 * Remote ingest (`Source.fromUrl`) — download + SSRF/byte-cap validation — lands
 * in the dedicated `ingest/` slice and will return a `Source` of kind `remote`.
 *
 * @example
 * ```ts
 * const src = await Source.fromFile('clip.mp4');
 * src.duration;     // 12.4  (probed, immutable)
 * src.aspectRatio;  // 1.777…
 * await trim(src, 'out.mp4', { start: 0, end: 5 }); // drop-in for operations
 * ```
 */

import { access, unlink } from 'node:fs/promises';
import { probeVideo, type VideoMetadata } from '../core/probe.js';
import { fetchToFile, type FetchToFileOptions } from '../ingest/fetch-remote.js';
import { ConfigError } from '../errors.js';
import type { VideoSource } from '../types/generators.js';

/** Where a Source's bytes come from. */
export type SourceKind = 'file' | 'buffer' | 'remote';

/** Construction options for a {@link Source}. */
export interface SourceInit {
  /** Override the ffprobe binary path (defaults to `ffprobe` on PATH). */
  readonly ffprobePath?: string;
}

/** Stable, serializable description of a {@link Source}. */
export interface SourceJSON {
  readonly kind: SourceKind;
  readonly inputPath: string;
  readonly metadata: Readonly<VideoMetadata>;
}

export class Source implements VideoSource {
  /** Origin of the media. */
  readonly kind: SourceKind;
  /** Local filesystem path the operations read from. */
  readonly inputPath: string;
  /** Frozen, fully-probed metadata. */
  readonly metadata: Readonly<VideoMetadata>;

  private constructor(kind: SourceKind, inputPath: string, metadata: VideoMetadata) {
    this.kind = kind;
    this.inputPath = inputPath;
    this.metadata = Object.freeze({ ...metadata });
  }

  // --- VideoSource compatibility: a Source IS a valid operation input ---------

  /** Duration in seconds. */
  get duration(): number {
    return this.metadata.duration;
  }
  /** Width in pixels. */
  get width(): number {
    return this.metadata.width;
  }
  /** Height in pixels. */
  get height(): number {
    return this.metadata.height;
  }
  /** Frames per second. */
  get fps(): number {
    return this.metadata.fps;
  }

  // --- richer, read-only views ------------------------------------------------

  /** Whether the source carries an audio stream. */
  get hasAudio(): boolean {
    return this.metadata.hasAudio;
  }
  /** Video codec name (e.g. `h264`). */
  get codec(): string {
    return this.metadata.codec;
  }
  /** width ÷ height, or `0` when the dimensions are unknown. */
  get aspectRatio(): number {
    return this.metadata.height > 0 ? this.metadata.width / this.metadata.height : 0;
  }

  // --- constructors -----------------------------------------------------------

  /**
   * Probe a local file and capture its immutable metadata.
   *
   * @throws ConfigError `INVALID_INPUT` when the path doesn't exist/readable.
   * @throws ProbeError when ffprobe can't decode the file.
   */
  static async fromFile(path: string, init: SourceInit = {}): Promise<Source> {
    try {
      await access(path);
    } catch {
      throw ConfigError.notFound(path);
    }
    const metadata = await probeVideo(path, init.ffprobePath);
    return new Source('file', path, metadata);
  }

  /**
   * Ingest a remote http(s) URL — SSRF-guarded, byte-capped, timeout-bounded —
   * to a temp file, then probe it. The resulting Source is of kind `remote`;
   * its `inputPath` is a temp file the **caller owns** (delete when done).
   *
   * @throws ConfigError on unsafe/oversized/unreachable URLs (see {@link fetchToFile}).
   * @throws ProbeError when the downloaded file isn't decodable media.
   */
  static async fromUrl(url: string, init: SourceInit & FetchToFileOptions = {}): Promise<Source> {
    const { path } = await fetchToFile(url, init);
    try {
      const metadata = await probeVideo(path, init.ffprobePath);
      return new Source('remote', path, metadata);
    } catch (err) {
      // The download succeeded but isn't decodable — clean up the temp file the
      // caller will never receive a handle to (otherwise it leaks on disk).
      await unlink(path).catch(() => {});
      throw err;
    }
  }

  /**
   * Wrap a file whose metadata is already known — skips the probe. Use when a
   * prior step already probed the file (avoids a redundant ffprobe), or in tests.
   */
  static fromMetadata(inputPath: string, metadata: VideoMetadata): Source {
    return new Source('file', inputPath, metadata);
  }

  /** Stable, serializable form for caching, logs, and agent tool I/O. */
  toJSON(): SourceJSON {
    // Shallow-copy the metadata so a consumer can't reach the frozen original.
    return { kind: this.kind, inputPath: this.inputPath, metadata: { ...this.metadata } };
  }
}
