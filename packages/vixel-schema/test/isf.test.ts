import { describe, it, expect } from 'vitest';
import { parseIsf, convertIsf } from '../src/isf.js';

// A representative single-pass ISF shader: a float slider, a color input, an extra
// image input, and ISF builtins (isf_FragNormCoord, IMG_THIS_PIXEL, IMG_NORM_PIXEL).
const ISF = `/*{
  "DESCRIPTION": "Tint + mix a second image",
  "CATEGORIES": ["Color"],
  "INPUTS": [
    { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "mask", "TYPE": "image" },
    { "NAME": "invert", "TYPE": "bool", "DEFAULT": false }
  ]
}*/
void main() {
  vec4 c = IMG_THIS_PIXEL(inputImage);
  vec4 m = IMG_NORM_PIXEL(mask, isf_FragNormCoord);
  vec3 col = mix(c.rgb, tint.rgb, amount) * m.rgb;
  if (invert) col = 1.0 - col;
  gl_FragColor = vec4(col, c.a);
}`;

describe('ISF adapter', () => {
  it('parses the JSON header + GLSL body', () => {
    const { meta, glsl } = parseIsf(ISF);
    expect(meta.INPUTS).toHaveLength(4);
    expect(glsl).toContain('gl_FragColor');
  });

  it('converts to a vixel shader descriptor', () => {
    const d = convertIsf(ISF, { id: 'isf:tint', name: 'Tint', surface: 'effect' });
    expect(d.kind).toBe('shader');
    expect(d.unsupported).toContain('ffmpeg');
    // params: float (number) + color + image (texture) + bool. point2D/event excluded.
    const byName = Object.fromEntries((d.params ?? []).map((p) => [p.name, p]));
    expect(byName.amount.type).toBe('number');
    expect(byName.amount.default).toBe(0.5);
    expect(byName.tint.type).toBe('color');
    expect(byName.tint.bind).toBe('literal');
    expect(byName.mask.type).toBe('texture');
    expect(byName.invert.type).toBe('boolean');

    const src = d.source!;
    // canonical entry + no leftover gl_FragColor uses (mapped via #define)
    expect(src).toContain('vec4 vixelEffect(vec2 uv)');
    expect(src).toContain('void isf_main(');
    expect(src).toContain('#define gl_FragColor isf_out_color');
    expect(src).toContain('#define inputImage uTexture');
    // float input rewritten to a live token; bool/color baked as typed #defines
    expect(src).toContain('{{amount}}');
    expect(src).toContain('#define invert false');
    expect(src).toMatch(/#define tint vec4\(/);
    // mask image input → an ISF sampler call that the macro maps to texture(mask, …);
    // vixel declares `uniform sampler2D mask` for the texture param.
    expect(src).toContain('IMG_NORM_PIXEL(mask,');
    expect(src).toContain('#define IMG_NORM_PIXEL(i, c) texture(i, c)');
  });

  it('throws on multi-pass ISF', () => {
    const mp = `/*{ "PASSES": [ {}, {} ], "INPUTS": [] }*/\nvoid main(){ gl_FragColor = vec4(1.0); }`;
    expect(() => convertIsf(mp, { id: 'x' })).toThrow(/multi-pass/i);
  });
});
