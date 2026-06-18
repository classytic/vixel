/**
 * `.cube` LUT parsing + strip-packing — pure, the verifiable core of the Pixi LUT
 * preview (the GL texture/filter build is browser-only).
 */
import { describe, it, expect } from 'vitest';
import { parseCubeLut, lutToStrip } from './lut.js';

const CUBE = `# a tiny identity-ish LUT
TITLE "test"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

describe('parseCubeLut', () => {
  it('reads LUT_3D_SIZE and N³ RGB triples, skipping title/comment lines', () => {
    const { size, data } = parseCubeLut(CUBE);
    expect(size).toBe(2);
    expect(data).toHaveLength(2 * 2 * 2 * 3); // 8 entries × rgb
    expect([...data.slice(0, 3)]).toEqual([0, 0, 0]); // first entry
    expect([...data.slice(3, 6)]).toEqual([1, 0, 0]); // red fastest
  });
});

describe('lutToStrip', () => {
  it('packs into an (N·N)×N RGBA strip with red fastest, blue tiled across', () => {
    const strip = lutToStrip(parseCubeLut(CUBE));
    expect(strip.width).toBe(4); // size·size
    expect(strip.height).toBe(2); // size
    expect(strip.pixels).toHaveLength(4 * 2 * 4);
    // LUT[r=1,g=0,b=0] = (1,0,0) → column b·N+r = 1, row g=0 → pixel index 1
    const px = (1) * 4;
    expect([strip.pixels[px], strip.pixels[px + 1], strip.pixels[px + 2], strip.pixels[px + 3]]).toEqual([255, 0, 0, 255]);
    // LUT[r=0,g=0,b=1] = (0,0,1) → column b·N+r = 2, row 0
    const px2 = 2 * 4;
    expect([strip.pixels[px2], strip.pixels[px2 + 2]]).toEqual([0, 255]);
  });
});
