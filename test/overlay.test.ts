/**
 * Overlay primitive — pure builder + dry-run unit tests (no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { buildOverlayFilter } from '../src/generators/overlay/constants.js';
import { overlay } from '../src/generators/overlay/generator.js';
import type { FFmpegCommand } from '../src/core/ffmpeg-spawn.js';
import type { VideoSource } from '../src/types/generators.js';

const src: VideoSource = { inputPath: 'base.mp4', duration: 6, width: 1080, height: 1920 };

describe('buildOverlayFilter', () => {
  it('scales overlay, blends in RGB (gbrp), outputs yuv420p', () => {
    const f = buildOverlayFilter({ width: 1080, height: 1920, blend: 'screen', opacity: 0.5 });
    expect(f).toContain('scale=1080:1920');
    expect(f).toContain('format=gbrp'); // RGB blend = no chroma shift
    expect(f).toContain('blend=all_mode=screen:all_opacity=0.5');
    expect(f).toContain('format=yuv420p[vout]');
  });

  it('blend MUST include shortest=1 (else looped overlay → infinite encode)', () => {
    // Regression: a looped (-stream_loop -1) overlay + blend's default
    // repeatlast=1 produces an endless, disk-filling encode without shortest=1.
    for (const blend of ['screen', 'lighten', 'addition']) {
      const f = buildOverlayFilter({ width: 1080, height: 1920, blend, opacity: 0.5 });
      expect(f).toContain(':shortest=1');
    }
  });

  it('supports lighten / addition blends', () => {
    expect(buildOverlayFilter({ width: 100, height: 100, blend: 'lighten', opacity: 0.4 })).toContain('all_mode=lighten');
    expect(buildOverlayFilter({ width: 100, height: 100, blend: 'addition', opacity: 0.4 })).toContain('all_mode=addition');
  });
});

describe('overlay generator', () => {
  it('requires overlayPath', async () => {
    await expect(overlay(src, 'out.mp4', { overlayPath: '', dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('dry-run loops the overlay, maps [vout], copies audio, -shortest', async () => {
    const cmds: FFmpegCommand[] = [];
    const r = await overlay(src, 'out.mp4', {
      overlayPath: 'leak.mp4', blend: 'screen', opacity: 0.5, dryRun: true,
      onCommand: (c) => cmds.push(c),
    });
    expect(r.blend).toBe('screen');
    const cmd = cmds[0]!.command;
    expect(cmd).toContain('-stream_loop -1'); // overlay looped to cover base
    expect(cmd).toContain('-map [vout]');
    expect(cmd).toContain('-c:a copy');
    expect(cmd).toContain('-shortest');
  });
});
