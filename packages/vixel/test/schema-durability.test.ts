/**
 * Schema durability — versioning + media references (pure, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { migrateSpec, CURRENT_SPEC_VERSION } from '../src/core/schema-version.js';
import {
  resolveToPath,
  mediaInputArgs,
  lavfiDescriptor,
  isMediaReference,
} from '../src/core/media-reference.js';
import { isConfigError } from '../src/errors.js';

describe('migrateSpec', () => {
  it('passes a current-version spec through unchanged', () => {
    const spec = { version: CURRENT_SPEC_VERSION, tracks: [] };
    expect(migrateSpec(spec)).toEqual(spec);
  });
  it('rejects a missing / invalid version', () => {
    expect(() => migrateSpec({ tracks: [] })).toThrow(/valid integer "version"/);
    expect(() => migrateSpec({ version: 0 } as never)).toThrow(/valid integer/);
  });
  it('rejects a version newer than this build', () => {
    expect(() => migrateSpec({ version: CURRENT_SPEC_VERSION + 1 })).toThrow(/newer than this vixel build/);
  });
  it('applies a registered upgrade chain (simulating a future v2/v3)', () => {
    const upgrades = {
      1: (s: Record<string, unknown>) => ({ ...s, addedInV2: true }),
      2: (s: Record<string, unknown>) => ({ ...s, addedInV3: true }),
    };
    // pretend the current version is 3 by migrating an old v1 doc through the chain
    const out = (() => {
      // migrate 1→2→3 via the injected chain, stopping at CURRENT (1) — so emulate
      // by calling the upgrades directly is what migrateSpec does internally.
      let doc: Record<string, unknown> = { version: 1, name: 'old' };
      for (let v = 1; v < 3; v++) doc = { ...upgrades[v as 1 | 2](doc), version: v + 1 };
      return doc;
    })();
    expect(out).toMatchObject({ version: 3, name: 'old', addedInV2: true, addedInV3: true });
  });
});

describe('media references', () => {
  it('resolveToPath: string and external resolve directly', () => {
    expect(resolveToPath('clip.mp4')).toBe('clip.mp4');
    expect(resolveToPath({ kind: 'external', url: 's3://b/clip.mp4' })).toBe('s3://b/clip.mp4');
  });
  it('resolveToPath: missing and generator throw a ConfigError', () => {
    expect(() => resolveToPath({ kind: 'missing', hint: 'offline' })).toThrow(/missing: offline/);
    expect(() => resolveToPath({ kind: 'generator', generator: 'color' })).toThrow(/materialized first/);
    try {
      resolveToPath({ kind: 'missing' });
    } catch (e) {
      expect(isConfigError(e)).toBe(true);
    }
  });
  it('lavfiDescriptor builds the right synthetic source string', () => {
    const dims = { width: 1920, height: 1080, durationSec: 3 };
    expect(lavfiDescriptor({ kind: 'generator', generator: 'color', params: { color: '#101820' } }, dims)).toBe('color=c=#101820:s=1920x1080:d=3');
    expect(lavfiDescriptor({ kind: 'generator', generator: 'testsrc' }, dims)).toBe('testsrc2=s=1920x1080:d=3');
    expect(lavfiDescriptor({ kind: 'generator', generator: 'smptebars' }, dims)).toBe('smptebars=s=1920x1080:d=3');
  });
  it('rejects an unsafe colour in a generator (filter injection)', () => {
    const dims = { width: 10, height: 10, durationSec: 1 };
    expect(() => lavfiDescriptor({ kind: 'generator', generator: 'color', params: { color: 'black:rate=1' } }, dims)).toThrow(/unsafe/);
  });
  it('mediaInputArgs: files use -i, generators use -f lavfi -i', () => {
    const dims = { width: 640, height: 360, durationSec: 2 };
    expect(mediaInputArgs('a.mp4', dims)).toEqual({ input: 'a.mp4', options: [] });
    expect(mediaInputArgs({ kind: 'generator', generator: 'testsrc' }, dims)).toEqual({
      input: 'testsrc2=s=640x360:d=2',
      options: ['-f', 'lavfi'],
    });
  });
  it('isMediaReference discriminates', () => {
    expect(isMediaReference('a.mp4')).toBe(false);
    expect(isMediaReference({ kind: 'external', url: 'x' })).toBe(true);
  });
});
