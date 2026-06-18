/**
 * Deterministic randomness — the determinism contract for the whole stack.
 * ========================================================================
 * Spec evaluation MUST be a pure function of `(frame, fps, seed)`. Any "random"
 * effect (jitter, shake phase, particle scatter, grain) MUST derive its values from
 * these helpers — NEVER `Math.random()` / `Date.now()` / `performance.now()`. That's
 * what makes preview === export byte-for-byte across every tier (Pixi preview,
 * headless-Pixi server, the WebCodecs client tier, ffmpeg), makes a given frame
 * always look the same, and makes frame-range re-renders / caching safe.
 *
 * Zero-dependency + pure, so it lives in the schema and is shared by every renderer.
 */

/** mulberry32 — a fast, well-distributed 32-bit seeded PRNG. Returns a generator of
 *  successive floats in [0, 1). Deterministic for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string → a 32-bit seed (so a clip/effect id can seed stably). */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One deterministic value in [0, 1) for a `(seed, frame)` pair — the per-frame
 * random a renderer uses INSTEAD of `Math.random()`. `salt` decorrelates several
 * independent randoms wanted at the same frame (pass a different salt for each).
 */
export function frameRandom(seed: number, frame: number, salt = 0): number {
  const mixed = (seed >>> 0) ^ Math.imul(frame + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  return mulberry32(mixed >>> 0)();
}

/**
 * Resolve a composition's seed from `spec.metadata.seed` (a number, or any string
 * hashed to one). Falls back to a STABLE constant so output is deterministic even
 * when no seed is authored — never `Date.now()`.
 */
export function specSeed(seed: number | string | undefined | null): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === 'string' && seed.length) return hashSeed(seed);
  return 0x5eed;
}
