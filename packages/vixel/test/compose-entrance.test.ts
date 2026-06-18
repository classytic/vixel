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
import { entranceAt, type OverlayEnter, type OverlayExit } from '@classytic/vixel-schema';
import type { VixelSpec, VisualClip } from '../src/compose/schema.js';

const W = 1000;
const H = 1000;
const AT = 1;
const DUR = 3;
const BASE_X = 100;
const BASE_Y = 200;

/** Evaluate the ffmpeg `overlay` x/y expression subset: t, arithmetic, pow, clip, parens. */
function evalExpr(expr: string, t: number): number {
  const js = expr.replace(/\bclip\(/g, '__clip(').replace(/\bpow\(/g, 'Math.pow(');
  // eslint-disable-next-line no-new-func
  const fn = new Function('t', '__clip', `return ${js};`) as (t: number, c: (x: number, a: number, b: number) => number) => number;
  return fn(t, (x, a, b) => Math.min(Math.max(x, a), b));
}

function emittedXY(enter: OverlayEnter, exit: OverlayExit): { x: string; y: string } {
  const shape: VisualClip = {
    media: { kind: 'shape', shape: 'roundedRect', fill: { color: '#ffffff' } },
    at: AT,
    duration: DUR,
    transform: { frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 } },
    enter,
    exit,
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
