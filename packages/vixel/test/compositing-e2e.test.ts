/**
 * Compositing primitives — e2e (real ffmpeg renders of blend / chromaKey / mask).
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Source } from '../src/primitives/source.js';
import { blend } from '../src/compositing/blend.js';
import { chromaKey } from '../src/compositing/chroma-key.js';
import { mask } from '../src/compositing/mask.js';

const exec = promisify(execFile);
let workDir = '';
let fg = '', bg = '', a = '', b = '';

const lavfi = (out: string, src: string, vf?: string) =>
  exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', src, ...(vf ? ['-vf', vf] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-comp-'));
  fg = join(workDir, 'fg.mp4'); // green screen with a red box subject
  bg = join(workDir, 'bg.mp4');
  a = join(workDir, 'a.mp4');
  b = join(workDir, 'b.mp4');
  await lavfi(fg, 'color=c=0x00FF00:s=320x240:d=2:r=24', 'drawbox=x=110:y=80:w=100:h=80:color=red:t=fill');
  await lavfi(bg, 'color=c=0x1020FF:s=320x240:d=2:r=24');
  await lavfi(a, 'testsrc2=s=320x240:d=2:r=24');
  await lavfi(b, 'color=c=gray:s=320x240:d=2:r=24');
}, 60_000);

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('compositing (real render)', () => {
  it('chromaKey composites the keyed foreground over the background', async () => {
    const out = join(workDir, 'keyed.mp4');
    const res = await chromaKey(await Source.fromFile(fg), await Source.fromFile(bg), out, {
      color: '00FF00', similarity: 0.2, preset: 'ultrafast', crf: 30,
    });
    expect(res.color).toBe('00FF00');
    const probed = await Source.fromFile(out);
    expect(probed.codec).toBe('h264');
    expect(probed.width).toBe(320);
  }, 120_000);

  it('blend composites two layers with a screen mode', async () => {
    const out = join(workDir, 'blended.mp4');
    const res = await blend(await Source.fromFile(a), await Source.fromFile(b), out, {
      mode: 'screen', opacity: 0.8, preset: 'ultrafast', crf: 30,
    });
    expect(res.mode).toBe('screen');
    expect(await access(out).then(() => true).catch(() => false)).toBe(true);
    expect((await Source.fromFile(out)).codec).toBe('h264');
  }, 120_000);

  it('mask cuts a circular alpha (alpha-preserving output)', async () => {
    const out = join(workDir, 'masked.mov');
    const res = await mask(await Source.fromFile(a), out, { shape: 'circle', feather: 0.06 });
    expect(res.shape).toBe('circle');
    // verify the geq rendered AND the output carries an alpha channel
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'csv=p=0', out,
    ]);
    expect(stdout).toContain('qtrle');
    expect(stdout).toMatch(/rgba|argb|bgra/); // alpha preserved
  }, 120_000);
});
