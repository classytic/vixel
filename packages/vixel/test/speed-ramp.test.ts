/**
 * Speed ramp — golden unit tests (pure filtergraph, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { buildSpeedRampFilter, validateSpeedRamp } from '../src/generators/speed-ramp/constants.js';

describe('buildSpeedRampFilter', () => {
  it('trims, retimes, and concats each segment into one [vout]', () => {
    const { filter, plan } = buildSpeedRampFilter({
      segments: [
        { throughSec: 2, speed: 1 },
        { throughSec: 3, speed: 0.5 },
        { throughSec: 6, speed: 2 },
      ],
      sourceDuration: 6,
      smooth: true,
      fps: 30,
    });

    // segment boundaries are derived from the previous throughSec
    expect(filter).toContain('[0:v]trim=start=0:end=2,setpts=(PTS-STARTPTS)/1,');
    expect(filter).toContain('[0:v]trim=start=2:end=3,setpts=(PTS-STARTPTS)/0.5,');
    expect(filter).toContain('[0:v]trim=start=3:end=6,setpts=(PTS-STARTPTS)/2,');
    // three segments stitched
    expect(filter).toContain('[v0][v1][v2]concat=n=3:v=1:a=0[vout]');

    // plan exposes the source→output mapping for timeline reconciliation
    expect(plan).toEqual([
      { srcStart: 0, srcEnd: 2, speed: 1, outDuration: 2 },
      { srcStart: 2, srcEnd: 3, speed: 0.5, outDuration: 2 }, // 1s @ 0.5x → 2s
      { srcStart: 3, srcEnd: 6, speed: 2, outDuration: 1.5 }, // 3s @ 2x → 1.5s
    ]);
  });

  it('motion-interpolates only slow-mo segments; plain fps elsewhere', () => {
    const { filter } = buildSpeedRampFilter({
      segments: [
        { throughSec: 1, speed: 0.25 }, // slow → minterpolate
        { throughSec: 2, speed: 2 }, // fast → plain fps
      ],
      sourceDuration: 2,
      smooth: true,
      fps: 30,
    });
    expect(filter).toContain('setpts=(PTS-STARTPTS)/0.25,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir[v0]');
    expect(filter).toContain('setpts=(PTS-STARTPTS)/2,fps=30[v1]');
  });

  it('respects smooth=false (no minterpolate even on slow segments)', () => {
    const { filter } = buildSpeedRampFilter({
      segments: [{ throughSec: 1, speed: 0.5 }],
      sourceDuration: 1,
      smooth: false,
      fps: 24,
    });
    expect(filter).not.toContain('minterpolate');
    expect(filter).toContain('setpts=(PTS-STARTPTS)/0.5,fps=24[v0]');
  });

  it('clamps the final segment boundary to the real clip end (sentinel → end)', () => {
    const { filter, plan } = buildSpeedRampFilter({
      segments: [
        { throughSec: 2, speed: 1 },
        { throughSec: 9999, speed: 0.5 }, // sentinel "to the end"
      ],
      sourceDuration: 5,
      smooth: true,
      fps: 30,
    });
    expect(filter).toContain('[0:v]trim=start=2:end=5,'); // clamped to 5, not 9999
    expect(plan[1]).toMatchObject({ srcEnd: 5, outDuration: 6 }); // 3s @ 0.5x → 6s
  });
});

describe('validateSpeedRamp', () => {
  it('rejects empty segments', () => {
    expect(() => validateSpeedRamp([], 5)).toThrow(/at least one segment/);
  });
  it('rejects out-of-range speeds', () => {
    expect(() => validateSpeedRamp([{ throughSec: 2, speed: 8 }], 5)).toThrow(/out of range/);
    expect(() => validateSpeedRamp([{ throughSec: 2, speed: 0.1 }], 5)).toThrow(/out of range/);
  });
  it('rejects non-ascending boundaries', () => {
    expect(() =>
      validateSpeedRamp([{ throughSec: 3, speed: 1 }, { throughSec: 2, speed: 1 }], 5),
    ).toThrow(/ascend/);
  });
  it('rejects a first boundary past the source duration', () => {
    expect(() => validateSpeedRamp([{ throughSec: 10, speed: 1 }], 5)).toThrow(/exceeds source duration/);
  });
  it('accepts a valid ramp', () => {
    expect(() => validateSpeedRamp([{ throughSec: 2, speed: 1 }, { throughSec: 5, speed: 0.5 }], 5)).not.toThrow();
  });
});
