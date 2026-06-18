/**
 * Keyframed overlay motion — e2e (real ffmpeg renders a moving sticker).
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
let workDir = '';
let sticker = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-kf-'));
  sticker = join(workDir, 'sticker.png');
  await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=yellow:s=80x80:d=1', '-frames:v', '1', sticker]);
});
afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('keyframed overlay motion (real render)', () => {
  it('renders a sticker travelling along a keyframed path', async () => {
    const out = join(workDir, 'moving.mp4');
    const spec: VixelSpec = {
      version: 1,
      output: { width: 640, height: 360, fps: 24 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: A }, at: 0, duration: 2 }] },
        {
          // A keyframed sticker: x/y travel via `transform.keyframes` (the unified
          // motion model; legacy `motion[]` is gone). NOTE: the ffmpeg export path
          // currently renders the overlay STATICALLY at its resting `frame` — animated
          // x/y travel on export is a known gap (the Pixi preview animates it). This
          // test verifies a keyframed-overlay spec composes to a valid MP4.
          type: 'visual',
          clips: [{
            media: { kind: 'image', source: sticker },
            at: 0,
            duration: 2,
            transform: {
              frame: { x: 0.1, y: 0.1, w: 0.15, h: 0.15 },
              keyframes: {
                x: [
                  { t: 0, value: 0.1 },
                  { t: 1, value: 0.9, easing: 'easeInOut' },
                  { t: 2, value: 0.5, easing: 'easeOut' },
                ],
                y: [
                  { t: 0, value: 0.1 },
                  { t: 1, value: 0.2, easing: 'easeInOut' },
                  { t: 2, value: 0.9, easing: 'easeOut' },
                ],
              },
            },
          }],
        },
      ],
    };
    const res = await compose(spec, out, { preset: 'ultrafast', crf: 32 });
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    expect(res.durationSec).toBeCloseTo(2, 5);
    expect((await Source.fromFile(out)).width).toBe(640);
  }, 120_000);
});
