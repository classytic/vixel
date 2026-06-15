/**
 * Source primitive — unit tests (ffmpeg-free).
 *
 * Covers metadata accessors, VideoSource compatibility, immutability, the
 * serializable form, and the not-found error path. The real-probe path
 * (`fromFile` against a fixture) is exercised in the e2e tier.
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../src/primitives/source.js';
import { ConfigError, isConfigError } from '../src/errors.js';
import type { VideoMetadata } from '../src/core/probe.js';
import type { VideoSource } from '../src/types/generators.js';

const META: VideoMetadata = {
  duration: 12.5,
  width: 1920,
  height: 1080,
  bitrate: 5000,
  fps: 30,
  codec: 'h264',
  audioCodec: 'aac',
  audioSampleRate: 48000,
  hasAudio: true,
};

describe('Source.fromMetadata', () => {
  it('exposes probed metadata via VideoSource-compatible accessors', () => {
    const src = Source.fromMetadata('clip.mp4', META);
    expect(src.kind).toBe('file');
    expect(src.inputPath).toBe('clip.mp4');
    expect(src.duration).toBe(12.5);
    expect(src.width).toBe(1920);
    expect(src.height).toBe(1080);
    expect(src.fps).toBe(30);
    expect(src.hasAudio).toBe(true);
    expect(src.codec).toBe('h264');
  });

  it('computes aspectRatio (and is 0 when height is unknown)', () => {
    expect(Source.fromMetadata('a.mp4', META).aspectRatio).toBeCloseTo(1920 / 1080, 5);
    const zero = Source.fromMetadata('b.mp4', { ...META, height: 0 });
    expect(zero.aspectRatio).toBe(0);
  });

  it('is a drop-in for the legacy VideoSource shape', () => {
    // Assigning to a VideoSource compiles only if the structural contract holds.
    const asSource: VideoSource = Source.fromMetadata('clip.mp4', META);
    expect(asSource.inputPath).toBe('clip.mp4');
    expect(asSource.duration).toBe(12.5);
  });

  it('freezes its metadata (immutable after construction)', () => {
    const src = Source.fromMetadata('clip.mp4', META);
    expect(Object.isFrozen(src.metadata)).toBe(true);
    // Mutating the source's view must not affect the original input object.
    expect(() => {
      (src.metadata as { duration: number }).duration = 999;
    }).toThrow(); // strict-mode write to a frozen property
    expect(src.duration).toBe(12.5);
  });

  it('does not alias the input metadata object', () => {
    const input = { ...META };
    const src = Source.fromMetadata('clip.mp4', input);
    input.duration = 1;
    expect(src.duration).toBe(12.5); // copied, not referenced
  });

  it('serializes to a stable JSON shape', () => {
    const src = Source.fromMetadata('clip.mp4', META);
    expect(src.toJSON()).toEqual({ kind: 'file', inputPath: 'clip.mp4', metadata: META });
    expect(() => JSON.stringify(src)).not.toThrow();
  });
});

describe('Source.fromFile', () => {
  it('rejects a missing path with ConfigError(INVALID_INPUT)', async () => {
    await expect(Source.fromFile('/no/such/file-xyz.mp4')).rejects.toSatisfy((err: unknown) => {
      return isConfigError(err) && (err as ConfigError).code === 'INVALID_INPUT';
    });
  });
});
