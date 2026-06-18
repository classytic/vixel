import { describe, it, expect } from 'vitest';
import { mulberry32, hashSeed, frameRandom, specSeed } from './random.js';

describe('deterministic randomness', () => {
  it('mulberry32 is deterministic + in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB); // same seed → same sequence
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThan(1);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)()); // different seed → different
  });

  it('hashSeed is stable + differs by string', () => {
    expect(hashSeed('clip-1')).toBe(hashSeed('clip-1'));
    expect(hashSeed('clip-1')).not.toBe(hashSeed('clip-2'));
  });

  it('frameRandom is pure per (seed,frame,salt) and decorrelated across frames/salts', () => {
    expect(frameRandom(1, 10)).toBe(frameRandom(1, 10)); // pure
    expect(frameRandom(1, 10)).not.toBe(frameRandom(1, 11)); // frame
    expect(frameRandom(1, 10, 0)).not.toBe(frameRandom(1, 10, 1)); // salt
  });

  it('specSeed resolves number/string/empty to a stable seed (never time-based)', () => {
    expect(specSeed(7)).toBe(7);
    expect(specSeed('abc')).toBe(hashSeed('abc'));
    expect(specSeed(undefined)).toBe(specSeed(null)); // stable default, deterministic
    expect(specSeed(undefined)).toBe(0x5eed);
  });
});
