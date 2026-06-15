/**
 * Glow + Parallax — pure builder + dry-run unit tests (no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { buildGlowFilter } from '../src/generators/glow/constants.js';
import { buildParallaxFilter } from '../src/generators/parallax/constants.js';
import { glow } from '../src/generators/glow/generator.js';
import { parallax3d } from '../src/generators/parallax/generator.js';
import type { FFmpegCommand } from '../src/core/ffmpeg-spawn.js';
import type { VideoSource } from '../src/types/generators.js';

const src: VideoSource = { inputPath: 'in.mp4', duration: 6 };
const capture = () => {
  const cmds: FFmpegCommand[] = [];
  return { cmds, onCommand: (c: FFmpegCommand) => cmds.push(c) };
};

describe('buildGlowFilter', () => {
  it('whole-frame bloom: blur + screen blend', () => {
    const f = buildGlowFilter({ sigma: 8, steps: 4, intensity: 0.4, highlightsOnly: false, threshold: 180 });
    expect(f).toContain('split=2[base][b]');
    expect(f).toContain('gblur=sigma=8:steps=4');
    // luma-only screen blend; chroma kept from base (no magenta shift)
    expect(f).toContain('blend=c0_mode=screen:c0_opacity=0.4:c1_opacity=0:c2_opacity=0');
    expect(f).toContain('[vout]');
    expect(f).not.toContain('lutyuv');
  });

  it('highlights-only masks luma before blurring', () => {
    const f = buildGlowFilter({ sigma: 10, steps: 4, intensity: 0.5, highlightsOnly: true, threshold: 200 });
    expect(f).toContain('lutyuv');
    expect(f).toContain('200');
  });

  it('glow dry-run maps [vout] and copies audio', async () => {
    const { cmds, onCommand } = capture();
    const r = await glow(src, 'out.mp4', { sigma: 12, intensity: 0.5, dryRun: true, onCommand });
    expect(r.highlightsOnly).toBe(false);
    expect(cmds[0]!.command).toContain('-map [vout]');
    expect(cmds[0]!.command).toContain('-c:a copy');
  });
});

describe('buildParallaxFilter', () => {
  it('derives displacement maps from depth and uses displace', () => {
    const f = buildParallaxFilter({ width: 1080, height: 1920, amplitude: 12, period: 5, duration: 5, mode: 'sway' });
    expect(f).toContain('format=gray');
    expect(f).toContain('geq=lum=');
    expect(f).toContain('displace=edge=smear');
    expect(f).toContain('[vout]');
    // amplitude → k = 12/127, rounded to 6 dp by the builder
    expect(f).toContain('0.094488');
  });

  it('pan mode uses a linear ramp; orbit uses cos+sin', () => {
    const pan = buildParallaxFilter({ width: 100, height: 100, amplitude: 8, period: 4, duration: 4, mode: 'pan' });
    expect(pan).toContain('2*T/4-1');
    const orbit = buildParallaxFilter({ width: 100, height: 100, amplitude: 8, period: 4, duration: 4, mode: 'orbit' });
    expect(orbit).toContain('cos(2*PI*T/4)');
    expect(orbit).toContain('sin(2*PI*T/4)');
  });

  it('parallax3d requires duration + depthMap', async () => {
    await expect(parallax3d('img.png', 'out.mp4', { duration: 0, depthMap: 'd.png', dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(parallax3d('img.png', 'out.mp4', { duration: 5, depthMap: '', dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('parallax3d dry-run loads image + depth and renders displace', async () => {
    const { cmds, onCommand } = capture();
    const r = await parallax3d('img.png', 'out.mp4', { duration: 5, depthMap: 'depth.png', dryRun: true, onCommand });
    expect(r.mode).toBe('sway');
    // two -loop 1 inputs (image + depth)
    expect(cmds[0]!.args.filter((a) => a === '-loop')).toHaveLength(2);
    expect(cmds[0]!.command).toContain('displace');
  });
});
