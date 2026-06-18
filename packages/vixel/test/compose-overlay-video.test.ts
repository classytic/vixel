/**
 * Video overlay (picture-in-picture) + clip mute — graph unit tests (no ffmpeg).
 *
 * Unified model: a PiP is just a video clip on a later visual lane whose
 * `transform.frame` is smaller than full-frame. No special overlay type, no width
 * default — a boxless clip fills the canvas; box it via `transform.frame`.
 */

import { describe, it, expect } from 'vitest';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph, collectOverlays } from '../src/compose/graph.js';
import type { VixelSpec, VisualClip } from '../src/compose/schema.js';

const out = { width: 1280, height: 720, fps: 30 };
const base: VisualClip[] = [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 6 }];

function graph(clips: VisualClip[], overlays: VisualClip[], overlayAudio = true) {
  const spec: VixelSpec = {
    version: 1,
    output: out,
    tracks: [
      { type: 'visual', sequential: true, clips },
      { type: 'visual', clips: overlays },
    ],
  };
  const overlayHasAudio = collectOverlays(spec)
    .filter((l) => l.kind === 'video')
    .map((l) => ({ order: l.order, hasAudio: overlayAudio }));
  return buildComposeGraph({ spec, plan: planTimeline(clips), clipHasAudio: clips.map(() => true), overlayHasAudio });
}

/** A PiP-boxed video clip (bottom-right quarter by default). */
const pip = (over: Partial<VisualClip> & { media: VisualClip['media'] }): VisualClip => ({
  at: 0,
  duration: 2,
  transform: { frame: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } },
  ...over,
} as VisualClip);

describe('video overlay (PiP)', () => {
  it('appends the overlay as an input and composites it in an enable window', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 1, duration: 3 })]);
    expect(g.inputs.map((i) => i.source)).toContain('b.mp4');
    expect(g.filterComplex).toContain('trim=start=0:duration=3,setpts=PTS-STARTPTS+1/TB');
    expect(g.filterComplex).toMatch(/overlay=.*enable='between\(t,1,4\)'/);
  });

  it('a boxless PiP fills the full canvas (no width default)', () => {
    const g = graph(base, [{ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2 }]);
    expect(g.filterComplex).toContain('scale=1280:720');
  });

  it('honors media.trimStart (where in the source it begins)', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4', trimStart: 5 }, at: 2, duration: 2 })]);
    expect(g.filterComplex).toContain('trim=start=5:duration=2,setpts=PTS-STARTPTS+2/TB');
  });

  it('a blend-mode overlay (VFX layer) composites full-frame via `blend`, not `overlay`', () => {
    const g = graph(base, [{ media: { kind: 'video', source: 'leak.mp4', blend: 'screen' }, at: 0, duration: 2, transform: { opacity: 0.5 } }]);
    expect(g.filterComplex).toContain('scale=1280:720'); // sized to full canvas
    expect(g.filterComplex).toMatch(/blend=all_mode=screen:all_opacity=0\.5:enable='between\(t,0,2\)'/);
    expect(g.filterComplex).not.toContain('overlay=x='); // not the positioned alpha path
  });

  it('mixes overlay audio into the program (delayed to `at`, program kept at full level)', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 2, duration: 2 })], true);
    expect(g.filterComplex).toContain('adelay=2000|2000');
    expect(g.filterComplex).toContain('amix=inputs=2:normalize=0');
    expect(g.audioLabel).toBe('[aovmix]');
  });

  it('applies overlay volume', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2, volume: 0.5 })], true);
    expect(g.filterComplex).toContain('volume=0.5');
  });

  it('skips overlay audio when muted', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 2, duration: 2, muted: true })], true);
    expect(g.filterComplex).not.toContain('adelay');
    expect(g.audioLabel).toBe('[a0]');
  });

  it('skips overlay audio when the source has none', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2 })], false);
    expect(g.filterComplex).not.toContain('aovmix');
  });

  it('applies a rotate filter (rgba + bbox expansion) when rotation is set', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2, transform: { frame: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, rotation: 90 } })]);
    expect(g.filterComplex).toContain('format=rgba,rotate=1.5708'); // π/2 rad
    expect(g.filterComplex).toMatch(/rotate=[\d.]+:ow=rotw\([\d.]+\):oh=roth\([\d.]+\):c=none/);
  });

  it('emits no rotate filter when rotation is 0 / unset', () => {
    const g = graph(base, [pip({ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2 })]);
    expect(g.filterComplex).not.toContain('rotate=');
  });

  it('cover-fits a video overlay into a box (bottom-half split)', () => {
    const g = graph(base, [{ media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2, transform: { frame: { x: 0, y: 0.5, w: 1, h: 0.5 } } }]);
    // 1280x720 → bottom half box = 1280x360 at (0,360); cover = scale increase + crop
    expect(g.filterComplex).toContain('scale=1280:360:force_original_aspect_ratio=increase,crop=1280:360');
    expect(g.filterComplex).toMatch(/overlay=x=0:y=360/);
  });

  it('stacking is positional: a later clip composites on top (no z-by-kind)', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', sequential: true, clips: base },
        { type: 'visual', clips: [
          { media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 3 },
          { media: { kind: 'text', text: 'hi' }, at: 0, duration: 3 },
        ] },
      ],
    };
    const order = collectOverlays(spec).map((l) => l.kind);
    expect(order).toEqual(['video', 'text']); // array order = compositing order
  });
});

describe('clip transform (unified transform)', () => {
  it('renders a framed clip into a sub-region (cover-fit + pad to canvas)', () => {
    const g = graph([{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3, transform: { frame: { x: 0, y: 0.5, w: 1, h: 0.5 } } }], []);
    expect(g.filterComplex).toContain('scale=1280:360:force_original_aspect_ratio=increase,crop=1280:360');
    expect(g.filterComplex).toContain('pad=1280:720:0:360');
  });

  it('a transform-less clip defaults to cover (fill the frame)', () => {
    const g = graph([{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 }], []);
    expect(g.filterComplex).toContain('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720');
  });

  it('overlay reads transform.frame for its box', () => {
    const g = graph([{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 6 }], [
      { media: { kind: 'video', source: 'b.mp4' }, at: 0, duration: 2, transform: { frame: { x: 0, y: 0, w: 1, h: 0.5 } } },
    ]);
    expect(g.filterComplex).toContain('scale=1280:360:force_original_aspect_ratio=increase,crop=1280:360');
    expect(g.filterComplex).toMatch(/overlay=x=0:y=0/);
  });
});

describe('clip mute', () => {
  it('synthesizes silence for a muted clip instead of using its audio', () => {
    const clips: VisualClip[] = [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3, muted: true }];
    const spec: VixelSpec = { version: 1, output: out, tracks: [{ type: 'visual', sequential: true, clips }] };
    const g = buildComposeGraph({ spec, plan: planTimeline(clips), clipHasAudio: [true] });
    expect(g.filterComplex).toContain('anullsrc');
    expect(g.filterComplex).not.toContain('[0:a]atrim');
  });
});
