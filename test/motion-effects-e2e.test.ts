/**
 * motionEffect() — e2e (real ffmpeg render of each in-filter effect).
 *
 * Renders glitch / shake / rgb-split / zoom-punch onto a short fixture and
 * verifies each produces a valid H.264 file of the same duration.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { motionEffect } from '../src/generators/motion-effects/generator.js';
import type { MotionEffect } from '../src/generators/motion-effects/types.js';

const SAMPLE = join(import.meta.dirname, 'samples', '12-clip-accurate-0-3sec.mp4'); // 3.0s
let workDir = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-fx-'));
});
afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('motionEffect (real render)', () => {
  const effects: MotionEffect[] = ['glitch', 'shake', 'rgb-split', 'zoom-punch'];

  it.each(effects)('renders "%s" to a valid MP4', async (effect) => {
    const out = join(workDir, `${effect}.mp4`);
    const src = await Source.fromFile(SAMPLE);
    const res = await motionEffect(src, out, { effect, intensity: 0.6, preset: 'ultrafast', crf: 30 });

    expect(res.effect).toBe(effect);
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    const probed = await Source.fromFile(out);
    expect(probed.codec).toBe('h264');
    expect(probed.duration).toBeGreaterThan(2.5); // ~3s preserved
  }, 120_000);

  it('rejects zoom-punch when source dims are unknown', async () => {
    const noDims = Source.fromMetadata('in.mp4', { durationMs: 3000 });
    await expect(
      motionEffect(noDims, join(workDir, 'x.mp4'), { effect: 'zoom-punch', dryRun: true }),
    ).rejects.toThrow(/width\/height/);
  }, 30_000);
});
