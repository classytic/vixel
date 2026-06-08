/**
 * Editor-package — e2e (real ffmpeg: proxy + poster + sprite + VTT).
 *
 * Verifies the composition produces all four artifacts, that the proxy is a
 * valid capped clip, the VTT carries scrub cues, the thumbnails are derived
 * from the (capped) proxy, and that vertical sources get portrait sprite cells
 * (the aspect-ratio plumbing — no letterboxed cells).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Source } from '../src/primitives/source.js';
import { editorPackage } from '../src/profiles/editor-package.js';

const LANDSCAPE = join(import.meta.dirname, 'samples', '2-youtube-16x9.mp4');
const PORTRAIT = join(import.meta.dirname, 'samples', '1-reels-9x16.mp4');
const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

const exists = (p: string) => access(p).then(() => true).catch(() => false);
async function work(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'vixel-pkg-'));
  dirs.push(d);
  return d;
}

describe('editorPackage (real composition)', () => {
  it('emits a proxy, poster, sprite sheet, and WebVTT cue map', async () => {
    const out = await work();
    const src = await Source.fromFile(LANDSCAPE);

    const pkg = await editorPackage(src, out, { proxy: { crf: 30, preset: 'ultrafast' } });

    expect(pkg.proxy.outputPath).toBe(join(out, 'proxy.mp4'));
    expect(pkg.proxy.width).toBeLessThanOrEqual(1920);
    expect(await exists(pkg.proxy.outputPath)).toBe(true);
    expect(await exists(pkg.poster.outputPath)).toBe(true);
    expect(await exists(pkg.sprite.imagePath)).toBe(true);
    expect(await exists(pkg.sprite.vttPath)).toBe(true);
    expect(pkg.sprite.thumbnailCount).toBeGreaterThan(0);

    const vtt = await readFile(pkg.sprite.vttPath, 'utf8');
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toMatch(/-->/);
    expect(vtt).toContain('#xywh=');

    // Sprite cells are derived from the CAPPED proxy aspect, not the source.
    expect(pkg.sprite.thumbnailSize.width).toBeGreaterThan(pkg.sprite.thumbnailSize.height);

    const reprobed = await Source.fromFile(pkg.proxy.outputPath);
    expect(reprobed.codec).toBe('h264');
  }, 120_000);

  it('gives a vertical source portrait sprite cells (no letterboxing)', async () => {
    const out = await work();
    const src = await Source.fromFile(PORTRAIT);

    const pkg = await editorPackage(src, out, { proxy: { crf: 30, preset: 'ultrafast' } });

    // 9:16 proxy → taller-than-wide cells.
    expect(pkg.proxy.height).toBeGreaterThan(pkg.proxy.width);
    expect(pkg.sprite.thumbnailSize.height).toBeGreaterThan(pkg.sprite.thumbnailSize.width);
  }, 120_000);
});
