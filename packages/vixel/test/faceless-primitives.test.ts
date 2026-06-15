/**
 * Faceless-YouTube primitives — pure builders + dry-run unit tests (no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { buildKenBurnsFilter } from '../src/generators/ken-burns/constants.js';
import { buildColorAdjustFilter, buildLut3dFilter } from '../src/generators/color/constants.js';
import { buildLoudnormFilter, parseLoudnormJson, LOUDNESS_PRESETS } from '../src/generators/audio/constants.js';
import { kenBurns } from '../src/generators/ken-burns/generator.js';
import { adjustColor, applyLut } from '../src/generators/color/generator.js';
import { normalizeLoudness } from '../src/generators/audio/generator.js';
import { slideshow } from '../src/generators/slideshow/generator.js';
import type { FFmpegCommand } from '../src/core/ffmpeg-spawn.js';
import type { VideoSource } from '../src/types/generators.js';

const src: VideoSource = { inputPath: 'in.mp4', duration: 30 };
const capture = () => {
  const cmds: FFmpegCommand[] = [];
  return { cmds, onCommand: (c: FFmpegCommand) => cmds.push(c) };
};

// ---------------------------------------------------------------------------
// Ken Burns
// ---------------------------------------------------------------------------
describe('buildKenBurnsFilter', () => {
  it('zoom-in produces a linear zoompan ramp + format', () => {
    const f = buildKenBurnsFilter({
      width: 1920, height: 1080, fps: 30, frames: 150,
      direction: 'in', startZoom: 1, endZoom: 1.2, panZoom: 1.2,
    });
    expect(f).toContain('zoompan=');
    expect(f).toContain('s=1920x1080');
    expect(f).toContain('fps=30');
    expect(f).toContain('format=yuv420p');
    expect(f).toMatch(/z='1\+/); // ramps up from 1
  });

  it('pan-left moves x across frames', () => {
    const f = buildKenBurnsFilter({
      width: 1080, height: 1920, fps: 30, frames: 120,
      direction: 'left', startZoom: 1, endZoom: 1, panZoom: 1.2,
    });
    expect(f).toContain("x='(iw-iw/zoom)*on/120'");
    expect(f).toContain("z='1.2'");
  });

  it('kenBurns requires a positive duration (dry-run)', async () => {
    await expect(kenBurns('img.jpg', 'out.mp4', { duration: 0, dryRun: true })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });

  it('kenBurns dry-run loops the image and applies zoompan', async () => {
    const { cmds, onCommand } = capture();
    const r = await kenBurns('img.jpg', 'out.mp4', { duration: 5, direction: 'in', dryRun: true, onCommand });
    expect(r.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(cmds[0]!.args).toContain('-loop');
    expect(cmds[0]!.command).toContain('zoompan');
  });
});

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------
describe('color filters', () => {
  it('emits only non-default eq knobs + unsharp', () => {
    const f = buildColorAdjustFilter({ contrast: 1.1, saturation: 1.2, sharpen: 0.8 });
    expect(f).toContain('eq=contrast=1.1:saturation=1.2');
    expect(f).toContain('unsharp=5:5:0.8');
    expect(f).not.toContain('brightness');
  });

  it('returns empty chain when nothing changes', () => {
    expect(buildColorAdjustFilter({ contrast: 1, saturation: 1 })).toBe('');
  });

  it('lut3d escapes windows paths', () => {
    expect(buildLut3dFilter('C:\\luts\\teal.cube')).toBe("lut3d='C\\:/luts/teal.cube'");
  });

  it('adjustColor rejects a no-op config (dry-run)', async () => {
    await expect(adjustColor(src, 'out.mp4', { dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('adjustColor dry-run copies audio, applies eq', async () => {
    const { cmds, onCommand } = capture();
    await adjustColor(src, 'out.mp4', { saturation: 1.3, dryRun: true, onCommand });
    expect(cmds[0]!.command).toContain('eq=saturation=1.3');
    expect(cmds[0]!.command).toContain('-c:a copy');
  });

  it('applyLut requires lutPath (dry-run)', async () => {
    await expect(applyLut(src, 'out.mp4', { lutPath: '', dryRun: true })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });
});

// ---------------------------------------------------------------------------
// Loudness
// ---------------------------------------------------------------------------
describe('loudness', () => {
  it('first pass requests JSON measurement', () => {
    const f = buildLoudnormFilter({ targetLufs: -14, truePeak: -1, lra: 11, printJson: true });
    expect(f).toBe('loudnorm=I=-14:TP=-1:LRA=11:print_format=json');
  });

  it('second pass feeds measurements back with linear=true', () => {
    const f = buildLoudnormFilter({
      targetLufs: -14, truePeak: -1, lra: 11,
      measured: { input_i: '-20', input_tp: '-5', input_lra: '7', input_thresh: '-30', target_offset: '0.5' },
    });
    expect(f).toContain('measured_I=-20');
    expect(f).toContain('offset=0.5');
    expect(f).toContain('linear=true');
  });

  it('parses the loudnorm JSON block from stderr', () => {
    const stderr = 'noise...\n{\n  "input_i" : "-18.5",\n  "input_tp" : "-3.0",\n  "input_lra" : "6.0",\n  "input_thresh" : "-28.6",\n  "target_offset" : "0.20"\n}\nmore';
    const m = parseLoudnormJson(stderr);
    expect(m?.input_i).toBe('-18.5');
    expect(m?.target_offset).toBe('0.20');
  });

  it('exposes platform presets', () => {
    expect(LOUDNESS_PRESETS.youtube).toBe(-14);
    expect(LOUDNESS_PRESETS.broadcast).toBe(-23);
  });

  it('normalizeLoudness dry-run emits a loudnorm command at the preset target', async () => {
    const { cmds, onCommand } = capture();
    await normalizeLoudness(src, 'out.mp4', { preset: 'broadcast', dryRun: true, onCommand });
    expect(cmds[0]!.command).toContain('loudnorm=I=-23');
  });
});

// ---------------------------------------------------------------------------
// Slideshow (composition)
// ---------------------------------------------------------------------------
describe('slideshow', () => {
  it('requires at least one slide', async () => {
    await expect(slideshow([], 'out.mp4', { dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('dry-run renders one Ken Burns command per slide then joins', async () => {
    const { cmds, onCommand } = capture();
    const r = await slideshow(['a.jpg', 'b.jpg', 'c.jpg'], 'out.mp4', {
      durationPer: 4,
      transition: 'fade',
      width: 1080,
      height: 1920,
      dryRun: true,
      onCommand,
    });
    expect(r.slideCount).toBe(3);
    // 3 zoompan (Ken Burns) commands + 1 xfade join = 4
    const zoompans = cmds.filter((c) => c.command.includes('zoompan'));
    expect(zoompans).toHaveLength(3);
    expect(cmds.some((c) => c.command.includes('xfade'))).toBe(true);
  });

  it('alternates Ken Burns direction by default', async () => {
    const { cmds, onCommand } = capture();
    await slideshow(['a.jpg', 'b.jpg'], 'out.mp4', { transition: 'none', dryRun: true, onCommand });
    // slide 0 zooms in (ramps up), slide 1 zooms out (ramps down)
    const zoompans = cmds.filter((c) => c.command.includes('zoompan'));
    expect(zoompans).toHaveLength(2);
  });
});
