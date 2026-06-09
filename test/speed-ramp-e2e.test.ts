/**
 * speedRamp() — e2e (real ffmpeg render with optical-flow slow-mo).
 *
 * Ramps a fixture real-time → 0.5x slow-mo → 2x and verifies the output exists,
 * is valid H.264, and has the planned (re-timed) duration.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { speedRamp } from '../src/generators/speed-ramp/generator.js';

const SAMPLE = join(import.meta.dirname, 'samples', '12-clip-accurate-0-3sec.mp4'); // 3.0s
let workDir = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-speedramp-'));
});
afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('speedRamp (real render)', () => {
  it('renders a real-time → slow-mo → fast ramp into one valid MP4', async () => {
    const out = join(workDir, 'ramped.mp4');
    const src = await Source.fromFile(SAMPLE);

    const res = await speedRamp(src, out, {
      segments: [
        { throughSec: 1, speed: 1 }, // 1s real-time      → 1.0s
        { throughSec: 2, speed: 0.5 }, // 1s @ 0.5x slow-mo → 2.0s (minterpolate)
        { throughSec: 3, speed: 2 }, // 1s @ 2x fast       → 0.5s
      ],
      fps: 24,
      preset: 'ultrafast',
      crf: 30,
    });

    expect(res.newDuration).toBeCloseTo(3.5, 5); // 1 + 2 + 0.5
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);

    const probed = await Source.fromFile(out);
    expect(probed.codec).toBe('h264');
    expect(probed.duration).toBeGreaterThan(3); // ~3.5s, allow encoder rounding
  }, 120_000);

  it('dry-run previews the filter_complex without rendering', async () => {
    let args: string[] | undefined;
    const src = Source.fromMetadata('in.mp4', { durationMs: 3000, width: 640, height: 360 });
    await speedRamp(src, join(workDir, 'never.mp4'), {
      segments: [{ throughSec: 3, speed: 0.5 }],
      dryRun: true,
      onCommand: (c) => (args = c.args),
    });
    expect(args).toContain('-filter_complex');
    expect(args).toContain('-an');
    expect(args!.join(' ')).toContain('minterpolate');
  }, 30_000);
});
