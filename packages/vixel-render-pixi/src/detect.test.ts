import { describe, it, expect } from 'vitest';
import type { VixelSpec } from '@classytic/vixel-schema';
import { specNeedsPixi } from './detect.js';
import { canRenderWithPixi } from './compose-auto.js';

const base = (tracks: VixelSpec['tracks']): VixelSpec => ({
  version: 1,
  output: { width: 256, height: 256, fps: 30 },
  tracks,
});

describe('specNeedsPixi', () => {
  it('flags a gl-transition (cube) the ffmpeg filtergraph only approximates', () => {
    const spec = base([
      {
        type: 'visual',
        clips: [
          { media: { kind: 'image', source: 'a.png' }, at: 0, duration: 1 },
          { media: { kind: 'image', source: 'b.png' }, at: 1, duration: 1 },
        ],
        transitions: [{ between: [0, 1], transition: { id: 'cube', duration: 0.5 } }],
      },
    ]);
    const r = specNeedsPixi(spec);
    expect(r.needs).toBe(true);
    expect(r.reasons.some((x) => x.includes('cube'))).toBe(true);
  });

  it('does NOT flag a plain fade/wipe (ffmpeg xfade is exact)', () => {
    const spec = base([
      {
        type: 'visual',
        clips: [
          { media: { kind: 'image', source: 'a.png' }, at: 0, duration: 1 },
          { media: { kind: 'image', source: 'b.png' }, at: 1, duration: 1 },
        ],
        transitions: [{ between: [0, 1], transition: { id: 'fade', duration: 0.5 } }],
      },
    ]);
    expect(specNeedsPixi(spec).needs).toBe(false);
  });

  it('flags a shape clip (an ffmpeg gap)', () => {
    const spec = base([
      {
        type: 'visual',
        clips: [{ media: { kind: 'shape', shape: 'rect' }, at: 0, duration: 1 }],
      },
    ]);
    const r = specNeedsPixi(spec);
    expect(r.needs).toBe(true);
    expect(r.reasons).toContain('shape overlay');
  });
});

describe('canRenderWithPixi', () => {
  it('returns a well-formed capability result (and a reason when unavailable)', async () => {
    // Environment-agnostic: a driver may or may not be installed in CI. The contract
    // is a boolean `ok`, plus an actionable `reason` whenever the premium tier is
    // unavailable (so the router can log it before falling back to ffmpeg).
    const cap = await canRenderWithPixi();
    expect(typeof cap.ok).toBe('boolean');
    if (!cap.ok) expect(cap.reason).toBeTruthy();
  });
});
