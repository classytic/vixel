/**
 * Shared FFmpeg spawn utility
 * ============================
 * Single place for all FFmpeg subprocess management:
 *   - SIGTERM → SIGKILL graceful timeout
 *   - AbortSignal cancellation
 *   - dry-run (build the command without executing)
 *   - time= progress parsing
 *   - command capture for debugging
 *   - stderr capture with last-500-char error context
 *
 * All generators should use this instead of their own spawn wrappers.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { AbortError, FFmpegError, ErrorCode } from '../errors.js';
import { DEFAULT_FFMPEG_TIMEOUT } from '../constants.js';

export interface SpawnFFmpegProgress {
  percentage: number;
  currentSec: number;
  totalSec: number;
}

/** Details of the exact command that ran (or would run, in dry-run mode). */
export interface FFmpegCommand {
  ffmpegPath: string;
  args: string[];
  /** Shell-style command string for logging / copy-paste debugging. */
  command: string;
}

export interface SpawnFFmpegOptions {
  /** Process timeout in ms. SIGTERM first, SIGKILL 5s later. Default: 10 min. */
  timeout?: number | undefined;
  /** Abort the in-flight process. Rejects with `AbortError`. */
  signal?: AbortSignal | undefined;
  /** When true, do NOT execute — resolve immediately after reporting the command. */
  dryRun?: boolean | undefined;
  /** Called once with the exact command before execution (or in dry-run). */
  onCommand?: ((cmd: FFmpegCommand) => void) | undefined;
  /** Called each time a new time= value is parsed from stderr. */
  onProgress?: ((progress: SpawnFFmpegProgress) => void) | undefined;
  /** Raw stderr hook — receives each chunk for custom parsing (rich progress). */
  onStderr?: ((chunk: string) => void) | undefined;
  /** Source duration in seconds — required for percentage calculation. */
  duration?: number | undefined;
}

/** Build the shell-style command string for an ffmpeg invocation. */
export function buildCommandString(ffmpegPath: string, args: string[]): string {
  const quoted = args.map((a) => (/\s/.test(a) ? `"${a}"` : a));
  return `${ffmpegPath} ${quoted.join(' ')}`;
}

/**
 * Subset of a generator config that maps onto spawn behaviour. Used by
 * `configToSpawnOptions` so every generator forwards the same fields.
 */
export interface SpawnControlConfig {
  timeout?: number | undefined;
  signal?: AbortSignal | undefined;
  dryRun?: boolean | undefined;
  onCommand?: ((cmd: FFmpegCommand) => void) | undefined;
  onProgress?: ((progress: SpawnFFmpegProgress) => void) | undefined;
}

/** Map a generator config (+ known duration) into SpawnFFmpegOptions. */
export function configToSpawnOptions(
  config: SpawnControlConfig,
  duration?: number | undefined,
): SpawnFFmpegOptions {
  return {
    timeout: config.timeout,
    signal: config.signal,
    dryRun: config.dryRun,
    onCommand: config.onCommand,
    onProgress: config.onProgress,
    duration,
  };
}

export function spawnFFmpeg(
  ffmpegPath: string,
  args: string[],
  options: SpawnFFmpegOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { timeout = DEFAULT_FFMPEG_TIMEOUT, signal, dryRun, onCommand, onProgress, onStderr, duration } = options;

    // Report the command for debugging / capture before doing anything.
    if (onCommand) {
      onCommand({ ffmpegPath, args, command: buildCommandString(ffmpegPath, args) });
    }

    // Dry-run: never spawn a process.
    if (dryRun) {
      resolve();
      return;
    }

    // Already-aborted fast path.
    if (signal?.aborted) {
      reject(new AbortError('FFmpeg aborted before start', { args }));
      return;
    }

    const proc: ChildProcess = spawn(ffmpegPath, args);
    let stderr = '';
    let lastPct = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const killGracefully = () => {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killGracefully();
      reject(new AbortError('FFmpeg aborted', { args }));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      killGracefully();
      reject(new FFmpegError(`FFmpeg timed out after ${timeout}ms`, { args }, ErrorCode.FFMPEG_TIMEOUT));
    }, timeout);

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (onStderr) onStderr(text);
      if (onProgress && duration && duration > 0) {
        // FFmpeg writes progress like: time=00:01:23.45
        const match = /time=(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
        if (match) {
          const secs =
            parseInt(match[1]!, 10) * 3600 +
            parseInt(match[2]!, 10) * 60 +
            parseFloat(match[3]!);
          const pct = Math.min(100, (secs / duration) * 100);
          if (pct > lastPct) {
            lastPct = pct;
            onProgress({ percentage: pct, currentSec: secs, totalSec: duration });
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(new FFmpegError(`FFmpeg failed (exit ${code})`, stderr.slice(-500), ErrorCode.FFMPEG_FAILED));
        return;
      }
      resolve();
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new FFmpegError(`FFmpeg spawn error: ${err.message}`, err, ErrorCode.FFMPEG_SPAWN_ERROR));
    });
  });
}

/**
 * Check the FFmpeg version from the system binary.
 * Returns { major, minor, patch, version } or null if the binary can't be found.
 * Logs a warning if major version < 6 since some flags we use require FFmpeg 6+.
 */
export async function checkFFmpegVersion(
  ffmpegPath = 'ffmpeg',
): Promise<{ major: number; minor: number; patch: number; version: string } | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-version']);
    // e.g. "ffmpeg version 7.1 Copyright..."  or  "ffmpeg version n6.0-..."
    const match = /ffmpeg version (?:n?|git-)?([\d]+)\.([\d]+)\.?([\d]*)/.exec(stdout);
    if (!match) return null;
    const major = parseInt(match[1]!, 10);
    const minor = parseInt(match[2]!, 10);
    const patch = match[3] ? parseInt(match[3], 10) : 0;
    return { major, minor, patch, version: `${major}.${minor}.${patch}` };
  } catch {
    return null;
  }
}
