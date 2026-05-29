/**
 * Error System Tests
 * ==================
 * Unit tests for VixelError hierarchy, type guards, codes, and tryCatch.
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  VixelError,
  FFmpegError,
  HLSProcessorError,
  AbortError,
  isVixelError,
  isFFmpegError,
  isHLSProcessorError,
  isAbortError,
  tryCatch,
  tryCatchSync,
} from '../src/errors.js';

describe('Error classes', () => {
  it('VixelError carries message, code, and cause', () => {
    const cause = new Error('boom');
    const err = new VixelError('failed', ErrorCode.PROCESSING_FAILED, cause);
    expect(err.message).toBe('failed');
    expect(err.code).toBe('PROCESSING_FAILED');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('VixelError');
    expect(err).toBeInstanceOf(Error);
  });

  it('VixelError defaults to UNKNOWN code', () => {
    expect(new VixelError('x').code).toBe('UNKNOWN');
  });

  it('FFmpegError is a VixelError with FFMPEG_ERROR by default', () => {
    const err = new FFmpegError('ffmpeg blew up');
    expect(err.code).toBe('FFMPEG_ERROR');
    expect(err.name).toBe('FFmpegError');
    expect(err).toBeInstanceOf(VixelError);
  });

  it('FFmpegError accepts a specific code', () => {
    const err = new FFmpegError('timeout', { args: [] }, ErrorCode.FFMPEG_TIMEOUT);
    expect(err.code).toBe('FFMPEG_TIMEOUT');
  });

  it('HLSProcessorError exposes deprecated details alias of cause', () => {
    const err = new HLSProcessorError('bad', ErrorCode.INVALID_CONFIG, { v: 1 });
    expect(err.cause).toEqual({ v: 1 });
    expect(err.details).toEqual({ v: 1 });
  });

  it('AbortError has ABORTED code', () => {
    const err = new AbortError();
    expect(err.code).toBe('ABORTED');
    expect(err).toBeInstanceOf(VixelError);
  });
});

describe('Type guards', () => {
  it('discriminate the hierarchy correctly', () => {
    expect(isVixelError(new FFmpegError('x'))).toBe(true);
    expect(isFFmpegError(new FFmpegError('x'))).toBe(true);
    expect(isFFmpegError(new VixelError('x'))).toBe(false);
    expect(isHLSProcessorError(new HLSProcessorError('x'))).toBe(true);
    expect(isAbortError(new AbortError())).toBe(true);
    expect(isVixelError(new Error('x'))).toBe(false);
  });
});

describe('tryCatch', () => {
  it('returns [value, null] on success', async () => {
    const [value, err] = await tryCatch(async () => 42);
    expect(value).toBe(42);
    expect(err).toBeNull();
  });

  it('returns [null, VixelError] and preserves vixel errors', async () => {
    const original = new FFmpegError('nope', undefined, ErrorCode.FFMPEG_FAILED);
    const [value, err] = await tryCatch(async () => {
      throw original;
    });
    expect(value).toBeNull();
    expect(err).toBe(original);
    expect(err?.code).toBe('FFMPEG_FAILED');
  });

  it('wraps non-vixel errors as VixelError(UNKNOWN)', async () => {
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
