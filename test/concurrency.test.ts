/**
 * Concurrency Helper Tests
 */

import { describe, it, expect } from 'vitest';
import { createLimiter, mapWithConcurrency, mapSettled } from '../src/core/concurrency.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createLimiter', () => {
  it('never exceeds the concurrency cap', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active--;
      });

    await Promise.all(Array.from({ length: 6 }, task));
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('rejects concurrency < 1', () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of finish order', async () => {
    const items = [50, 10, 30, 5];
    const result = await mapWithConcurrency(items, 2, async (ms, i) => {
      await delay(ms);
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('rejects on first error (like Promise.all)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('fail-2');
        return n;
      }),
    ).rejects.toThrow('fail-2');
  });
});

describe('mapSettled', () => {
  it('returns all results even when some fail', async () => {
    const results = await mapSettled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('fail-2');
      return n * 10;
    });
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: 10 });
  });
});
