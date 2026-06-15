/**
 * Glow + Parallax — e2e tier (real ffmpeg). Proves the filtergraphs run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimVideo } from '../src/generators/trim/generator.js';
import { extractFrameAt } from '../src/generators/frame/generator.js';
import { glow } from '../src/generators/glow/generator.js';
import { parallax3d } from '../src/generators/parallax/generator.js';
import { spawnFFmpeg } from '../src/core/ffmpeg-spawn.js';
import { probeVideo } from '../src/core/probe.js';
import type { VideoSource } from '../src/types/generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = join(__dirname, 'test.mp4');
const OUT = join(__dirname, 'output', 'glow-parallax');
const sized = async (p: string) => (await fs.stat(p)).size;

let clip: VideoSource;
let img = '';
let depth = '';
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
  await trimVideo({ inputPath: TEST_VIDEO, duration: 60 }, c, { start: 0, end: 3, method: 'accurate' });
  const p = await probeVideo(c);
  clip = { inputPath: c, duration: p.duration, width: p.width, height: p.height };

  img = join(OUT, 'frame.png');
  await extractFrameAt(clip, 1, img, { width: 640 });

  // Synthesize a horizontal-gradient depth map (left dark/far → right bright/near)
  // so the parallax filtergraph has a real depth input to displace against.
  // Direct ffmpeg call — the png encoder is picked from the extension.
  depth = join(OUT, 'depth.png');
  await spawnFFmpeg('ffmpeg', [
    '-y', '-i', img, '-frames:v', '1',
    '-vf', "geq=lum='X/W*255':cb=128:cr=128,format=gray",
    depth,
  ]);
}, 60_000);

afterAll(async () => {
  if (hasFixture) await fs.rm(OUT, { recursive: true, force: true }).catch(() => {});
});

describe('Glow + Parallax (real ffmpeg)', () => {
  it('glow applies a soft bloom', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'glow.mp4');
    await glow(clip, out, { sigma: 12, intensity: 0.5 });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('glow highlights-only runs', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'glow-hi.mp4');
    await glow(clip, out, { sigma: 10, intensity: 0.6, highlightsOnly: true, threshold: 170 });
    expect(await sized(out)).toBeGreaterThan(0);
  });

  it('parallax3d renders a 2.5D move from image + depth', async () => {
    if (!hasFixture) return;
    const out = join(OUT, 'parallax.mp4');
    const r = await parallax3d(img, out, {
      duration: 2, depthMap: depth, mode: 'sway', amplitude: 10, width: 640, height: 360, fps: 24,
    });
    expect(r.mode).toBe('sway');
    expect(await sized(out)).toBeGreaterThan(0);
  });
});
