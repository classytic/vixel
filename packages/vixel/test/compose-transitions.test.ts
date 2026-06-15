/**
 * Transition presets — golden unit tests (catalog as data + graph resolution).
 */

import { describe, it, expect } from 'vitest';
import { TRANSITION_PRESETS, resolveXfadeName } from '../src/compose/transitions.js';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph } from '../src/compose/graph.js';
import type { Clip, VixelSpec } from '../src/compose/schema.js';

describe('TRANSITION_PRESETS (data contract)', () => {
  it('every preset maps to a concrete xfade name + advisory duration', () => {
    for (const [name, def] of Object.entries(TRANSITION_PRESETS)) {
      expect(def.xfade, name).toBeTruthy();
      expect(def.defaultDuration, name).toBeGreaterThan(0);
      expect(def.description, name).toBeTruthy();
    }
  });
  it('exposes the CapCut-flavored set', () => {
    expect(Object.keys(TRANSITION_PRESETS).sort()).toEqual(
      ['blur', 'glitch', 'iris', 'radial', 'ripple', 'squeeze', 'whip-pan', 'zoom-blur'].sort(),
    );
  });
});

describe('resolveXfadeName', () => {
  it('maps presets through the catalog', () => {
    expect(resolveXfadeName('whip-pan')).toBe('smoothleft');
    expect(resolveXfadeName('zoom-blur')).toBe('zoomin');
    expect(resolveXfadeName('glitch')).toBe('pixelize');
  });
  it('passes raw xfade names straight through', () => {
    expect(resolveXfadeName('dissolve')).toBe('dissolve');
    expect(resolveXfadeName('wipeleft')).toBe('wipeleft');
  });
  it('turns a "none" overlap into a benign fade', () => {
    expect(resolveXfadeName('none')).toBe('fade');
  });
});

describe('compose graph uses a resolved preset', () => {
  it('renders a "zoom-blur" preset as xfade=transition=zoomin', () => {
    const clips: Clip[] = [
      { source: 'a.mp4', duration: 3, transition: { type: 'zoom-blur', duration: 0.5 } },
      { source: 'b.mp4', duration: 3 },
    ];
    const spec: VixelSpec = { version: 1, output: { width: 1280, height: 720, fps: 30 }, tracks: [{ type: 'video', clips }] };
    const g = buildComposeGraph({ spec, plan: planTimeline(clips), clipHasAudio: [true, true] });
    expect(g.filterComplex).toContain('xfade=transition=zoomin:duration=0.5');
  });
});
