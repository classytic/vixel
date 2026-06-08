/**
 * Error System Tests
 * ==================
 * Unit tests for the VixelError hierarchy: typed codes, structured context,
 * actionable hints, JSON serialization, factory statics, type guards, and the
 * tryCatch result tuples.
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  VixelError,
  FFmpegError,
  ProbeError,
  ConfigError,
  AbortError,
  HLSProcessorError,
  isVixelError,
  isFFmpegError,
  isProbeError,
  isConfigError,
  isAbortError,
  toVixelError,
  tryCatch,
  tryCatchSync,
} from '../src/errors.js';

describe('VixelError', () => {
  it('carries message, typed code, cause, context, and hint', () => {
    const cause = new Error('boom');
    const err = new VixelError('failed', {
      code: ErrorCode.PROCESSING_FAILED,
      cause,
      context: { step: 'encode' },
      hint: 'retry',
    });
    expect(err.message).toBe('failed');
    expect(err.code).toBe('PROCESSING_FAILED');
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ step: 'encode' });
    expect(err.hint).toBe('retry');
    expect(err.name).toBe('VixelError');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults to the UNKNOWN code with no options', () => {
    expect(new VixelError('x').code).toBe('UNKNOWN');
  });

  it('derives `name` from the concrete subclass', () => {
    expect(new FFmpegError('x').name).toBe('FFmpegError');
    expect(new ProbeError('x').name).toBe('ProbeError');
    expect(new ConfigError('x').name).toBe('ConfigError');
  });

  it('serializes to a stable, JSON-safe shape for logs/agents', () => {
    const err = new ConfigError('bad input', {
      context: { field: 'durationSec' },
      hint: 'must be > 0',
      cause: new Error('root'),
    });
    const json = err.toJSON();
    expect(json).toMatchObject({
      name: 'ConfigError',
      code: 'INVALID_CONFIG',
      message: 'bad input',
      hint: 'must be > 0',
      context: { field: 'durationSec' },
      cause: { name: 'Error', message: 'root' },
    });
    // Round-trips through JSON.stringify without throwing/circular refs.
    expect(() => JSON.stringify(err)).not.toThrow();
  });

  it('omits absent optional fields from toJSON', () => {
    const json = new VixelError('plain').toJSON();
    expect(json).toEqual({ name: 'VixelError', code: 'UNKNOWN', message: 'plain' });
    expect('context' in json).toBe(false);
    expect('hint' in json).toBe(false);
    expect('cause' in json).toBe(false);
  });
});

describe('Subclasses + factory statics', () => {
  it('FFmpegError defaults to FFMPEG_ERROR', () => {
    const err = new FFmpegError('ffmpeg blew up');
    expect(err.code).toBe('FFMPEG_ERROR');
    expect(err).toBeInstanceOf(VixelError);
  });

  it('FFmpegError.timeout codes + hints correctly', () => {
    const err = FFmpegError.timeout(5000, { args: ['-i', 'x'] });
    expect(err.code).toBe('FFMPEG_TIMEOUT');
    expect(err.message).toContain('5000ms');
    expect(err.context).toEqual({ args: ['-i', 'x'] });
    expect(err.hint).toBeTruthy();
  });

  it('FFmpegError.failed captures exit code + stderr tail in context', () => {
    const err = FFmpegError.failed(1, 'Invalid data found');
    expect(err.code).toBe('FFMPEG_FAILED');
    expect(err.context).toMatchObject({ exitCode: 1, stderrTail: 'Invalid data found' });
  });

  it('FFmpegError.spawn chains the underlying cause', () => {
    const cause = new Error('ENOENT');
    const err = FFmpegError.spawn(cause);
    expect(err.code).toBe('FFMPEG_SPAWN_ERROR');
    expect(err.cause).toBe(cause);
  });

  it('ConfigError.notFound uses INVALID_INPUT + path context', () => {
    const err = ConfigError.notFound('/tmp/missing.mp4');
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.context).toMatchObject({ path: '/tmp/missing.mp4' });
  });

  it('AbortError has the ABORTED code', () => {
    expect(new AbortError().code).toBe('ABORTED');
    expect(new AbortError()).toBeInstanceOf(VixelError);
  });

  it('HLSProcessorError remains a back-compat VixelError', () => {
    const err = new HLSProcessorError('legacy');
    expect(err).toBeInstanceOf(VixelError);
    expect(err.code).toBe('PROCESSING_FAILED');
  });
});

describe('Type guards', () => {
  it('discriminate the hierarchy correctly', () => {
    expect(isVixelError(new FFmpegError('x'))).toBe(true);
    expect(isFFmpegError(new FFmpegError('x'))).toBe(true);
    expect(isFFmpegError(new VixelError('x'))).toBe(false);
    expect(isProbeError(new ProbeError('x'))).toBe(true);
    expect(isConfigError(new ConfigError('x'))).toBe(true);
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isVixelError(new Error('x'))).toBe(false);
  });
});

describe('toVixelError', () => {
  it('passes through existing VixelErrors unchanged', () => {
    const original = new FFmpegError('x');
    expect(toVixelError(original)).toBe(original);
  });

  it('maps native AbortSignal cancellations to AbortError', () => {
    const native = new Error('aborted');
    native.name = 'AbortError';
    const mapped = toVixelError(native);
    expect(mapped).toBeInstanceOf(AbortError);
    expect(mapped.code).toBe('ABORTED');
    expect(mapped.cause).toBe(native);
  });

  it('wraps unknown throws as UNKNOWN, preserving the message + cause', () => {
    const raw = new Error('raw');
    const mapped = toVixelError(raw);
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe('raw');
    expect(mapped.cause).toBe(raw);
  });
});

describe('tryCatch', () => {
  it('returns [value, null] on success', async () => {
    const [value, err] = await tryCatch(async () => 42);
    expect(value).toBe(42);
    expect(err).toBeNull();
  });

  it('returns [null, error] and preserves vixel errors', async () => {
    const original = FFmpegError.failed(1, 'nope');
    const [value, err] = await tryCatch(async () => {
      throw original;
    });
    expect(value).toBeNull();
    expect(err).toBe(original);
    expect(err?.code).toBe('FFMPEG_FAILED');
  });

  it('normalises non-vixel errors to VixelError(UNKNOWN)', async () => {
    const [, err] = await tryCatch(async () => {
      throw new Error('raw');
    });
    expect(err).toBeInstanceOf(VixelError);
    expect(err?.code).toBe('UNKNOWN');
    expect(err?.message).toBe('raw');
  });
});

describe('tryCatchSync', () => {
  it('returns [value, null] on success', () => {
    const [value, err] = tryCatchSync(() => 'ok');
    expect(value).toBe('ok');
    expect(err).toBeNull();
  });

  it('wraps thrown errors', () => {
    const [, err] = tryCatchSync(() => {
      throw new Error('sync boom');
    });
    expect(err).toBeInstanceOf(VixelError);
    expect(err?.message).toBe('sync boom');
  });
});
