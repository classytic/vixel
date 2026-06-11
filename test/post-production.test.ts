/**
 * Post-Production Primitives — pure filter-builder + dry-run unit tests.
 * No ffmpeg binary required (unit tier).
 */

import { describe, it, expect } from 'vitest';
import { buildAudioMixFilter } from '../src/generators/audio-mix/constants.js';
import {
  buildSubtitlesFilter,
  buildDrawtextFilter,
  escapeSubtitlePath,
  escapeDrawtext,
} from '../src/generators/captions/constants.js';
import { buildXfadeGraph } from '../src/generators/transitions/constants.js';
import { buildReframeFilter, ASPECT_DIMENSIONS } from '../src/generators/reframe/constants.js';
import { buildFadeFilters } from '../src/generators/fade/constants.js';
import { mixAudio } from '../src/generators/audio-mix/generator.js';
import { burnSubtitles } from '../src/generators/captions/generator.js';
import { reframe } from '../src/generators/reframe/generator.js';
import { fade } from '../src/generators/fade/generator.js';
import { extractFrameAt } from '../src/generators/frame/generator.js';
import { concatWithTransitions } from '../src/generators/transitions/generator.js';
import type { VideoSource } from '../src/types/generators.js';
import type { FFmpegCommand } from '../src/core/ffmpeg-spawn.js';

const src: VideoSource = { inputPath: 'in.mp4', duration: 30, width: 1920, height: 1080 };
const capture = () => {
  const cmds: FFmpegCommand[] = [];
  return { cmds, onCommand: (c: FFmpegCommand) => cmds.push(c) };
};

// ---------------------------------------------------------------------------
// audio-mix
// ---------------------------------------------------------------------------
describe('buildAudioMixFilter', () => {
  it('ducks music under a voiceover via sidechaincompress', () => {
    const { filterComplex, audioLabel } = buildAudioMixFilter({
      voicePad: '2:a',
      musicPad: '1:a',
      musicVolume: 0.25,
      voiceVolume: 1,
      duck: true,
      threshold: 0.03,
      ratio: 8,
    });
    expect(filterComplex).toContain('sidechaincompress=threshold=0.03:ratio=8');
    expect(filterComplex).toContain('asplit=2[v1][v2]'); // voice split: trigger + mix
    expect(filterComplex).toContain('amix=inputs=2');
    expect(audioLabel).toBe('[aout]');
  });

  it('mixes flat (no sidechain) when duck is off', () => {
    const { filterComplex } = buildAudioMixFilter({
      voicePad: '2:a',
      musicPad: '1:a',
      musicVolume: 0.5,
      voiceVolume: 1,
      duck: false,
      threshold: 0.03,
      ratio: 8,
    });
    expect(filterComplex).not.toContain('sidechaincompress');
    expect(filterComplex).toContain('amix=inputs=2');
  });

  it('passes a single source through anull', () => {
    const { filterComplex } = buildAudioMixFilter({
      voicePad: null,
      musicPad: '1:a',
      musicVolume: 1,
      voiceVolume: 1,
      duck: false,
      threshold: 0.03,
      ratio: 8,
    });
    expect(filterComplex).toContain('anull[aout]');
  });

  it('mixAudio requires music or voiceover (dry-run)', async () => {
    await expect(mixAudio(src, 'out.mp4', { dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('mixAudio dry-run emits a sidechain command for VO+music', async () => {
    const { cmds, onCommand } = capture();
    const r = await mixAudio(src, 'out.mp4', {
      music: 'bed.mp3',
      voiceover: 'vo.mp3',
      dryRun: true,
      onCommand,
    });
    expect(r.ducked).toBe(true);
    expect(cmds[0]!.command).toContain('sidechaincompress');
    expect(cmds[0]!.command).toContain('-c:v copy'); // video not re-encoded
  });
});

// ---------------------------------------------------------------------------
// captions
// ---------------------------------------------------------------------------
describe('caption filters', () => {
  it('escapes Windows paths for the subtitles filter', () => {
    expect(escapeSubtitlePath('C:\\clips\\a.srt')).toBe('C\\:/clips/a.srt');
  });

  it('escapes drawtext metacharacters', () => {
    expect(escapeDrawtext("it's: 50%")).toBe("it\\'s\\: 50\\%");
  });

  it('builds a subtitles filter with force_style', () => {
    const f = buildSubtitlesFilter('C:\\a.srt', 'Fontsize=30');
    expect(f).toBe("subtitles='C\\:/a.srt':force_style='Fontsize=30'");
  });

  it('builds a centered drawtext filter', () => {
    const f = buildDrawtextFilter({
      text: 'Hello',
      fontSize: 32,
      fontColor: 'white',
      outlineWidth: 2,
      outlineColor: 'black',
      position: 'bottom',
    });
    expect(f).toContain("text='Hello'");
    expect(f).toContain('fontsize=32');
    expect(f).toContain('y=h-th-40');
  });

  it('burnSubtitles needs subtitlePath or text', async () => {
    await expect(burnSubtitles(src, 'out.mp4', { dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('burnSubtitles dry-run copies audio and re-encodes video', async () => {
    const { cmds, onCommand } = capture();
    await burnSubtitles(src, 'out.mp4', { text: 'Hi', dryRun: true, onCommand });
    expect(cmds[0]!.command).toContain('drawtext');
    expect(cmds[0]!.command).toContain('-c:a copy');
  });
});

// ---------------------------------------------------------------------------
// transitions (xfade offset maths is the part worth pinning)
// ---------------------------------------------------------------------------
describe('buildXfadeGraph', () => {
  it('computes correct offsets and total duration for 3 clips', () => {
    const g = buildXfadeGraph({
      durations: [5, 5, 5],
      transition: 'fade',
      transitionDuration: 1,
      audio: true,
    });
    // offset_1 = 5 - 1 = 4 ; offset_2 = (5+5) - 1*2 = 8
    expect(g.filterComplex).toContain('offset=4[');
    expect(g.filterComplex).toContain('offset=8[vout]');
    // total = 15 - 1*2 = 13
    expect(g.totalDuration).toBe(13);
    expect(g.audioLabel).toBe('[aout]');
    expect(g.filterComplex).toContain('acrossfade=d=1');
  });

  it('normalizes geometry when width/height supplied', () => {
    const g = buildXfadeGraph({
      durations: [4, 4],
      transition: 'dissolve',
      transitionDuration: 0.5,
      audio: false,
      normalize: { width: 1080, height: 1920, fps: 30 },
    });
    expect(g.filterComplex).toContain('scale=1080:1920');
    expect(g.filterComplex).toContain('fps=30');
    expect(g.audioLabel).toBeNull();
  });

  it('throws with fewer than 2 clips', () => {
    expect(() => buildXfadeGraph({ durations: [5], transition: 'fade', transitionDuration: 1, audio: true })).toThrow();
  });

  it('concatWithTransitions requires >= 2 clips', async () => {
    await expect(concatWithTransitions([src], 'out.mp4', { dryRun: true })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });

  it('concatWithTransitions dry-run builds an xfade command', async () => {
    const { cmds, onCommand } = capture();
    await concatWithTransitions([src, { ...src, inputPath: 'b.mp4' }], 'out.mp4', {
      transition: 'wipeleft',
      duration: 0.5,
      dryRun: true,
      onCommand,
    });
    expect(cmds[0]!.command).toContain('xfade=transition=wipeleft');
  });
});

// ---------------------------------------------------------------------------
// reframe
// ---------------------------------------------------------------------------
describe('buildReframeFilter', () => {
  it('blur-pad is a complex graph with a [vout] map', () => {
    const { filter, complex } = buildReframeFilter('blur-pad', 1080, 1920, { blur: 20 });
    expect(complex).toBe(true);
    expect(filter).toContain('boxblur=20');
    expect(filter).toContain('overlay=(W-w)/2:(H-h)/2');
    expect(filter).toContain('[vout]');
  });

  it('crop is a simple -vf chain', () => {
    const { filter, complex } = buildReframeFilter('crop', 1080, 1080);
    expect(complex).toBe(false);
    expect(filter).toContain('force_original_aspect_ratio=increase');
    expect(filter).toContain('crop=1080:1080');
  });

  it('exposes 1080-class aspect presets', () => {
    expect(ASPECT_DIMENSIONS['9:16']).toEqual({ width: 1080, height: 1920 });
  });

  it('reframe dry-run defaults to 9:16 blur-pad', async () => {
    const { cmds, onCommand } = capture();
    const r = await reframe(src, 'out.mp4', { dryRun: true, onCommand });
    expect(r.dimensions).toEqual({ width: 1080, height: 1920 });
    expect(cmds[0]!.command).toContain('-filter_complex');
    expect(cmds[0]!.command).toContain('boxblur');
  });
});

// ---------------------------------------------------------------------------
// fade
// ---------------------------------------------------------------------------
describe('buildFadeFilters', () => {
  it('places fade-out relative to duration', () => {
    const { videoFilter, audioFilter } = buildFadeFilters({
      duration: 12,
      fadeIn: 0.5,
      fadeOut: 1,
      color: 'black',
      audio: true,
    });
    expect(videoFilter).toContain('fade=t=in:st=0:d=0.5');
    expect(videoFilter).toContain('fade=t=out:st=11:d=1'); // 12 - 1
    expect(audioFilter).toContain('afade=t=out:st=11:d=1');
  });

  it('omits audio chain when audio is false', () => {
    const { audioFilter } = buildFadeFilters({ duration: 10, fadeIn: 1, fadeOut: 0, color: 'white', audio: false });
    expect(audioFilter).toBe('');
  });

  it('fade requires at least one of fadeIn/fadeOut', async () => {
    await expect(fade(src, 'out.mp4', { dryRun: true })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
});

// ---------------------------------------------------------------------------
// extractFrameAt
// ---------------------------------------------------------------------------
describe('extractFrameAt', () => {
  it('rejects timestamps beyond duration', async () => {
    await expect(extractFrameAt(src, 999, 'f.png', { dryRun: true })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });

  it('dry-run builds a single-frame fast-seek command', async () => {
    const { cmds, onCommand } = capture();
    const r = await extractFrameAt(src, 7.9, 'f.png', { dryRun: true, onCommand });
    expect(r.timestamp).toBe(7.9);
    expect(cmds[0]!.args).toContain('-frames:v');
    // -ss before -i (fast seek)
    const a = cmds[0]!.args;
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'));
  });
});
