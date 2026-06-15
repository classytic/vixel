/**
 * Captions burn — e2e (real ffmpeg `ass` filter on a fixture).
 *
 * Verifies a preset + word-level cues burn into a valid video. Runs in the e2e
 * tier (needs ffmpeg/libass).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { burnCaptions } from '../src/captions/burn.js';
import type { CaptionCue } from '../src/captions/types.js';

const SAMPLE = join(import.meta.dirname, 'samples', '2-youtube-16x9.mp4');
let workDir = '';

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

const CUES: CaptionCue[] = [
  {
    text: 'hello there world',
    startMs: 0,
    endMs: 1500,
    words: [
      { text: 'hello', startMs: 0, endMs: 500 },
      { text: 'there', startMs: 500, endMs: 1000 },
      { text: 'world', startMs: 1000, endMs: 1500 },
    ],
  },
];

describe('burnCaptions (real ass filter)', () => {
  it('burns a tiktok-bold preset with word timing into a valid video', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'vixel-cap-'));
    const out = join(workDir, 'captioned.mp4');
    const src = await Source.fromFile(SAMPLE);

    const res = await burnCaptions(src, CUES, out, { preset: 'tiktok-bold' });

    expect(res.cueCount).toBe(1);
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);

    // The output is a valid, probeable video of the same dimensions.
    const reprobed = await Source.fromFile(out);
    expect(reprobed.width).toBe(src.width);
    expect(reprobed.height).toBe(src.height);
    expect(reprobed.duration).toBeGreaterThan(0);
  }, 120_000);

  it('dry-run previews the ass filter command without writing', async () => {
    let cmd: string[] | undefined;
    const src = await Source.fromFile(SAMPLE);
    await burnCaptions(src, CUES, '/tmp/never.mp4', {
      dryRun: true,
      style: { animation: 'karaoke' },
      onCommand: (c) => {
        cmd = c.args;
      },
    });
    expect(cmd?.some((a) => a.startsWith('ass='))).toBe(true);
  }, 30_000);
});
