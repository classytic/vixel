/**
 * Editor-package — unit tests for the pure default helpers (no ffmpeg).
 * The full composition is verified in the e2e tier.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { access } from 'node:fs/promises';
import {
  defaultPosterSec,
  defaultSpriteIntervalSec,
  editorPackage,
} from '../src/profiles/editor-package.js';
import { Source } from '../src/primitives/source.js';
import type { VideoMetadata } from '../src/core/probe.js';

const META: VideoMetadata = {
  duration: 12,
  width: 1920,
  height: 1080,
  bitrate: 5000,
  fps: 30,
  codec: 'h264',
  hasAudio: true,
};

describe('defaultPosterSec', () => {
  it('is the clip midpoint, 0 for unknown duration', () => {
    expect(defaultPosterSec(10)).toBe(5);
    expect(defaultPosterSec(0)).toBe(0);
    expect(defaultPosterSec(-3)).toBe(0);
  });
});

describe('defaultSpriteIntervalSec', () => {
  it('keeps the whole clip within one sheet (≤ maxCells)', () => {
    expect(defaultSpriteIntervalSec(10)).toBe(1); // short → 1s gap
    expect(defaultSpriteIntervalSec(605, 121)).toBe(5); // 605/121 → 5s
    expect(defaultSpriteIntervalSec(121, 121)).toBe(1);
    expect(defaultSpriteIntervalSec(0)).toBe(1);
  });

  it('never returns less than 1 second', () => {
    expect(defaultSpriteIntervalSec(5, 121)).toBeGreaterThanOrEqual(1);
  });

  it('the derived interval fits the clip in the sheet', () => {
    for (const duration of [10, 60, 300, 605, 1800]) {
      const interval = defaultSpriteIntervalSec(duration, 121);
      expect(Math.ceil(duration / interval)).toBeLessThanOrEqual(121);
    }
  });
});

describe('editorPackage dryRun (ffmpeg-free)', () => {
  it('writes no files, creates no dir, and previews every step command', async () => {
    const out = join(tmpdir(), `vixel-pkg-dryrun-${Date.now()}`);
    const src = Source.fromMetadata('in.mp4', META);
    const commands: string[][] = [];

    const pkg = await editorPackage(src, out, {
      dryRun: true,
      onCommand: (c) => commands.push(c.args),
    });

    // No disk side effects in dry-run.
    expect(await access(out).then(() => true).catch(() => false)).toBe(false);

    // Proxy + poster + sprite commands were all previewed.
    expect(commands.length).toBeGreaterThanOrEqual(2);
    expect(commands.some((a) => a.includes('+faststart'))).toBe(true); // the proxy
    expect(commands.some((a) => a.some((x) => x.includes('poster.jpg')))).toBe(true);

    // Result still carries the intended paths.
    expect(pkg.proxy.outputPath).toBe(join(out, 'proxy.mp4'));
    expect(pkg.poster.outputPath).toBe(join(out, 'poster.jpg'));
  });
});
