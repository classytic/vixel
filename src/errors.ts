/**
 * Vixel Error System
 * ==================
 * The single canonical home for every error type, code, guard, and helper.
 *
 * Design goals:
 *  - **One contract.** Every error is a {@link VixelError} with a typed
 *    {@link ErrorCode}, optional structured {@link ErrorContext}, and an
 *    optional actionable `hint`. No throw-strings, no untyped codes.
 *  - **AI- & log-friendly.** {@link VixelError.toJSON} emits a stable,
 *    serializable shape so agents and log pipelines get machine-readable
 *    detail (code, context, hint, chained cause) — not just a message string.
 *  - **Modern.** Options-bag constructor, native `cause` chaining (ES2022),
 *    `new.target`-derived names, V8 clean stacks, factory statics for the
 *    common cases so call sites stay terse and codes stay consistent.
 *
 * @example Branch on a typed code
 * ```ts
 * const [out, err] = await tryCatch(() => editorProxy(src, dir));
 * if (err) {
 *   if (err.code === ErrorCode.FFMPEG_TIMEOUT) retryWithLongerTimeout();
 *   else logger.error(err.toJSON()); // structured for agents/observability
 * }
 * ```
 */

// =============================================================================
// Error Codes — single source of truth
// =============================================================================

export const ErrorCode = {
  // FFmpeg / process
  FFMPEG_ERROR: 'FFMPEG_ERROR',
  FFMPEG_NOT_FOUND: 'FFMPEG_NOT_FOUND',
  FFMPEG_TIMEOUT: 'FFMPEG_TIMEOUT',
  FFMPEG_SPAWN_ERROR: 'FFMPEG_SPAWN_ERROR',
  FFMPEG_FAILED: 'FFMPEG_FAILED',
  // Probe
  PROBE_FAILED: 'PROBE_FAILED',
  // Configuration / input
  INVALID_CONFIG: 'INVALID_CONFIG',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_VARIANT: 'INVALID_VARIANT',
  UNSUPPORTED: 'UNSUPPORTED',
  NOT_FOUND: 'NOT_FOUND',
  INPUT_NOT_FOUND: 'INPUT_NOT_FOUND',
  // Ingest (remote sources)
  INGEST_FAILED: 'INGEST_FAILED',
  // Runtime
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  OUTPUT_ERROR: 'OUTPUT_ERROR',
  ABORTED: 'ABORTED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// Shared shapes
// =============================================================================

/** Structured, machine-/AI-readable detail attached to an error. */
export type ErrorContext = Readonly<Record<string, unknown>>;

/** Options bag for constructing any {@link VixelError}. */
export interface VixelErrorOptions {
  /** Typed code; defaults per error class (or `UNKNOWN`). */
  readonly code?: ErrorCode;
  /** The underlying error/value that triggered this one (chained). */
  readonly cause?: unknown;
  /** Structured detail (exitCode, command, path, stderrTail, …). */
  readonly context?: ErrorContext;
  /** Short, actionable remediation for a human or an AI agent. */
  readonly hint?: string;
}

/** Stable JSON shape produced by {@link VixelError.toJSON}. */
export interface SerializedVixelError {
  readonly name: string;
  readonly code: ErrorCode;
  readonly message: string;
  readonly hint?: string;
  readonly context?: ErrorContext;
  readonly cause?: unknown;
}

// =============================================================================
// Base error
// =============================================================================

export class VixelError extends Error {
  /** Typed, switchable error code. */
  readonly code: ErrorCode;
  /** Structured, machine-/AI-readable detail. */
  readonly context?: ErrorContext;
  /** Short, actionable remediation. */
  readonly hint?: string;

  constructor(message: string, options: VixelErrorOptions = {}) {
    // Native cause chaining (ES2022). Only pass the options bag when a cause
    // is present so `exactOptionalPropertyTypes` stays happy.
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    // Subclass-correct name without per-class boilerplate.
    this.name = new.target.name;
    this.code = options.code ?? ErrorCode.UNKNOWN;
    if (options.context !== undefined) this.context = options.context;
    if (options.hint !== undefined) this.hint = options.hint;
    // V8: drop the constructor frame from the stack for cleaner traces.
    Error.captureStackTrace?.(this, new.target);
  }

  /**
   * Stable, serializable form for logs and AI agents. Safe to `JSON.stringify`
   * (the chained `cause` is flattened, never circular).
   */
  toJSON(): SerializedVixelError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.hint !== undefined ? { hint: this.hint } : {}),
      ...(this.context !== undefined ? { context: this.context } : {}),
      ...(this.cause !== undefined ? { cause: serializeCause(this.cause) } : {}),
    };
  }
}

// =============================================================================
// Specialised errors (each presets its code; factories cover common cases)
// =============================================================================

/** ffmpeg/ffprobe subprocess failures. */
export class FFmpegError extends VixelError {
  constructor(message: string, options: VixelErrorOptions = {}) {
    super(message, { code: ErrorCode.FFMPEG_ERROR, ...options });
  }

  /** The process exceeded its timeout and was killed. */
  static timeout(timeoutMs: number, context?: ErrorContext): FFmpegError {
    return new FFmpegError(`FFmpeg timed out after ${timeoutMs}ms`, {
      code: ErrorCode.FFMPEG_TIMEOUT,
      ...(context !== undefined ? { context } : {}),
      hint: 'Increase the `timeout` option, or verify the input is a decodable media file.',
    });
  }

  /** The process exited non-zero. `stderrTail` carries the ffmpeg error. */
  static failed(exitCode: number | null, stderrTail: string, context?: ErrorContext): FFmpegError {
    return new FFmpegError(`FFmpeg exited with code ${exitCode ?? 'null'}`, {
      code: ErrorCode.FFMPEG_FAILED,
      // Spread caller context FIRST so the real exitCode/stderrTail always win.
      context: { ...context, exitCode, stderrTail },
      hint: 'Inspect `context.stderrTail` for the underlying ffmpeg error.',
    });
  }

  /** The process could not be spawned (usually a missing/incorrect binary). */
  static spawn(cause: unknown, context?: ErrorContext): FFmpegError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new FFmpegError(`Failed to spawn ffmpeg: ${detail}`, {
      code: ErrorCode.FFMPEG_SPAWN_ERROR,
      cause,
      ...(context !== undefined ? { context } : {}),
      hint: 'Ensure ffmpeg 6+ is installed and on PATH, or set `ffmpegPath`.',
    });
  }
}

/** ffprobe metadata extraction failures. */
export class ProbeError extends VixelError {
  constructor(message: string, options: VixelErrorOptions = {}) {
    super(message, { code: ErrorCode.PROBE_FAILED, ...options });
  }
}

/** Invalid configuration or input supplied by the caller. */
export class ConfigError extends VixelError {
  constructor(message: string, options: VixelErrorOptions = {}) {
    super(message, { code: ErrorCode.INVALID_CONFIG, ...options });
  }

  /** A referenced input file/path does not exist. */
  static notFound(path: string, context?: ErrorContext): ConfigError {
    return new ConfigError(`Input not found: ${path}`, {
      code: ErrorCode.INVALID_INPUT,
      context: { path, ...context },
      hint: 'Check the path exists and is readable before processing.',
    });
  }
}

/** Thrown when an operation is cancelled via an `AbortSignal`. */
export class AbortError extends VixelError {
  constructor(message = 'Operation aborted', options: VixelErrorOptions = {}) {
    super(message, { code: ErrorCode.ABORTED, ...options });
  }
}

/**
 * @deprecated Legacy name from the pre-vixel "hls-processor" era. Use
 * {@link VixelError} (or a specific subclass). Retained as a back-compat
 * export; will be removed in a future major.
 */
export class HLSProcessorError extends VixelError {
  constructor(message: string, options: VixelErrorOptions = {}) {
    super(message, { code: ErrorCode.PROCESSING_FAILED, ...options });
  }
}

// =============================================================================
// Type guards
// =============================================================================

export function isVixelError(err: unknown): err is VixelError {
  return err instanceof VixelError;
}

export function isFFmpegError(err: unknown): err is FFmpegError {
  return err instanceof FFmpegError;
}

export function isProbeError(err: unknown): err is ProbeError {
  return err instanceof ProbeError;
}

export function isConfigError(err: unknown): err is ConfigError {
  return err instanceof ConfigError;
}

export function isAbortError(err: unknown): err is AbortError {
  return err instanceof AbortError;
}

/** @deprecated Use {@link isVixelError}. */
export function isHLSProcessorError(err: unknown): err is HLSProcessorError {
  return err instanceof HLSProcessorError;
}

// =============================================================================
// Normalisation + tryCatch result tuples
// =============================================================================

/** Flatten a chained cause into a JSON-safe value (never circular). */
function serializeCause(cause: unknown): unknown {
  if (cause instanceof VixelError) return cause.toJSON();
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  return cause;
}

/**
 * Coerce any thrown value into a {@link VixelError}, preserving ours as-is and
 * mapping native `AbortSignal` cancellations to {@link AbortError}.
 */
export function toVixelError(err: unknown): VixelError {
  if (err instanceof VixelError) return err;
  if (err instanceof Error && err.name === 'AbortError') {
    return new AbortError(err.message, { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new VixelError(message, { code: ErrorCode.UNKNOWN, cause: err });
}

export type VixelResult<T> = [value: T, error: null] | [value: null, error: VixelError];

/**
 * Run an async fn and return `[value, null]` on success or `[null, VixelError]`
 * on failure. Unknown throws are normalised via {@link toVixelError}.
 *
 * @example
 * const [out, err] = await tryCatch(() => editorProxy(src, dir));
 * if (err) return logger.error(err.toJSON());
 * use(out.outputPath);
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<VixelResult<T>> {
  try {
    return [await fn(), null];
  } catch (err) {
    return [null, toVixelError(err)];
  }
}

/** Synchronous variant of {@link tryCatch}. */
export function tryCatchSync<T>(fn: () => T): VixelResult<T> {
  try {
    return [fn(), null];
  } catch (err) {
    return [null, toVixelError(err)];
  }
}
