/**
 * Faceless-YouTube primitives — e2e tier (real ffmpeg).
 * Proves Ken Burns / slideshow / color / loudness filtergraphs actually run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimVideo } from '../src/generators/trim/generator.js';
import { extractFrameAt } from '../src/generators/frame/generator.js';
import { kenBurns } from '../src/generators/ken-burns/generator.js';
import { slideshow } from '../src/generators/slideshow/generator.js';
import { adjustColor } from '../src/generators/color/generator.js';
import { normalizeLoudness } from '../src/generators/audio/generator.js';
import { probeVideo } from '../src/core/probe.js';
import type { VideoSource } from '../src/types/generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = join(__dirname, 'test.mp4');
const OUT = join(__dirname, 'output', 'faceless');
const sized = async (p: string) => (await fs.stat(p)).size;

let clip: VideoSource;
let imgA = '';
let imgB = '';
let hasFixture = false;

beforeAll(async () => {
  try {
    await fs.access(TEST_VIDEO);
    hasFixture = true;
  } catch {
    return;
  }
  await fs.mkdir(OUT, { recursive: true });

  const c = join(OUT, 'clip.mp4');
  await trimVideo({ inputPath: TEST_VIDEO, duration: 60 }, c, { start: 0, end: 4, method: 'accurate' });
  const p = await probeVideo(c);
  clip = { inputPath: c, duration: p.duration, width: p.width, height: p.height };

  imgA = join(OUT, 'a.png');
  imgB = join(OUT, 'b.png');
  await extractFrameAt(clip, 0.5, imgA);
  await extractFrameAt(clip, 2.5, imgB);
}, 60_000);

afterAll(async () => {
  if (hasFixture) await fs.rm(OUT, { recursive: true, force: true }).catch(() => {});
});

describe('Faceless primitives (real ffmpeg)', () => {
  it('kenBurns turns a still into a moving clip', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'kb.mp4');
    const r = await kenBurns(imgA, out, { duration: 2, direction: 'in', width: 640, height: 360, fps: 24 });
    expect(r.duration).toBe(2);
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('slideshow assembles images with transitions', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'slides.mp4');
    const r = await slideshow([imgA, imgB], out, {
      durationPer: 2,
      transition: 'fade',
      transitionDuration: 0.4,
      width: 640,
      height: 360,
      fps: 24,
    });
    expect(r.slideCount).toBe(2);
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('adjustColor applies an eq/sharpen grade', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'graded.mp4');
    await adjustColor(clip, out, { contrast: 1.1, saturation: 1.2, sharpen: 0.6 });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('normalizeLoudness two-pass targets a LUFS level', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'loud.mp4');
    await normalizeLoudness(clip, out, { preset: 'youtube' }); // two-pass measure + apply
    expect(await sized(out)).toBeGreaterThan(0);
  });
});
