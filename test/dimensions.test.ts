/**
 * Dimension math + downscale filter — unit tests (pure, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import {
  toEven,
  fitWithin,
  downscaleFilter,
  MAX_PROXY_WIDTH,
  MAX_PROXY_HEIGHT,
} from '../src/core/dimensions.js';

const BOX = { width: MAX_PROXY_WIDTH, height: MAX_PROXY_HEIGHT };

describe('toEven', () => {
  it('rounds to the nearest even integer, floored at 2', () => {
    expect(toEven(607.5)).toBe(608);
    expect(toEven(1080)).toBe(1080);
    expect(toEven(3)).toBe(4);
    expect(toEven(0)).toBe(2);
    expect(toEven(-5)).toBe(2);
  });
});

describe('fitWithin', () => {
  it('caps 4K landscape to the 1080p box', () => {
    expect(fitWithin({ width: 3840, height: 2160 }, BOX)).toEqual({ width: 1920, height: 1080 });
  });

  it('never upscales a smaller source', () => {
    expect(fitWithin({ width: 1280, height: 720 }, BOX)).toEqual({ width: 1280, height: 720 });
    expect(fitWithin({ width: 640, height: 360 }, BOX)).toEqual({ width: 640, height: 360 });
  });

  it('caps portrait by height and keeps even dims', () => {
    const out = fitWithin({ width: 1080, height: 1920 }, BOX);
    expect(out.height).toBe(1080);
    expect(out.width % 2).toBe(0);
    expect(out.width).toBeLessThanOrEqual(1920);
  });

  it('returns 0×0 for unknown source dimensions', () => {
    expect(fitWithin({ width: 0, height: 0 }, BOX)).toEqual({ width: 0, height: 0 });
  });
});

describe('downscaleFilter', () => {
  it('emits the downscale-only, even-dim scale filter for the default box', () => {
    expect(downscaleFilter()).toBe(
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    );
  });

  it('honours a custom box', () => {
    expect(downscaleFilter({ width: 1280, height: 720 })).toBe(
      "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    );
  });
});
