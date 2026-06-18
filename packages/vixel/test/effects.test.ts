/**
 * Effects — filter-kind resolver unit tests + graph integration (pure, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { registerPack } from '@classytic/vixel-schema';
import { buildEffectsFilter, hasEffect, registerEffect } from '../src/effects/index.js';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph } from '../src/compose/graph.js';
import { BUILTIN_EFFECTS } from '../src/compose/schema.js';
import type { VixelSpec, VisualClip } from '../src/compose/schema.js';

describe('buildEffectsFilter', () => {
  it('returns "" for missing / empty effects', () => {
    expect(buildEffectsFilter(undefined)).toBe('');
    expect(buildEffectsFilter([])).toBe('');
  });

  it('resolves a single builtin to a comma-prefixed filter', () => {
    expect(buildEffectsFilter([{ id: 'grayscale' }])).toBe(',hue=s=0');
    expect(buildEffectsFilter([{ id: 'invert' }])).toBe(',negate');
    expect(buildEffectsFilter([{ id: 'vignette' }])).toBe(',vignette');
  });

  it('chains multiple effects in order', () => {
    expect(buildEffectsFilter([{ id: 'grayscale' }, { id: 'vignette' }])).toBe(',hue=s=0,vignette');
  });

  it('applies params with sane fallbacks', () => {
    expect(buildEffectsFilter([{ id: 'blur', params: { amount: 12 } }])).toBe(',gblur=sigma=12');
    expect(buildEffectsFilter([{ id: 'blur' }])).toBe(',gblur=sigma=8');
    expect(buildEffectsFilter([{ id: 'contrast', params: { amount: 1.4 } }])).toBe(',eq=contrast=1.4');
  });

  it('skips unknown / non-filter ids without emitting a stray comma', () => {
    expect(buildEffectsFilter([{ id: 'nope' }])).toBe('');
    expect(buildEffectsFilter([{ id: 'grayscale' }, { id: 'nope' }])).toBe(',hue=s=0');
  });

  it('every ffmpeg-supported filter builtin has a resolver (coverage vs the catalog)', () => {
    // The catalog is the single source of truth; a gap must be declared via
    // `unsupported: ['ffmpeg']`, never silently missing a resolver.
    for (const e of BUILTIN_EFFECTS.filter((d) => d.kind === 'filter' && !d.unsupported?.includes('ffmpeg'))) {
      expect(hasEffect(e.id), `no ffmpeg resolver for '${e.id}'`).toBe(true);
      expect(buildEffectsFilter([{ id: e.id }])).not.toBe('');
    }
  });

  it('resolves a `lut`-kind PACK effect to ffmpeg lut3d (BYO, no per-id resolver)', () => {
    registerPack({
      id: 'grades',
      name: 'Grades',
      baseUrl: 'D:/luts',
      effects: [{ id: 'grade:teal', name: 'Teal', kind: 'lut', source: 'teal.cube' }],
    });
    expect(buildEffectsFilter([{ id: 'grade:teal' }])).toBe(',lut3d=file=D\\\\:/luts/teal.cube');
  });

  it('resolves a `shader`-kind PACK effect to the libplacebo chain (given a hook path)', () => {
    registerPack({ id: 'sh', name: 'sh', effects: [{ id: 'fx:glitch', name: 'Glitch', kind: 'shader', source: 'vec4 vixelEffect(vec2 uv){return vixelSample(uv);}' }] });
    const paths = new Map([['fx:glitch', 'D:/tmp/h.hook']]);
    expect(buildEffectsFilter([{ id: 'fx:glitch' }], paths)).toBe(',format=yuv420p,hwupload,libplacebo=custom_shader_path=D\\\\:/tmp/h.hook,hwdownload,format=yuv420p');
    // without a written hook path → skipped (no chain), not a crash
    expect(buildEffectsFilter([{ id: 'fx:glitch' }])).toBe('');
  });

  it('registerEffect adds a BYO filter-kind resolver', () => {
    registerEffect('test:tint', (p) => `colorbalance=rs=${p.r ?? 0}`);
    expect(hasEffect('test:tint')).toBe(true);
    expect(buildEffectsFilter([{ id: 'test:tint', params: { r: 0.3 } }])).toBe(',colorbalance=rs=0.3');
  });
});

describe('effects wired into the clip chain', () => {
  function graphFor(clips: VisualClip[]) {
    const s: VixelSpec = { version: 1, output: { width: 1280, height: 720, fps: 30 }, tracks: [{ type: 'visual', sequential: true, clips }] };
    return buildComposeGraph({ spec: s, plan: planTimeline(clips), clipHasAudio: clips.map(() => true) });
  }

  it('splices the effect filter into the per-clip chain before format', () => {
    const g = graphFor([{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3, effects: [{ id: 'grayscale' }] }]);
    expect(g.filterComplex).toContain('fps=30,hue=s=0,format=yuv420p[v0]');
  });

  it('a clip without effects is unchanged', () => {
    const g = graphFor([{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 }]);
    expect(g.filterComplex).toContain('fps=30,format=yuv420p[v0]');
  });
});
