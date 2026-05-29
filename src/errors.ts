/**
 * Vixel Error System
 * ===================
 * Single canonical location for all error types, codes, guards, and helpers.
 *
 * Usage:
 *   import { VixelError, FFmpegError, tryCatch, ErrorCode } from '@classytic/vixel';
 *
 *   const [result, err] = await tryCatch(() => generateGif(...));
 *   if (err) {
 *     if (err.code === ErrorCode.FFMPEG_TIMEOUT) { ... }
 *   }
 */

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCode = {
  // FFmpeg process errors
  FFMPEG_ERROR: 'FFMPEG_ERROR',
  FFMPEG_NOT_FOUND: 'FFMPEG_NOT_FOUND',
  FFMPEG_TIMEOUT: 'FFMPEG_TIMEOUT',
  FFMPEG_SPAWN_ERROR: 'FFMPEG_SPAWN_ERROR',
  FFMPEG_FAILED: 'FFMPEG_FAILED',
  // Configuration errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  INVALID_INPUT: 'INVALID_INPUT',
  // Probe errors
  PROBE_FAILED: 'PROBE_FAILED',
  // Runtime errors
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  OUTPUT_ERROR: 'OUTPUT_ERROR',
  ABORTED: 'ABORTED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// Base Error Class
// =============================================================================

export class VixelError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string = ErrorCode.UNKNOWN, cause?: unknown) {
    super(message);
    this.name = 'VixelError';
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

// =============================================================================
// Specialised Error Classes
// =============================================================================

export class FFmpegError extends VixelError {
  constructor(message: string, cause?: unknown, code: string = ErrorCode.FFMPEG_ERROR) {
    super(message, code, cause);
    this.name = 'FFmpegError';
  }
}

export class HLSProcessorError extends VixelError {
  constructor(message: string, code: string = ErrorCode.PROCESSING_FAILED, cause?: unknown) {
    super(message, code, cause);
    this.name = 'HLSProcessorError';
  }

  /** @deprecated Use `.cause` */
  get details(): unknown {
    return this.cause;
  }
}

/** Thrown when an operation is cancelled via an `AbortSignal`. */
export class AbortError extends VixelError {
  constructor(message = 'Operation aborted', cause?: unknown) {
    super(message, ErrorCode.ABORTED, cause);
    this.name = 'AbortError';
  }
}

// =============================================================================
// Type Guards
// =============================================================================

export function isVixelError(err: unknown): err is VixelError {
  return err instanceof VixelError;
}

export function isFFmpegError(err: unknown): err is FFmpegError {
  return err instanceof FFmpegError;
}

export function isHLSProcessorError(err: unknown): err is HLSProcessorError {
  return err instanceof HLSProcessorError;
}

export function isAbortError(err: unknown): err is AbortError {
  return err instanceof AbortError;
}

// =============================================================================
// tryCatch — Go-style async result tuple
// =============================================================================

export type VixelResult<T> = [value: T, error: null] | [value: null, error: VixelError];

/**
 * Wraps an async function and returns `[value, null]` on success or
 * `[null, VixelError]` on failure. Unknown errors are wrapped automatically.
 *
 * @example
 * const [gif, err] = await tryCatch(() => generateGif(source, range, dir, config));
 * if (err) {
 *   if (err.code === ErrorCode.FFMPEG_TIMEOUT) handleTimeout();
 *   else throw err;
 * }
 * console.log(gif.outputPath);
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<VixelResult<T>> {
  try {
    return [await fn(), null];
  } catch (err) {
    if (err instanceof VixelError) return [null, err];
    const message = err instanceof Error ? err.message : String(err);
    return [null, new VixelError(message, ErrorCode.UNKNOWN, err)];
  }
}

/**
 * Synchronous variant of `tryCatch`.
 *
 * @example
 * const [config, err] = tryCatchSync(() => JSON.parse(raw));
 */
export function tryCatchSync<T>(fn: () => T): VixelResult<T> {
  try {
    return [fn(), null];
  } catch (err) {
    if (err instanceof VixelError) return [null, err];
    const message = err instanceof Error ? err.message : String(err);
    return [null, new VixelError(message, ErrorCode.UNKNOWN, err)];
  }
}
