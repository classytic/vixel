/**
 * compose() — e2e (real ffmpeg render of a small spec).
 *
 * Renders two fixtures stitched with a dissolve into one MP4 and verifies the
 * output exists, is valid, and has the planned (overlap-shortened) duration.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Source } from '../src/primitives/source.js';
import { compose } from '../src/compose/render.js';
import type { VixelSpec } from '../src/compose/schema.js';

const exec = promisify(execFile);
const A = join(import.meta.dirname, 'samples', '2-youtube-16x9.mp4');
const B = join(import.meta.dirname, 'samples', '3-square-1x1.mp4');
let workDir = '';
let tone = ''; // a generated audio bed (guarantees an audio stream)
let logo = ''; // a generated logo image for overlay tests

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-compose-'));
  tone = join(workDir, 'tone.wav');
  // 6s 220Hz sine @ 44.1k mono — deliberately a DIFFERENT rate/layout than the
  // 48k-stereo program, to prove the audio-format normalization (B1).
  await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6:sample_rate=44100', '-ac', '1', tone]);
  logo = join(workDir, 'logo.png');
  await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=200x80:d=1', '-frames:v', '1', logo]);
});

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('compose (real render)', () => {
  it('stitches two clips with a dissolve into one valid MP4', async () => {
    const out = join(workDir, 'out.mp4');

    const spec: VixelSpec = {
      version: 1,
      output: { width: 854, height: 480, fps: 24 },
      tracks: [
        {
          type: 'visual',
          sequential: true,
          clips: [
            { media: { kind: 'video', source: A }, at: 0, duration: 2 },
            { media: { kind: 'video', source: B }, at: 2, duration: 2 },
          ],
          transitions: [{ between: [0, 1], transition: { id: 'dissolve', duration: 0.5 } }],
        },
      ],
    };

    const res = await compose(spec, out, { preset: 'ultrafast', crf: 30 });

    expect(res.durationSec).toBeCloseTo(3.5, 5); // 2 + 2 − 0.5
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);

    const probed = await Source.fromFile(out);
    expect(probed.codec).toBe('h264');
    expect(probed.width).toBe(854);
    expect(probed.height).toBe(480);
    expect(probed.duration).toBeGreaterThan(3); // ~3.5s, allow encoder rounding
  }, 120_000);

  it('dry-run previews the filter_complex without rendering', async () => {
    let args: string[] | undefined;
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1080, height: 1920, fps: 30 },
      tracks: [{ type: 'visual', sequential: true, clips: [
        { media: { kind: 'video', source: A }, at: 0, duration: 2 },
        { media: { kind: 'video', source: B }, at: 2, duration: 2 },
      ] }],
    };
    await compose(spec, '/tmp/never.mp4', { dryRun: true, onCommand: (c) => (args = c.args) });
    expect(args).toContain('-filter_complex');
    expect(args).toContain('-y');
  }, 30_000);

  it('chains 3 clips with crossfades (label threading + accumulated offset)', async () => {
    const out = join(workDir, 'three.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 640, height: 360, fps: 24 },
      tracks: [{ type: 'visual', sequential: true, clips: [
        { media: { kind: 'video', source: A }, at: 0, duration: 2 },
        { media: { kind: 'video', source: B }, at: 2, duration: 2 },
        { media: { kind: 'video', source: A }, at: 4, duration: 2 },
      ], transitions: [
        { between: [0, 1], transition: { id: 'dissolve', duration: 0.5 } },
        { between: [1, 2], transition: { id: 'wipeleft', duration: 0.5 } },
      ] }],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 32 });
    expect(res.durationSec).toBeCloseTo(5, 5); // 6 − 1.0
    const probed = await Source.fromFile(out);
    expect(probed.duration).toBeGreaterThan(4.5);
  }, 120_000);

  it('mixes + ducks a 44.1k mono bed under 48k program (audio normalization)', async () => {
    const out = join(workDir, 'ducked.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 640, height: 360, fps: 24 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 3 }] },
        { type: 'audio', items: [{ source: tone, role: 'music', gain: 0.5, duck: { amount: -12 } }] },
      ],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 32 });
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    const probed = await Source.fromFile(out);
    expect(probed.hasAudio).toBe(true); // the mixed/ducked audio survived
    expect(res.durationSec).toBeCloseTo(3, 5);
  }, 120_000);

  it('rejects a clip whose trim overruns the source', async () => {
    const spec: VixelSpec = {
      version: 1,
      output: { width: 640, height: 360, fps: 24 },
      tracks: [{ type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 9999 }] }], // way past the fixture
    };
    await expect(compose(spec, join(workDir, 'x.mp4'), { preset: 'ultrafast' })).rejects.toThrow();
  }, 30_000);

  it('renders a clip ken-burns zoom + a fading image overlay (real ffmpeg)', async () => {
    const out = join(workDir, 'animated.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 640, height: 360, fps: 24 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 2, animation: { preset: 'kenBurns', direction: 'in', amount: 0.2 } }] },
        { type: 'visual', clips: [{ media: { kind: 'image', source: logo }, at: 0, duration: 2, transform: { frame: { x: 0.78, y: 0.02, w: 0.2, h: 0.12 } }, enter: 'fadeIn', exit: 'fadeOut' }] },
      ],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 32 });
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    const probed = await Source.fromFile(out);
    expect(probed.width).toBe(640);
    expect(res.durationSec).toBeCloseTo(2, 5);
  }, 120_000);

  it('burns a styled caption text overlay (active-word) in the compose graph', async () => {
    const out = join(workDir, 'captioned.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 854, height: 480, fps: 24 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 2 }] },
        {
          type: 'visual',
          clips: [{
            media: {
              kind: 'text',
              text: 'hi there',
              style: { fontSize: 64, bold: true, fillColor: '#FFFFFF', highlightColor: '#39FF14', animation: 'highlight' },
              cues: [{ text: 'hi there', startMs: 0, endMs: 1500, words: [
                { text: 'hi', startMs: 0, endMs: 750 }, { text: 'there', startMs: 750, endMs: 1500 },
              ] }],
            },
            at: 0,
            duration: 1.5,
            transform: { frame: { x: 0.05, y: 0.8, w: 0.9, h: 0.15 } },
          }],
        },
      ],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 32 });
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    expect(res.durationSec).toBeCloseTo(2, 5);
  }, 120_000);

  it('composites an image/logo overlay (top-right, timed) onto the video', async () => {
    const out = join(workDir, 'overlay.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 854, height: 480, fps: 24 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 3 }] },
        { type: 'visual', clips: [{ media: { kind: 'image', source: logo }, at: 0, duration: 3, transform: { frame: { x: 0.73, y: 0.02, w: 0.25, h: 0.15 } } }] },
      ],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 30 });
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    const probed = await Source.fromFile(out);
    expect(probed.width).toBe(854);
    expect(res.durationSec).toBeCloseTo(3, 5);
  }, 120_000);
});
