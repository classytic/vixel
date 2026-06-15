/**
 * HLS ladder selection — unit tests (pure, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { ladderFor } from '../src/profiles/hls-ladder.js';

const heights = (vs: { height: number }[]) => vs.map((v) => v.height);

describe('ladderFor', () => {
  it('includes every rung up to a 4K source (never upscales beyond it)', () => {
    expect(heights(ladderFor(2160))).toEqual([1080, 720, 480, 360]);
  });

  it('never upscales: a 720p source tops out at 720p', () => {
    expect(heights(ladderFor(720))).toEqual([720, 480, 360]);
    expect(heights(ladderFor(480))).toEqual([480, 360]);
  });

  it('caps the top rung at maxHeight', () => {
    expect(heights(ladderFor(1080, 720))).toEqual([720, 480, 360]);
  });

  it('always keeps a low-bandwidth fallback for tiny sources', () => {
    expect(heights(ladderFor(240))).toEqual([360]); // smallest rung, never empty
  });

  it('carries real bitrates on each rung', () => {
    const top = ladderFor(1080)[0]!;
    expect(top.videoBitrate).toBeGreaterThan(0);
    expect(top.audioBitrate).toBeGreaterThan(0);
  });
});
