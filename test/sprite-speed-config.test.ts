/**
 * Sprite + Speed Config Regression Guards
 * =======================================
 * ffmpeg-free: uses `dryRun` + `onCommand` to assert the exact geometry and
 * filter args the generators emit, without spawning ffmpeg.
 *
 * Covers:
 *  - Sprite cell aspect (height / aspectRatio) — no black letterbox for 9:16.
 *  - changeSpeed wiring of videoCodec / crf / maintainPitch.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSprites, changeSpeed } from '../src/index.js';

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'vixel-cfg-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe('generateSprites — cell aspect', () => {
  it('derives a portrait cell from aspectRatio (no letterbox)', async () => {
    await withTmp(async (dir) => {
      const cmds: string[][] = [];
      const r = await generateSprites(
        { inputPath: 'in.mp4', duration: 6 },
        dir,
        {
          interval: 1,
          width: 90,
          aspectRatio: 9 / 16,
          columns: 6,
          dryRun: true,
          onCommand: (c) => cmds.push(c.args),
        }
      );

      // 90 / (9/16) = 160 → full portrait cell, not 90x90 letterboxed.
      expect(r.thumbnailSize).toEqual({ width: 90, height: 160 });
      expect(r.dimensions).toEqual({ width: 540, height: 160 });

      const vf = cmds[0]![cmds[0]!.indexOf('-vf') + 1];
      expect(vf).toContain('scale=90:160');
      expect(vf).toContain('pad=90:160');
    });
  });

  it('honors an explicit height over aspectRatio', async () => {
    await withTmp(async (dir) => {
      const r = await generateSprites(
        { inputPath: 'in.mp4', duration: 4 },
        dir,
        { width: 100, height: 200, aspectRatio: 16 / 9, columns: 4, dryRun: true }
      );
      expect(r.thumbnailSize).toEqual({ width: 100, height: 200 });
    });
  });

  it('defaults to a 16:9 landscape cell when no aspect is given', async () => {
    await withTmp(async (dir) => {
      const r = await generateSprites(
        { inputPath: 'in.mp4', duration: 50 },
        dir,
        { width: 160, columns: 5, dryRun: true }
      );
      expect(r.thumbnailSize).toEqual({ width: 160, height: 90 });
    });
  });
});

describe('changeSpeed — config wiring', () => {
  const argsFor = async (cfg: Record<string, unknown>): Promise<string[]> => {
    let captured: string[] = [];
    await changeSpeed({ inputPath: 'in.mp4', duration: 10 }, 'out.mp4', {
      dryRun: true,
      onCommand: (c) => (captured = c.args),
      ...(cfg as { speed: number }),
    });
    return captured;
  };
  const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  it('preserves pitch by default (atempo) with libx264/crf23', async () => {
    const a = await argsFor({ speed: 2 });
    expect(after(a, '-filter:a')).toBe('atempo=2');
    expect(after(a, '-c:v')).toBe('libx264');
    expect(after(a, '-crf')).toBe('23');
  });

  it('honors videoCodec and crf overrides', async () => {
    const a = await argsFor({ speed: 1.5, videoCodec: 'libx265', crf: 18 });
    expect(after(a, '-c:v')).toBe('libx265');
    expect(after(a, '-crf')).toBe('18');
    expect(after(a, '-filter:a')).toBe('atempo=1.5');
  });

  it('shifts pitch with asetrate when maintainPitch is false', async () => {
    const a = await argsFor({ speed: 2, maintainPitch: false });
    const af = after(a, '-filter:a');
    expect(af).toContain('asetrate=');
    expect(af).toContain('aresample=');
    expect(af).not.toContain('atempo');
  });

  it('chains atempo beyond 2x to stay within filter range', async () => {
    const a = await argsFor({ speed: 4 });
    expect(after(a, '-filter:a')).toBe('atempo=2.0,atempo=2');
  });
});
