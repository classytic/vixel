import { describe, it, expect } from 'vitest';
import { gopInterval, yieldToScheduler, waitEncoderQueue } from './scheduler.js';

describe('export/scheduler', () => {
  it('gopInterval ~ 3s, floored, min 1', () => {
    expect(gopInterval(30)).toBe(90);
    expect(gopInterval(24)).toBe(72);
    expect(gopInterval(0)).toBe(1); // never 0 — keyframe needed
  });

  it('yieldToScheduler resolves (macrotask)', async () => {
    let after = false;
    const p = yieldToScheduler().then(() => (after = true));
    expect(after).toBe(false); // not synchronous
    await p;
    expect(after).toBe(true);
  });

  it('waitEncoderQueue returns immediately when at/below the limit', async () => {
    let waited = false;
    await waitEncoderQueue({ encodeQueueSize: 3 }, 5).then(() => (waited = true));
    expect(waited).toBe(true);
  });

  it('waitEncoderQueue blocks until the queue drains below the limit', async () => {
    let q = 40;
    const encoder = { get encodeQueueSize() { return q; } };
    const drainer = setInterval(() => { q = Math.max(0, q - 8); }, 1);
    await waitEncoderQueue(encoder, 5);
    clearInterval(drainer);
    expect(q).toBeLessThanOrEqual(5);
  });
});
