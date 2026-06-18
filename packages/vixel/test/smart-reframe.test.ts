/**
 * Smart reframe — golden unit tests (pure crop-tracking, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import {
  buildSmartReframeFilter,
  cropWindow,
  smoothTrack,
  sampleTrack,
  applyDeadzone,
} from '../src/generators/smart-reframe/constants.js';

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('cropWindow', () => {
  it('16:9 → 9:16 crops a vertical strip (pans on X)', () => {
    const w = cropWindow(1920, 1080, { w: 9, h: 16 });
    expect(w).toEqual({ cropW: 608, cropH: 1080, axis: 'x' }); // 1080*9/16 = 607.5 → even 608
  });
  it('a tall source → crops a horizontal band (pans on Y)', () => {
    const w = cropWindow(1080, 1920, { w: 16, h: 9 });
    expect(w.axis).toBe('y');
    expect(w.cropW).toBe(1080);
  });
});

describe('smoothTrack / sampleTrack', () => {
  it('moving-average smooths a jittery centre', () => {
    const track = [
      { t: 0, cx: 0.5 }, { t: 0.1, cx: 0.9 }, { t: 0.2, cx: 0.1 }, { t: 0.3, cx: 0.5 },
    ];
    const sm = smoothTrack(track, 0.4);
    // the spike at 0.1 is pulled toward the local mean
    expect(sm[1]!.cx).toBeGreaterThan(0.3);
    expect(sm[1]!.cx).toBeLessThan(0.7);
  });
  it('thins a dense track to ~one point per interval', () => {
    const track = Array.from({ length: 60 }, (_, i) => ({ t: i * 0.1, cx: 0.5 })); // 6s @ 10fps
    const s = sampleTrack(track, 0.5);
    expect(s.length).toBeLessThan(20); // ~ every 0.5s + endpoints
    expect(s[0]!.t).toBe(0);
    expect(s[s.length - 1]!.t).toBeCloseTo(5.9, 5); // last point kept
  });
});

describe('stabilization — anti-tremble', () => {
  it('locks a near-still jittery subject (kills the crop tremble)', () => {
    // matte-centroid jitter ±0.03 around centre — the "trembling" case
    const jitter = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.1, cx: 0.5 + (i % 2 ? 0.03 : -0.03) }));
    const stable = applyDeadzone(smoothTrack(jitter, 0.6), 0.05).map((p) => p.cx);
    expect(spread(stable)).toBeLessThan(0.01); // effectively frozen
    expect(spread(jitter.map((p) => p.cx))).toBeGreaterThan(0.05); // raw was jittery
  });

  it('still follows a real pan beyond the deadzone', () => {
    const pan = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.1, cx: 0.2 + i * 0.015 })); // 0.2 → ~0.79
    const out = applyDeadzone(smoothTrack(pan, 0.6), 0.05);
    expect(out[out.length - 1]!.cx).toBeGreaterThan(0.6); // tracked the intentional move
  });

  it('smooths the Y axis too (vertical-pan reframes)', () => {
    const jitterY = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.1, cx: 0.5, cy: 0.5 + (i % 2 ? 0.04 : -0.04) }));
    const sm = smoothTrack(jitterY, 0.6).map((p) => p.cy!);
    expect(spread(sm)).toBeLessThan(spread(jitterY.map((p) => p.cy!)));
  });
});

describe('buildSmartReframeFilter', () => {
  const base = { srcW: 1920, srcH: 1080, aspect: { w: 9, h: 16 }, outW: 1080, outH: 1920, smoothing: 0.4, sampleInterval: 0.5 };

  it('static (no track) → centred crop', () => {
    const f = buildSmartReframeFilter({ ...base, track: [] });
    // cropW=608, centred x = (1920-608)/2 = 656
    expect(f).toBe("crop=608:1080:x='656':y=0,scale=1080:1920,setsar=1");
  });

  it('a moving subject → a keyframed crop x that follows + scales to output', () => {
    const track = [
      { t: 0, cx: 0.2 }, { t: 1, cx: 0.5 }, { t: 2, cx: 0.8 },
    ];
    const f = buildSmartReframeFilter({ ...base, track });
    expect(f).toContain("crop=608:1080:x='"); // keyframed x
    expect(f).toContain('if(lt(t'); // multi-segment time-expression
    expect(f).toContain(',scale=1080:1920,setsar=1');
  });

  it('clamps the crop window inside the frame (subject at the edge)', () => {
    // subject hard left (cx≈0) and hard right (cx≈1) → x clamps to [0, 1920-608=1312]
    const f = buildSmartReframeFilter({ ...base, track: [{ t: 0, cx: 0 }, { t: 1, cx: 1 }] });
    expect(f).toContain("x='(0+(1312)"); // starts at 0, heads to 1312 — never negative / past edge
  });
});
