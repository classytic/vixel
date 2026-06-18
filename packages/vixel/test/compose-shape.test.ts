/**
 * Shape rasterization — resvg renders a shape overlay to a placed PNG, and the
 * compose graph composites it like an image overlay (placement + fade + slide).
 */
import { describe, it, expect } from 'vitest';
import { rasterizeShape } from '../src/compose/shape-raster.js';
import { buildComposeGraph, collectOverlays } from '../src/compose/graph.js';
import type { VisualClip, ShapeMedia, VixelSpec } from '../src/compose/schema.js';

const cardMedia: ShapeMedia = {
  kind: 'shape',
  shape: 'roundedRect',
  fill: { color: '#FFFFFF', opacity: 0.1 },
  cornerRadius: 24,
};
const card: VisualClip = {
  media: cardMedia,
  at: 1,
  duration: 3,
  transform: { frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 } },
  enter: 'slideUp',
  exit: 'fadeOut',
};
/** Override the shape's media fields (e.g. shadow/backdrop/shape). */
const withMedia = (patch: Partial<ShapeMedia>): VisualClip => ({ ...card, media: { ...cardMedia, ...patch } });

describe('rasterizeShape', () => {
  it('renders to a PNG sized + placed at the frame (no shadow → no padding)', async () => {
    const r = await rasterizeShape(card, 1000, 1000);
    expect(r.xPx).toBe(100);
    expect(r.yPx).toBe(200);
    expect(r.wPx).toBe(500);
    expect(r.hPx).toBe(300);
    expect(r.data[0]).toBe(0x89); // PNG signature
    expect(r.data[1]).toBe(0x50);
  });

  it('pads for a shadow and shifts the placement outward', async () => {
    const r = await rasterizeShape(
      withMedia({ shadow: { blur: 40, y: 8, color: '#000000', opacity: 0.3 } }),
      1000,
      1000,
    );
    expect(r.xPx).toBeLessThan(100); // padded left of the frame
    expect(r.wPx).toBeGreaterThan(500); // png grew by 2×pad
  });

  it('emits a silhouette mask + crop box for a frosted (backdrop) shape', async () => {
    const r = await rasterizeShape(withMedia({ backdrop: { blur: 24 } }), 1000, 1000);
    expect(r.backdrop).toBeDefined();
    expect(r.backdrop!.blur).toBe(24);
    expect(r.backdrop).toMatchObject({ x: 100, y: 200, w: 500, h: 300 }); // unpadded frame box
    expect(r.backdrop!.mask[0]).toBe(0x89); // mask is a PNG
    expect(r.backdrop!.mask[1]).toBe(0x50);
  });

  it('a line shape has no backdrop (nothing to frost)', async () => {
    const r = await rasterizeShape(withMedia({ shape: 'line', backdrop: { blur: 24 } }), 1000, 1000);
    expect(r.backdrop).toBeUndefined();
  });
});

describe('buildComposeGraph — shape overlay', () => {
  it('composites a rasterized shape as an overlay with a fade alpha + enable window', () => {
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1000, height: 1000, fps: 30 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4 }] },
        { type: 'visual', clips: [card] },
      ],
    };
    const order = collectOverlays(spec).find((l) => l.kind === 'shape')!.order;
    const plan = { clips: [{ source: 'a.mp4', trimStart: 0, duration: 4, volume: 1 }], total: 4, transitions: [] } as never;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      shapePngLayers: [{ order, path: '/tmp/shape.png', xPx: 100, yPx: 200 }],
    });
    // slideUp → x pinned to the PNG placement; y becomes a time-varying slide.
    // (Exact motion is cross-checked numerically against entranceAt in
    // compose-entrance.test.ts — here we only assert the wiring is present.)
    expect(graph.filterComplex).toContain("overlay=x='100':y='(200)+(");
    expect(graph.filterComplex).toContain("enable='between(t,1,4)'");
    expect(graph.filterComplex).toContain('fade=t=in:st=1:d=0.35:alpha=1'); // slide also fades in
    expect(graph.inputs.some((i) => i.source === '/tmp/shape.png')).toBe(true);
  });

  it('emits the frosted-glass backdrop chain (split→crop→boxblur→alphamerge) at the crop box', () => {
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1000, height: 1000, fps: 30 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4 }] },
        { type: 'visual', clips: [withMedia({ backdrop: { blur: 24 } })] },
      ],
    };
    const order = collectOverlays(spec).find((l) => l.kind === 'shape')!.order;
    const plan = { clips: [{ source: 'a.mp4', trimStart: 0, duration: 4, volume: 1 }], total: 4, transitions: [] } as never;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      shapePngLayers: [
        { order, path: '/tmp/shape.png', xPx: 100, yPx: 200, backdrop: { maskPath: '/tmp/mask.png', blur: 24, x: 100, y: 200, w: 500, h: 300 } },
      ],
    });
    expect(graph.filterComplex).toContain('crop=500:300:100:200');
    expect(graph.filterComplex).toContain('boxblur=12:1'); // blur/2, clamped
    expect(graph.filterComplex).toContain('alphamerge');
    expect(graph.inputs.some((i) => i.source === '/tmp/mask.png')).toBe(true);
  });
});
