/**
 * spawnFFmpeg Tests (dry-run / abort — no ffmpeg binary required)
 */

import { describe, it, expect } from 'vitest';
import {
  spawnFFmpeg,
  buildCommandString,
  configToSpawnOptions,
  type FFmpegCommand,
} from '../src/core/ffmpeg-spawn.js';
import { AbortError } from '../src/errors.js';

describe('buildCommandString', () => {
  it('quotes args containing whitespace', () => {
    const cmd = buildCommandString('ffmpeg', ['-i', 'my file.mp4', '-y', 'out.mp4']);
    expect(cmd).toBe('ffmpeg -i "my file.mp4" -y out.mp4');
  });
});

describe('configToSpawnOptions', () => {
  it('maps generator config fields onto spawn options', () => {
    const ac = new AbortController();
    const onCommand = () => {};
    const onProgress = () => {};
    const opts = configToSpawnOptions(
      { timeout: 5, signal: ac.signal, dryRun: true, onCommand, onProgress },
      42,
    );
    expect(opts).toMatchObject({ timeout: 5, dryRun: true, duration: 42, onCommand, onProgress });
    expect(opts.signal).toBe(ac.signal);
  });
});

describe('spawnFFmpeg dry-run', () => {
  it('does not spawn a process and reports the command', async () => {
    let captured: FFmpegCommand | null = null;
    await spawnFFmpeg('ffmpeg', ['-i', 'in.mp4', 'out.mp4'], {
      dryRun: true,
      onCommand: (c) => {
        captured = c;
      },
    });
    expect(captured).not.toBeNull();
    expect(captured!.command).toContain('ffmpeg');
    expect(captured!.args).toEqual(['-i', 'in.mp4', 'out.mp4']);
  });
});

describe('spawnFFmpeg abort', () => {
  it('rejects immediately with AbortError when already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      spawnFFmpeg('ffmpeg', ['-i', 'in.mp4', 'out.mp4'], { signal: ac.signal }),
    ).rejects.toBeInstanceOf(AbortError);
  });
});
