/**
 * Motion effects — golden unit tests (pure filters, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import {
  buildRgbSplitFilter,
  buildGlitchFilter,
  buildShakeFilter,
  buildZoomPunchFilter,
  buildMotionEffectFilter,
} from '../src/generators/motion-effects/constants.js';

describe('buildRgbSplitFilter', () => {
  it('shifts red/blue by intensity-scaled pixels', () => {
    expect(buildRgbSplitFilter(1)).toBe('rgbashift=rh=14:bh=-14');
    expect(buildRgbSplitFilter(0.5)).toBe('rgbashift=rh=7:bh=-7');
  });
  it('never collapses to a 0px no-op', () => {
    expect(buildRgbSplitFilter(0)).toBe('rgbashift=rh=1:bh=-1');
  });
});

describe('buildGlitchFilter', () => {
  it('combines RGB split + temporal noise + a contrast/saturation pump', () => {
    const f = buildGlitchFilter(0.5);
    expect(f).toContain('rgbashift=rh=5:bh=-5');
    expect(f).toContain('noise=alls=12:allf=t+u');
    expect(f).toContain('eq=contrast=1.100:saturation=1.200');
  });
});

describe('buildShakeFilter', () => {
  it('scales up for headroom then jitters the crop with time-based sines', () => {
    const f = buildShakeFilter(0.5);
    expect(f).toContain('scale=w=iw*1.1:h=ih*1.1:eval=init');
    expect(f).toContain('crop=w=iw/1.1:h=ih/1.1');
    expect(f).toContain('sin(2*PI*t*3.1)'); // time-driven jitter
    expect(f).toContain('0.0125*iw'); // 0.025 * 0.5 intensity
  });
});

describe('buildZoomPunchFilter', () => {
  it('emits a video-safe decaying zoom pulse at the source size/fps', () => {
    const f = buildZoomPunchFilter({ intensity: 0.5, width: 1080, height: 1920, fps: 30 });
    expect(f).toContain(':d=1:'); // one output frame per input frame
    expect(f).toContain('s=1080x1920:fps=30');
    expect(f).toContain('mod(on\\,30)'); // ~1 punch/sec, comma escaped inside the expr
    expect(f).toContain('0.0900'); // 0.18 * 0.5
  });
  it('honors an explicit punch period', () => {
    const f = buildZoomPunchFilter({ intensity: 1, width: 640, height: 360, fps: 24, periodFrames: 12 });
    expect(f).toContain('mod(on\\,12)');
  });
});

describe('buildMotionEffectFilter (dispatch)', () => {
  const dims = { width: 640, height: 360, fps: 30 };
  it('routes each effect name to its builder', () => {
    expect(buildMotionEffectFilter('glitch', { intensity: 0.5, ...dims })).toContain('noise=');
    expect(buildMotionEffectFilter('shake', { intensity: 0.5, ...dims })).toContain('crop=w=iw/1.1');
    expect(buildMotionEffectFilter('rgb-split', { intensity: 0.5, ...dims })).toBe('rgbashift=rh=7:bh=-7');
    expect(buildMotionEffectFilter('zoom-punch', { intensity: 0.5, ...dims })).toContain('zoompan=');
  });
});
