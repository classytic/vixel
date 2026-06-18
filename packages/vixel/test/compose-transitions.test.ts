/**
 * Transition presets — golden unit tests (catalog as data + graph resolution).
 */

import { describe, it, expect } from 'vitest';
import { resolveTransitionXfade, registerTransition } from '../src/compose/transitions.js';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph } from '../src/compose/graph.js';
import type { VisualClip, SequenceTransition, VixelSpec } from '../src/compose/schema.js';

describe('resolveTransitionXfade (registry, seeded from BUILTIN_TRANSITIONS)', () => {
  it('resolves catalog ids to their ffmpeg xfade name', () => {
    expect(resolveTransitionXfade('whip-pan')).toBe('smoothleft');
    expect(resolveTransitionXfade('zoom-blur')).toBe('zoomin');
    expect(resolveTransitionXfade('glitch')).toBe('pixelize');
    expect(resolveTransitionXfade('cube')).toBe('slideleft');
  });
  it('keeps the legacy ripple/blur xfade mappings (no silent dissolve regression)', () => {
    expect(resolveTransitionXfade('ripple')).toBe('distance');
    expect(resolveTransitionXfade('blur')).toBe('hblur');
  });
  it('passes raw xfade names straight through; "none" → benign fade', () => {
    expect(resolveTransitionXfade('dissolve')).toBe('dissolve');
    expect(resolveTransitionXfade('wipeleft')).toBe('wipeleft');
    expect(resolveTransitionXfade('none')).toBe('fade');
  });
  it('registers a BYO transition resolver', () => {
    registerTransition('test:swirl', () => 'circleopen');
    expect(resolveTransitionXfade('test:swirl')).toBe('circleopen');
  });
});

describe('compose graph uses a resolved preset', () => {
  it('renders a "zoom-blur" preset as xfade=transition=zoomin', () => {
    const clips: VisualClip[] = [
      { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
      { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 3 },
    ];
    const transitions: SequenceTransition[] = [{ between: [0, 1], transition: { id: 'zoom-blur', duration: 0.5 } }];
    const spec: VixelSpec = { version: 1, output: { width: 1280, height: 720, fps: 30 }, tracks: [{ type: 'visual', sequential: true, clips, transitions }] };
    const g = buildComposeGraph({ spec, plan: planTimeline(clips, undefined, transitions), clipHasAudio: [true, true] });
    expect(g.filterComplex).toContain('xfade=transition=zoomin:duration=0.5');
  });
});
