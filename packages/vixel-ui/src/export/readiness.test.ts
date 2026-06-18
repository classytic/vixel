import { describe, it, expect } from 'vitest';
import { createReadinessGate, awaitFontsReady } from './readiness.js';

describe('export/readiness gate', () => {
  it('ready() resolves immediately with no outstanding delays', async () => {
    const g = createReadinessGate();
    await expect(g.ready()).resolves.toBeUndefined();
  });

  it('ready() waits until every delay is cleared', async () => {
    const g = createReadinessGate();
    const clearA = g.delay('font');
    const clearB = g.delay('lut');
    expect(g.pending().sort()).toEqual(['font', 'lut']);
    let done = false;
    const p = g.ready().then(() => (done = true));
    clearA();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false); // still one outstanding
    clearB();
    await p;
    expect(done).toBe(true);
    expect(g.pending()).toEqual([]);
  });

  it('ready() rejects with the label if a handle never clears (timeout)', async () => {
    const g = createReadinessGate();
    g.delay('stuck-loader', 20); // never cleared
    await expect(g.ready()).rejects.toThrow(/stuck-loader/);
  });

  it('awaitFontsReady never throws even without the Font Loading API', async () => {
    await expect(awaitFontsReady()).resolves.toBeUndefined();
  });
});
