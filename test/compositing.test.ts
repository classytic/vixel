/**
 * Compositing primitives — golden unit tests (pure filters + descriptors).
 */

import { describe, it, expect } from 'vitest';
import { buildBlendFilter, blendDescriptor, BLEND_MODES } from '../src/compositing/blend.js';
import { buildChromaKeyGraph, chromaKeyDescriptor } from '../src/compositing/chroma-key.js';
import { buildMaskFilter, maskDescriptor } from '../src/compositing/mask.js';
import { COMPOSITING_DESCRIPTORS } from '../src/compositing/index.js';

describe('buildBlendFilter', () => {
  it('scales the overlay to the base and blends with the mode + opacity', () => {
    const f = buildBlendFilter({ mode: 'screen', opacity: 0.8, width: 1280, height: 720 });
    expect(f).toContain('[1:v]scale=1280:720,format=rgba[ov]');
    expect(f).toContain('blend=all_mode=screen:all_opacity=0.8');
    expect(f).toContain('[vout]');
  });
});

describe('buildChromaKeyGraph', () => {
  it('keys the fg color then overlays it over the bg at output size', () => {
    const f = buildChromaKeyGraph({ color: '00FF00', similarity: 0.12, blend: 0.05, width: 1080, height: 1920 });
    expect(f).toContain('chromakey=0x00FF00:0.12:0.05[ked]');
    expect(f).toContain('[1:v]scale=1080:1920[bg]');
    expect(f).toContain('[bg][ked]overlay=shortest=1');
  });
});

describe('buildMaskFilter', () => {
  it('sets a circular alpha via geq (commas escaped inside the expr)', () => {
    const f = buildMaskFilter({ shape: 'circle', feather: 0.04 });
    expect(f).toContain('format=rgba,geq=');
    expect(f).toContain('hypot(X-W/2\\,Y-H/2)'); // circle distance, comma escaped
    expect(f).toContain('clip(');
    expect(f).toContain('/0.04\\,0\\,1)'); // feather ramp
  });
  it('uses a normalized ellipse distance for the ellipse shape', () => {
    const f = buildMaskFilter({ shape: 'ellipse', feather: 0.1 });
    expect(f).toContain('hypot((X-W/2)/(W/2)\\,(Y-H/2)/(H/2))');
  });
  it('clamps feather away from zero (no divide-by-zero)', () => {
    expect(buildMaskFilter({ shape: 'circle', feather: 0 })).toContain('/0.001\\,0\\,1)');
  });
});

describe('descriptors (the data contract)', () => {
  it('every compositing primitive carries a well-formed descriptor', () => {
    for (const d of COMPOSITING_DESCRIPTORS) {
      expect(d.id).toMatch(/^vixel\.compositing\./);
      expect(['source', 'filter', 'mixer2', 'mixer3']).toContain(d.arity);
      expect(d.params.length).toBeGreaterThan(0);
      for (const p of d.params) {
        expect(p.name).toBeTruthy();
        expect(p.default).not.toBeUndefined();
      }
    }
  });
  it('blend + chromaKey are mixer2 (two inputs); mask is a filter (one input)', () => {
    expect(blendDescriptor.arity).toBe('mixer2');
    expect(blendDescriptor.inputs).toHaveLength(2);
    expect(chromaKeyDescriptor.arity).toBe('mixer2');
    expect(maskDescriptor.arity).toBe('filter');
    expect(maskDescriptor.inputs).toHaveLength(1);
  });
  it('blend mode choice options match BLEND_MODES', () => {
    const modeParam = blendDescriptor.params.find((p) => p.name === 'mode');
    expect(modeParam?.options).toEqual(BLEND_MODES);
  });
});
