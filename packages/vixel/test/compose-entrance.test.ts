/**
 * Cross-renderer entrance PARITY — the contract guard.
 * ====================================================
 * The Pixi preview samples `entranceAt` (schema); the ffmpeg engine compiles the
 * same curve into `overlay` x/y expressions. This test evaluates the ACTUAL
 * emitted ffmpeg expression numerically and asserts it equals `basePx + entranceAt
 * offset` across the whole window — so the two renderers can't silently drift even
 * if someone retunes the easing/curve. (A hardcoded-string assertion would miss
 * that.) Pixel-identical rasterization isn't the contract; identical MOTION is.
 */
import { describe, it, expect } from 'vitest';
import { buildComposeGraph, collectOverlays } from '../src/compose/graph.js';
import {
  entranceAt,
  resolveEntranceOptions,
  type OverlayEnter,
  type OverlayExit,
  type ClipMotionTiming,
  type MotionFeel,
} from '@classytic/vixel-schema';
import type { VixelSpec, VisualClip } from '../src/compose/schema.js';

const W = 1000;
const H = 1000;
const AT = 1;
const DUR = 3;
const BASE_X = 100;
const BASE_Y = 200;

/** Evaluate the ffmpeg `overlay` x/y expression subset: t, arithmetic, pow, clip,
 *  and the eval builtins the easing curves use (if/lt/gte), parens. */
function evalExpr(expr: string, t: number): number {
  const js = expr
    .replace(/\bclip\(/g, '__clip(')
    .replace(/\bpow\(/g, 'Math.pow(')
    .replace(/\bif\(/g, '__if(')
    .replace(/\blt\(/g, '__lt(')
    .replace(/\bgte\(/g, '__gte(');
  // eslint-disable-next-line no-new-func
  const fn = new Function('t', '__clip', '__if', '__lt', '__gte', `return ${js};`) as (
    t: number,
    c: (x: number, a: number, b: number) => number,
    iff: (c: number, a: number, b: number) => number,
    lt: (a: number, b: number) => number,
    gte: (a: number, b: number) => number,
  ) => number;
  return fn(
    t,
    (x, a, b) => Math.min(Math.max(x, a), b),
    (c, a, b) => (c ? a : b),
    (a, b) => (a < b ? 1 : 0),
    (a, b) => (a >= b ? 1 : 0),
  );
}

function emittedXY(enter: OverlayEnter, exit: OverlayExit, motionTiming?: ClipMotionTiming): { x: string; y: string } {
  const shape: VisualClip = {
    media: { kind: 'shape', shape: 'roundedRect', fill: { color: '#ffffff' } },
    at: AT,
    duration: DUR,
    transform: { frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 } },
    enter,
    exit,
    motionTiming,
  };
  const spec: VixelSpec = {
    version: 1,
    output: { width: W, height: H, fps: 30 },
    tracks: [
      { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: DUR + 1 }] },
      { type: 'visual', clips: [shape] },
    ],
  };
  const order = collectOverlays(spec).find((l) => l.kind === 'shape')!.order;
  const plan = { clips: [{ source: 'a.mp4', trimStart: 0, duration: DUR + 1, volume: 1 }], total: DUR + 1, transitions: [] } as never;
  const graph = buildComposeGraph({
    spec,
    plan,
    clipHasAudio: [false],
    shapePngLayers: [{ order, path: '/tmp/s.png', xPx: BASE_X, yPx: BASE_Y }],
  });
  const m = graph.filterComplex.match(/overlay=x='([^']*)':y='([^']*)':enable/);
  expect(m, `expected quoted overlay x/y for ${enter}/${exit}`).toBeTruthy();
  return { x: m![1], y: m![2] };
}

describe('entrance parity — emitted ffmpeg expression == schema entranceAt', () => {
  const combos: Array<[OverlayEnter, OverlayExit]> = [
    ['slideUp', 'fadeOut'],
    ['slideLeft', 'fadeOut'],
    ['slideRight', 'slideDown'],
    ['slideUp', 'slideDown'],
  ];
  const samples = [0, 0.1, 0.2, 0.35, 0.5, 1.5, 2.7, 2.85, 3.0]; // localT across enter, hold, exit

  for (const [enter, exit] of combos) {
    it(`${enter} → ${exit}: ffmpeg x/y track entranceAt within 0.001px`, () => {
      const { x, y } = emittedXY(enter, exit);
      for (const lt of samples) {
        const e = entranceAt(enter, exit, lt, DUR);
        expect(evalExpr(x, AT + lt)).toBeCloseTo(BASE_X + e.dx * W, 3);
        expect(evalExpr(y, AT + lt)).toBeCloseTo(BASE_Y + e.dy * H, 3);
      }
    });
  }
});

// The motionTiming (feel) contract: the SAME resolved EntranceOptions drive the Pixi
// path and the ffmpeg expression, so a Snappy/Bouncy/… slide tracks `entranceAt(opts)`
// in both. This guards the new server-render parity (durations + selectable easing
// incl. the piecewise easeOutBounce / easeOutExpo curves).
describe('motion-feel parity — emitted ffmpeg expression == schema entranceAt(resolved opts)', () => {
  const feels: MotionFeel[] = ['snappy', 'smooth', 'bouncy', 'gentle'];
  // Dense sampling across the (now feel-dependent) enter/exit ramps + the hold.
  const samples = [0, 0.05, 0.1, 0.18, 0.25, 0.4, 0.55, 0.75, 1.5, 2.4, 2.6, 2.8, 2.95, 3.0];

  // Sub-pixel tolerance: `gain()` quantizes coefficients to 3 decimals (≈1px on a
  // 1000px canvas) and the steep expo/bounce curves amplify the float error of the
  // expression's `(t-at)` at the ramp boundary. ≤0.5px is imperceptible; a WRONG curve
  // (e.g. linear where bounce is expected) diverges by tens of px, so this still bites.
  const TOL_PX = 0.5;
  const near = (got: number, want: number, label: string) =>
    expect(Math.abs(got - want), `${label}: ${got} vs ${want}`).toBeLessThanOrEqual(TOL_PX);

  for (const feel of feels) {
    it(`feel="${feel}" (slideUp → slideDown): ffmpeg slide tracks entranceAt within ${TOL_PX}px`, () => {
      const timing: ClipMotionTiming = { feel };
      const opts = resolveEntranceOptions(timing);
      const { x, y } = emittedXY('slideUp', 'slideDown', timing);
      for (const lt of samples) {
        const e = entranceAt('slideUp', 'slideDown', lt, DUR, opts);
        near(evalExpr(x, AT + lt), BASE_X + e.dx * W, `x@${lt}`);
        near(evalExpr(y, AT + lt), BASE_Y + e.dy * H, `y@${lt}`);
      }
    });
  }

  it('explicit Speed (inDur/outDur) override reaches the ffmpeg ramp', () => {
    const timing: ClipMotionTiming = { feel: 'smooth', inDur: 0.2, outDur: 0.2 };
    const opts = resolveEntranceOptions(timing);
    const { y } = emittedXY('slideUp', 'slideDown', timing);
    // Mid-enter at t = AT + 0.1 (halfway through the overridden 0.2s ramp) — the
    // override must be honoured, not smooth's default 0.5s.
    near(evalExpr(y, AT + 0.1), BASE_Y + entranceAt('slideUp', 'slideDown', 0.1, DUR, opts).dy * H, 'speed-override');
  });
});
