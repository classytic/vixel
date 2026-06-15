/**
 * Editor-proxy profile — e2e (real ffmpeg encode + ffprobe verify).
 *
 * Encodes a fixture and asserts the output is a valid, capped, keyframe-regular
 * proxy. Runs in the e2e tier (excluded from the ffmpeg-free unit allowlist).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { editorProxy } from '../src/profiles/editor-proxy.js';

const SAMPLE = join(import.meta.dirname, 'samples', '2-youtube-16x9.mp4');
let workDir: string;

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('editorProxy (real encode)', () => {
  it('produces a capped, valid proxy and reports authoritative metadata', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'vixel-proxy-'));
    const out = join(workDir, 'proxy.mp4');

    const src = await Source.fromFile(SAMPLE);
    const result = await editorProxy(src, out, { crf: 28, preset: 'ultrafast' });

    expect(result.outputPath).toBe(out);
    expect(result.width).toBeGreaterThan(0);
    expect(result.width).toBeLessThanOrEqual(1920);
    expect(result.height).toBeLessThanOrEqual(1080);
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
    expect(result.durationSec).toBeCloseTo(src.duration, 0);
    expect(result.gop).toBe(Math.round((src.fps || 30) * 1));

    // The proxy is itself a valid, probeable source.
    const reprobed = await Source.fromFile(out);
    expect(reprobed.codec).toBe('h264');
  }, 120_000);

  it('dry-run reports the command without encoding', async () => {
    let captured: string[] | undefined;
    const src = await Source.fromFile(SAMPLE);
    const res = await editorProxy(src, '/tmp/never-written.mp4', {
      dryRun: true,
      onCommand: (c) => {
        captured = c.args;
      },
    });
    expect(captured?.[0]).toBe('-i');
    expect(captured).toContain('+faststart');
    // estimated (not probed) dims in dry-run
    expect(res.width).toBeLessThanOrEqual(1920);
  }, 30_000);
});
