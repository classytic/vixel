/**
 * BoxStyle on the ffmpeg export path — `transform.style` (rounded corners +
 * border + drop shadow) rasterizes to PNG layers (resvg) that the compose graph
 * alphamerges / overlays / underlays, matching the Pixi preview's `applyBoxStyle`.
 */
import { describe, it, expect } from 'vitest';
import { rasterizeBoxStyle } from '../src/compose/box-style-raster.js';
import { buildComposeGraph, collectOverlays } from '../src/compose/graph.js';
import type { VixelSpec, BoxStyle } from '../src/compose/schema.js';

const styledImage = (style: BoxStyle): VixelSpec => ({
  version: 1,
  output: { width: 1000, height: 1000, fps: 30 },
  tracks: [
    { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4 }] },
    {
      type: 'visual',
      clips: [
        {
          media: { kind: 'image', source: 'pic.png' },
          at: 1,
          duration: 3,
          transform: { frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 }, style },
        },
      ],
    },
  ],
});

const plan = { clips: [{ source: 'a.mp4', trimStart: 0, duration: 4, volume: 1 }], total: 4, transitions: [] } as never;

describe('rasterizeBoxStyle', () => {
  it('emits a rounded mask PNG when radius > 0', async () => {
    const r = await rasterizeBoxStyle({ radius: 0.2 }, 500, 300);
    expect(r.mask).toBeDefined();
    expect(r.mask![0]).toBe(0x89); // PNG signature
    expect(r.mask![1]).toBe(0x50);
    expect(r.border).toBeUndefined();
    expect(r.shadow).toBeUndefined();
  });

  it('emits a border PNG when a border is set', async () => {
    const r = await rasterizeBoxStyle({ border: { width: 0.02, color: '#FF0000' } }, 500, 300);
    expect(r.border).toBeDefined();
    expect(r.border![0]).toBe(0x89);
  });

  it('emits a padded shadow PNG carrying its offset + pad', async () => {
    const r = await rasterizeBoxStyle({ shadow: { x: 0, y: 0.04, blur: 0.05 } }, 500, 300);
    expect(r.shadow).toBeDefined();
    expect(r.shadow!.data[0]).toBe(0x89);
    // short = min(500,300) = 300 → offY = round(0.04*300) = 12, blur = 0.05*300 = 15.
    expect(r.shadow!.offY).toBe(12);
    expect(r.shadow!.offX).toBe(0);
    expect(r.shadow!.pad).toBeGreaterThanOrEqual(12); // ≥ |offset|
  });

  it('clamps radius to half the shorter side', async () => {
    const r = await rasterizeBoxStyle({ radius: 5 }, 500, 300);
    expect(r.mask).toBeDefined(); // huge radius still renders (pill), no crash
  });
});

describe('buildComposeGraph — image overlay with BoxStyle', () => {
  it('alphamerges the rounded mask onto the box-exact clip', () => {
    const spec = styledImage({ radius: 0.15 });
    const order = collectOverlays(spec).find((l) => l.kind === 'image')!.order;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      boxStylePngLayers: [{ order, maskPath: '/tmp/mask.png' }],
    });
    const fc = graph.filterComplex;
    // Box px from frameToPx: w=round(0.5*1000)=500, h=round(0.3*1000)=300.
    expect(fc).toContain('scale=500:300:force_original_aspect_ratio=increase,crop=500:300'); // box-exact cover
    expect(fc).toContain('extractplanes=a'); // mask alpha extracted
    expect(fc).toContain('alphamerge'); // rounded corners applied
    expect(graph.inputs.some((i) => i.source === '/tmp/mask.png')).toBe(true);
  });

  it('overlays the border PNG on top of the clip', () => {
    const spec = styledImage({ border: { width: 0.02, color: '#FFFFFF' } });
    const order = collectOverlays(spec).find((l) => l.kind === 'image')!.order;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      boxStylePngLayers: [{ order, borderPath: '/tmp/border.png' }],
    });
    const fc = graph.filterComplex;
    expect(fc).toContain('[bsbi0]'); // border leg scaled to the box
    expect(fc).toMatch(/\[bsbi0\]overlay=0:0/); // border composited over the clip
    expect(graph.inputs.some((i) => i.source === '/tmp/border.png')).toBe(true);
  });

  it('underlays the shadow PNG behind the clip at the box offset', () => {
    const spec = styledImage({ shadow: { x: 0, y: 0.04, blur: 0.04 } });
    const order = collectOverlays(spec).find((l) => l.kind === 'image')!.order;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      boxStylePngLayers: [{ order, shadow: { path: '/tmp/shadow.png', padX: 20, padY: 20, offX: 0, offY: 12 } }],
    });
    const fc = graph.filterComplex;
    // Box top-left = frameToPx → x=100, y=200. Shadow placed at (x-pad+off).
    // x: 100 - 20 + 0 = 80 ; y: 200 - 20 + 12 = 192.
    expect(fc).toContain('overlay=80:192:'); // shadow underlay at the offset box position
    expect(fc).toContain("enable='between(t,1,4)'"); // gated to the clip window
    expect(graph.inputs.some((i) => i.source === '/tmp/shadow.png')).toBe(true);
  });

  it('combines mask + border + shadow in one styled overlay', () => {
    const spec = styledImage({ radius: 0.15, border: { width: 0.02, color: '#FFFFFF' }, shadow: { y: 0.04 } });
    const order = collectOverlays(spec).find((l) => l.kind === 'image')!.order;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      boxStylePngLayers: [
        {
          order,
          maskPath: '/tmp/mask.png',
          borderPath: '/tmp/border.png',
          shadow: { path: '/tmp/shadow.png', padX: 20, padY: 20, offX: 0, offY: 12 },
        },
      ],
    });
    const fc = graph.filterComplex;
    expect(fc).toContain('alphamerge'); // radius
    expect(fc).toMatch(/\[bsbi0\]overlay=0:0/); // border
    expect(fc).toContain('overlay=80:192:'); // shadow underlay
    // the final clip composite still happens (placed at its frame box).
    expect(fc).toContain('[ovv0]');
    // each PNG is its own input.
    expect(graph.inputs.filter((i) => i.source.startsWith('/tmp/')).length).toBe(3);
  });

  it('leaves an UNSTYLED image overlay byte-identical (no box-style stages)', () => {
    const spec = styledImage({}); // empty style object, no boxStylePngLayers provided
    const graph = buildComposeGraph({ spec, plan, clipHasAudio: [false] });
    expect(graph.filterComplex).not.toContain('alphamerge');
    expect(graph.filterComplex).not.toContain('bsbi');
  });
});

describe('buildComposeGraph — video overlay with BoxStyle', () => {
  it('rounds + borders a PiP video clip', () => {
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1000, height: 1000, fps: 30 },
      tracks: [
        { type: 'visual', sequential: true, clips: [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 4 }] },
        {
          type: 'visual',
          clips: [
            {
              media: { kind: 'video', source: 'pip.mp4' },
              at: 0,
              duration: 4,
              transform: { frame: { x: 0.6, y: 0.6, w: 0.3, h: 0.3 }, style: { radius: 0.2, border: { width: 0.02, color: '#000' } } },
            },
          ],
        },
      ],
    };
    const order = collectOverlays(spec).find((l) => l.kind === 'video')!.order;
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio: [false],
      boxStylePngLayers: [{ order, maskPath: '/tmp/m.png', borderPath: '/tmp/b.png' }],
    });
    const fc = graph.filterComplex;
    // PiP box px: w=round(0.3*1000)=300, h=300.
    expect(fc).toContain('scale=300:300:force_original_aspect_ratio=increase,crop=300:300');
    expect(fc).toContain('alphamerge');
    expect(fc).toMatch(/\[bsbi0\]overlay=0:0/);
  });
});
