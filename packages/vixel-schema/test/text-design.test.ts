import { describe, it, expect } from 'vitest';
import {
  resolveTextDesign,
  isLayeredDesign,
  solidColorOf,
  textDesignToFlatStyle,
  listTextPresets,
  getTextPreset,
  registerTextPreset,
  type TextStyle,
} from '../src/index.js';

describe('resolveTextDesign — flat legacy → one normalized stack (backward compat)', () => {
  it('a bare style resolves to a single white solid fill, no strokes/shadows', () => {
    const d = resolveTextDesign(undefined);
    expect(d.fills).toEqual([{ fill: { type: 'solid', color: '#ffffff' } }]);
    expect(d.strokes).toEqual([]);
    expect(d.shadows).toEqual([]);
    expect(d.paintOrder).toBe('fill-stroke');
    expect(isLayeredDesign(d)).toBe(false);
  });

  it('lifts flat fillColor + stroke into the stack', () => {
    const d = resolveTextDesign({ fillColor: '#ff0000', stroke: { width: 4, color: '#000' } });
    expect(d.fills[0]!.fill).toEqual({ type: 'solid', color: '#ff0000' });
    expect(d.strokes).toEqual([{ color: '#000', width: 4 }]);
  });

  it('maps flat shadow (offset) and glow (centered, blurred) into shadows', () => {
    const d = resolveTextDesign({
      shadow: { depth: 3, color: '#000', blur: 2 },
      glow: { color: '#0ff', sigma: 8, intensity: 0.8 },
    });
    expect(d.shadows).toEqual([
      { color: '#000', dx: 3, dy: 3, blur: 2 },
      { color: '#0ff', dx: 0, dy: 0, blur: 8, opacity: 0.8 },
    ]);
  });

  it('layered fields WIN over flat ones when present', () => {
    const style: TextStyle = {
      fillColor: '#ff0000', // ignored
      fills: [
        { fill: { type: 'solid', color: '#111' }, dx: 0.05, dy: 0.05 },
        { fill: { type: 'linear', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#aaa' }] } },
      ],
      strokes: [{ color: '#000', width: 6 }, { color: '#fff', width: 2 }],
    };
    const d = resolveTextDesign(style);
    expect(d.fills).toHaveLength(2);
    expect(d.fills[1]!.fill.type).toBe('linear');
    expect(d.strokes).toHaveLength(2);
    expect(isLayeredDesign(d)).toBe(true); // gradient + multi-stroke + offset
  });
});

describe('text presets — BYO registry + layered + motion bundle', () => {
  it('built-in catalog includes layered looks that carry a motion bundle', () => {
    const pop3d = getTextPreset('pop-3d');
    expect(pop3d).toBeDefined();
    expect(pop3d!.style.fills).toHaveLength(2); // 3D extrude + face
    expect(pop3d!.motion?.enter).toBe('popIn');
    // and the layered style resolves cleanly through the unifying contract.
    expect(isLayeredDesign(resolveTextDesign(pop3d!.style))).toBe(true);
  });

  it('a registered BYO preset is listed and resolvable', () => {
    registerTextPreset({ id: 'byo-test', name: 'BYO', style: { fillColor: '#abcdef' } });
    expect(getTextPreset('byo-test')?.name).toBe('BYO');
    expect(listTextPresets().some((p) => p.id === 'byo-test')).toBe(true);
  });
});

describe('textDesignToFlatStyle — degrade layered → flat (ffmpeg/libass tier)', () => {
  it('solidColorOf: gradient → dominant (mid) stop, texture → white', () => {
    expect(solidColorOf({ type: 'linear', stops: [{ offset: 0, color: '#fff' }, { offset: 0.5, color: '#abc' }, { offset: 1, color: '#000' }] })).toBe('#abc');
    expect(solidColorOf({ type: 'texture', source: 'x.png' })).toBe('#ffffff');
    expect(solidColorOf({ type: 'solid', color: '#123' })).toBe('#123');
  });

  it('flattens a 3D gradient preset: front gradient → solid fillColor, first stroke kept, layered fields cleared', () => {
    const p = getTextPreset('pop-3d')!; // 2 fills (back dark + white face) + stroke
    const flat = textDesignToFlatStyle(p.style);
    expect(flat.fillColor).toBe('#FFFFFF'); // front (face) solid
    expect(flat.stroke).toEqual({ width: 6, color: '#1F2937' });
    expect(flat.fills).toBeUndefined();
    expect(flat.strokes).toBeUndefined();
    expect(flat.shadows).toBeUndefined();
  });

  it('splits shadows into one offset shadow + one centered glow (neon-bloom has two glows)', () => {
    const flat = textDesignToFlatStyle(getTextPreset('neon-bloom')!.style);
    expect(flat.glow).toBeDefined(); // centered blurred shadow → glow slot
    expect(flat.glow!.color).toBe('#16F0FF');
  });

  it('a plain flat style passes through unchanged (zero-regression)', () => {
    const flat = textDesignToFlatStyle({ fillColor: '#ff0', stroke: { width: 4, color: '#000' }, fontSize: 80 });
    expect(flat.fillColor).toBe('#ff0');
    expect(flat.stroke).toEqual({ width: 4, color: '#000' });
    expect(flat.fontSize).toBe(80);
  });
});
