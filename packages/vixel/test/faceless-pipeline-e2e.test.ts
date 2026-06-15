/**
 * Faceless reel — FULL integration (real ffmpeg).
 *
 * Runs the BR-OPV-001 render map end to end: stills → motion (kenBurns +
 * parallax3d) → glow → dissolve concat → grade + ducked audio + fades →
 * loudness. Proves every new primitive composes into one final 9:16 reel.
 *
 * Captions burn-in is exercised separately (font/libass dependency) — omitted
 * here to keep the integration deterministic on any box.
 *
 * Uses the committed test.mp4 as the only raw input (frames stand in for the
 * Prism Shinkai stills; its audio stands in for VO + music).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimVideo } from '../src/generators/trim/generator.js';
import { extractFrameAt } from '../src/generators/frame/generator.js';
import { extractAudio } from '../src/generators/audio/generator.js';
import { kenBurns } from '../src/generators/ken-burns/generator.js';
import { parallax3d } from '../src/generators/parallax/generator.js';
import { glow } from '../src/generators/glow/generator.js';
import { concatWithTransitions } from '../src/generators/transitions/generator.js';
import { normalizeLoudness } from '../src/generators/audio/generator.js';
import { pipeline } from '../src/pipeline.js';
import { spawnFFmpeg } from '../src/core/ffmpeg-spawn.js';
import { probeVideo } from '../src/core/probe.js';
import type { VideoSource } from '../src/types/generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = join(__dirname, 'test.mp4');
const OUT = join(__dirname, 'output', 'reel');
const W = 540;
const H = 960; // 9:16, small for speed
const FPS = 24;

let hasFixture = false;
const f = (n: string) => join(OUT, n);

beforeAll(async () => {
  try {
    await fs.access(TEST_VIDEO);
    hasFixture = true;
  } catch {
    return;
  }
  await fs.mkdir(OUT, { recursive: true });

  // Stand-in assets from the fixture.
  await extractFrameAt({ inputPath: TEST_VIDEO, duration: 60 }, 0.5, f('s1.png'), { width: 960 });
  await extractFrameAt({ inputPath: TEST_VIDEO, duration: 60 }, 1.5, f('s2.png'), { width: 960 });
  await extractFrameAt({ inputPath: TEST_VIDEO, duration: 60 }, 2.5, f('s3.png'), { width: 960 });
  await extractFrameAt({ inputPath: TEST_VIDEO, duration: 60 }, 3.5, f('s4.png'), { width: 960 });

  // Depth map for the parallax beat (horizontal gradient stand-in).
  await spawnFFmpeg('ffmpeg', [
    '-y', '-i', f('s2.png'), '-frames:v', '1',
    '-vf', "geq=lum='X/W*255':cb=128:cr=128,format=gray", f('depth.png'),
  ]);

  // VO + music stand-ins (both from the fixture audio).
  const clip = join(OUT, 'aclip.mp4');
  await trimVideo({ inputPath: TEST_VIDEO, duration: 60 }, clip, { start: 0, end: 8, method: 'accurate' });
  await extractAudio({ inputPath: clip, duration: 8 }, f('vo.m4a'), { format: 'aac' });
  await extractAudio({ inputPath: clip, duration: 8 }, f('music.m4a'), { format: 'aac' });
}, 90_000);

afterAll(async () => {
  if (hasFixture) await fs.rm(OUT, { recursive: true, force: true }).catch(() => {});
});

describe('Full faceless reel (real ffmpeg)', () => {
  it('composes stills → motion → glow → dissolve → grade+audio+fade → loudness', async () => {
    if (!hasFixture) return;

    // Beat 1 — hook skyline: Ken Burns push-in + highlight glow.
    await kenBurns(f('s1.png'), f('seg1-kb.mp4'), { duration: 2, direction: 'in', width: W, height: H, fps: FPS });
    await glow({ inputPath: f('seg1-kb.mp4'), duration: 2 }, f('seg1.mp4'), { sigma: 8, intensity: 0.35, highlightsOnly: true });

    // Beat 2 — rooftop: 2.5D parallax + glow.
    await parallax3d(f('s2.png'), f('seg2-px.mp4'), { duration: 2, depthMap: f('depth.png'), mode: 'sway', amplitude: 8, width: W, height: H, fps: FPS });
    await glow({ inputPath: f('seg2-px.mp4'), duration: 2 }, f('seg2.mp4'), { sigma: 8, intensity: 0.3 });

    // Beat 3 — montage: two Ken Burns segments (alt direction).
    await kenBurns(f('s3.png'), f('seg3.mp4'), { duration: 1.5, direction: 'in', width: W, height: H, fps: FPS });
    await kenBurns(f('s4.png'), f('seg4.mp4'), { duration: 1.5, direction: 'out', width: W, height: H, fps: FPS });

    // Join with dissolves (geometry normalized, silent).
    const segs: VideoSource[] = [
      { inputPath: f('seg1.mp4'), duration: 2, width: W, height: H },
      { inputPath: f('seg2.mp4'), duration: 2, width: W, height: H },
      { inputPath: f('seg3.mp4'), duration: 1.5, width: W, height: H },
      { inputPath: f('seg4.mp4'), duration: 1.5, width: W, height: H },
    ];
    const joined = await concatWithTransitions(segs, f('joined.mp4'), {
      transition: 'dissolve', duration: 0.5, width: W, height: H, fps: FPS, audio: false,
    });
    expect(joined.totalDuration).toBeGreaterThan(0);

    // Grade + ducked audio bed + fades.
    await pipeline({ inputPath: f('joined.mp4'), duration: joined.totalDuration, width: W, height: H })
      .glow({ sigma: 6, intensity: 0.25 })
      .adjust({ contrast: 1.05, saturation: 1.15 })
      .mixAudio({ voiceover: f('vo.m4a'), music: f('music.m4a') }) // music ducks under VO
      .fade({ fadeIn: 0.5, fadeOut: 0.8 })
      .run(f('mixed.mp4'));

    // Platform loudness (two-pass).
    const mixedProbe = await probeVideo(f('mixed.mp4'));
    await normalizeLoudness({ inputPath: f('mixed.mp4'), duration: mixedProbe.duration }, f('final.mp4'), { preset: 'youtube' });

    // Final reel exists, is non-trivial, 9:16, and carries audio.
    const finalProbe = await probeVideo(f('final.mp4'));
    expect((await fs.stat(f('final.mp4'))).size).toBeGreaterThan(1000);
    expect(finalProbe.width).toBe(W);
    expect(finalProbe.height).toBe(H);
    expect(finalProbe.hasAudio).toBe(true);
    expect(finalProbe.duration).toBeGreaterThan(4); // ~5.5s after dissolve overlaps
  }, 120_000);
});
