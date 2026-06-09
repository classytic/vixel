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
        { type: 'video', clips: [{ source: A, duration: 2 }] },
        {
          type: 'overlay',
          items: [{
            kind: 'image', source: sticker, at: 0, duration: 2, width: 0.15,
            motion: [
              { t: 0, x: 0.1, y: 0.1 },
              { t: 1, x: 0.9, y: 0.2, easing: 'easeInOut' },
              { t: 2, x: 0.5, y: 0.9, easing: 'easeOut' },
            ],
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
