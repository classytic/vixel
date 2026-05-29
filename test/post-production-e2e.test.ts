/**
 * Post-Production Primitives — e2e tier (real ffmpeg).
 *
 * Proves the filtergraphs are actually valid for ffmpeg (not just well-formed
 * strings). Runs on short trimmed clips for speed. singleFork via the e2e
 * project config. Skips on platforms where the fixture/binary is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { trimVideo } from '../src/generators/trim/generator.js';
import { reframe } from '../src/generators/reframe/generator.js';
import { fade } from '../src/generators/fade/generator.js';
import { extractFrameAt } from '../src/generators/frame/generator.js';
import { mixAudio } from '../src/generators/audio-mix/generator.js';
import { concatWithTransitions } from '../src/generators/transitions/generator.js';
import { probeVideo } from '../src/core/probe.js';
import type { VideoSource } from '../src/types/generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = join(__dirname, 'test.mp4');
const OUT = join(__dirname, 'output', 'post-production');

const sized = async (p: string) => (await fs.stat(p)).size;

let clipA: VideoSource;
let clipB: VideoSource;
let hasFixture = false;

beforeAll(async () => {
  try {
    await fs.access(TEST_VIDEO);
    hasFixture = true;
  } catch {
    return;
  }
  await fs.mkdir(OUT, { recursive: true });

  const a = join(OUT, 'clipA.mp4');
  const b = join(OUT, 'clipB.mp4');
  await trimVideo({ inputPath: TEST_VIDEO, duration: 60 }, a, { start: 0, end: 3, method: 'accurate' });
  await trimVideo({ inputPath: TEST_VIDEO, duration: 60 }, b, { start: 3, end: 6, method: 'accurate' });

  const [pa, pb] = await Promise.all([probeVideo(a), probeVideo(b)]);
  clipA = { inputPath: a, duration: pa.duration, width: pa.width, height: pa.height };
  clipB = { inputPath: b, duration: pb.duration, width: pb.width, height: pb.height };
}, 60_000);

afterAll(async () => {
  if (hasFixture) await fs.rm(OUT, { recursive: true, force: true }).catch(() => {});
});

describe('Post-production filtergraphs (real ffmpeg)', () => {
  it('reframe blur-pad produces a valid 9:16 video', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'reframe.mp4');
    const r = await reframe(clipA, out, { aspect: '9:16', mode: 'blur-pad' });
    expect(r.dimensions).toEqual({ width: 1080, height: 1920 });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('reframe crop produces a valid square video', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'reframe-crop.mp4');
    await reframe(clipA, out, { aspect: '1:1', mode: 'crop' });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('fade in/out produces a valid video', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'fade.mp4');
    await fade(clipA, out, { fadeIn: 0.3, fadeOut: 0.3 });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('extractFrameAt writes a PNG', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'frame.png');
    await extractFrameAt(clipA, 1, out);
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('mixAudio layers a music track (ducked) onto a clip', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'mixed.mp4');
    // Use clipB as a "music" source (it carries an audio stream).
    const r = await mixAudio(clipA, out, { music: clipB.inputPath, voiceVolume: 1, musicVolume: 0.3 });
    expect(r.layers).toContain('music');
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('concatWithTransitions xfades two clips', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'xfade.mp4');
    const r = await concatWithTransitions([clipA, clipB], out, {
      transition: 'fade',
      duration: 0.5,
      width: 640,
      height: 360,
      fps: 30,
    });
    expect(r.clipCount).toBe(2);
    expect(await sized(out)).toBeGreaterThan(0);
  });
});
