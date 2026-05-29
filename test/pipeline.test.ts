/**
 * VideoPipeline Tests (dry-run / abort — no ffmpeg binary required)
 *
 * Uses transform steps that don't require ffprobe when a duration is supplied,
 * so the whole pipeline can be planned without invoking ffmpeg.
 */

import { describe, it, expect } from 'vitest';
import { pipeline, VideoPipeline } from '../src/pipeline.js';
import { VixelError } from '../src/errors.js';
import type { VideoSource } from '../src/types/generators.js';

const source: VideoSource = { inputPath: 'input.mp4', duration: 30, width: 1920, height: 1080 };

describe('VideoPipeline composition', () => {
  it('is chainable and counts steps', () => {
    const p = pipeline(source).trim({ start: 0, end: 5 }).speed({ speed: 2 }).convert({ format: 'webm' });
    expect(p).toBeInstanceOf(VideoPipeline);
    expect(p.length).toBe(3);
  });

  it('throws when run with no steps', async () => {
    await expect(pipeline(source).run('out.mp4')).rejects.toBeInstanceOf(VixelError);
  });
});

describe('VideoPipeline.toCommands (dry-run)', () => {
  it('plans one ffmpeg command per step without executing', async () => {
    const commands = await pipeline(source)
      .trim({ start: 0, end: 10 })
      .speed({ speed: 2 })
      .convert({ format: 'mp4' })
      .filter({ videoFilter: 'eq=contrast=1.2' })
      .toCommands('out.mp4');

    expect(commands).toHaveLength(4);
    for (const c of commands) {
      expect(c.command).toContain('ffmpeg');
      expect(Array.isArray(c.args)).toBe(true);
    }
  });

  it('routes the final step to the requested output path', async () => {
    const commands = await pipeline(source)
      .trim({ start: 0, end: 10 })
      .convert({ format: 'mp4' })
      .toCommands('FINAL_OUTPUT.mp4');

    const last = commands[commands.length - 1]!;
    expect(last.command).toContain('FINAL_OUTPUT.mp4');
  });

  it('intermediate steps write to temp paths, not the final output', async () => {
    const commands = await pipeline(source)
      .trim({ start: 0, end: 10 })
      .convert({ format: 'mp4' })
      .toCommands('FINAL_OUTPUT.mp4');

    const first = commands[0]!;
    expect(first.command).not.toContain('FINAL_OUTPUT.mp4');
    expect(first.command).toContain('vixel-');
  });
});

describe('VideoPipeline abort', () => {
  it('rejects when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      pipeline(source, { signal: ac.signal }).trim({ start: 0, end: 5 }).run('out.mp4'),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('VideoPipeline accepts a string source in dry-run', () => {
  it('does not require ffprobe when only planning commands', async () => {
    const commands = await pipeline('some-input.mp4')
      .filter({ videoFilter: 'scale=640:-1' })
      .toCommands('out.mp4');
    expect(commands).toHaveLength(1);
    expect(commands[0]!.command).toContain('scale=640:-1');
  });
});
