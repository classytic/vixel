/**
 * generateSource — e2e (real ffmpeg materializes synthetic sources).
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { generateSource } from '../src/generators/source/index.js';
import type { GeneratorKind } from '../src/core/media-reference.js';

let workDir = '';
beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-gen-'));
});
afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('generateSource (real render)', () => {
  const kinds: GeneratorKind[] = ['color', 'testsrc', 'smptebars'];

  it.each(kinds)('materializes a "%s" generator to a valid clip', async (generator) => {
    const out = join(workDir, `${generator}.mp4`);
    const res = await generateSource(
      { kind: 'generator', generator, ...(generator === 'color' ? { params: { color: 'red' } } : {}) },
      out,
      { width: 320, height: 240, durationSec: 1, fps: 24, preset: 'ultrafast' },
    );
    expect(res.generator).toBe(generator);
    const probed = await Source.fromFile(out);
    expect(probed.codec).toBe('h264');
    expect(probed.width).toBe(320);
    expect(probed.duration).toBeGreaterThan(0.8);
  }, 60_000);
});
