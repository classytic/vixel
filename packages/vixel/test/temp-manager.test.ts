/**
 * TempFileManager Tests
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TempFileManager, removeQuietly, outputSize } from '../src/core/temp-manager.js';

const uniqueDir = () => join(tmpdir(), `vixel-test-${process.pid}-${Math.floor(performance.now())}`);

describe('TempFileManager', () => {
  it('cleans up registered files', async () => {
    const base = uniqueDir();
    await fs.mkdir(base, { recursive: true });
    const temp = new TempFileManager();
    const f = temp.file('scratch.txt', base);
    await fs.writeFile(f, 'data');

    expect(await fs.stat(f).then(() => true)).toBe(true);
    await temp.cleanup();
    await expect(fs.stat(f)).rejects.toThrow();

    await removeQuietly(base);
  });

  it('cleanup never throws on missing files', async () => {
    const temp = new TempFileManager();
    temp.register(join(tmpdir(), 'does-not-exist-vixel.bin'));
    await expect(temp.cleanup()).resolves.toBeUndefined();
  });

  it('scoped() cleans up even when the body throws', async () => {
    const base = uniqueDir();
    await fs.mkdir(base, { recursive: true });
    let trackedFile = '';

    await expect(
      TempFileManager.scoped(async (temp) => {
        trackedFile = temp.file('s.txt', base);
        await fs.writeFile(trackedFile, 'x');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(fs.stat(trackedFile)).rejects.toThrow();
    await removeQuietly(base);
  });

  it('dir() creates and tracks a directory', async () => {
    const base = uniqueDir();
    const temp = new TempFileManager();
    const dir = await temp.dir('frames', base);
    expect(await fs.stat(dir).then((s) => s.isDirectory())).toBe(true);
    await temp.cleanup();
    await expect(fs.stat(dir)).rejects.toThrow();
    await removeQuietly(base);
  });
});

describe('outputSize', () => {
  it('returns 0 in dry-run without touching the filesystem', async () => {
    expect(await outputSize('/nonexistent/path.mp4', true)).toBe(0);
  });

  it('returns the real size otherwise', async () => {
    const base = uniqueDir();
    await fs.mkdir(base, { recursive: true });
    const f = join(base, 'f.bin');
    await fs.writeFile(f, Buffer.alloc(123));
    expect(await outputSize(f, false)).toBe(123);
    await removeQuietly(base);
  });
});
