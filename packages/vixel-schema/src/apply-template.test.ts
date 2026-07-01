import { describe, it, expect } from 'vitest';
import { applyCommand } from './commands.js';
import { registerTemplate } from './templates.js';
import type { VixelSpec } from './spec.js';
import type { VisualTrack } from './visual.js';

const blank: VixelSpec = { version: 1, output: { width: 1080, height: 1080, fps: 30 }, tracks: [] };

registerTemplate({
  id: 'test/card',
  name: 'Card',
  description: 'A test scene: a full-bleed background + a headline slot.',
  category: 'scene',
  build: (input) => {
    const i = input as unknown as { headline: string; at: number; duration: number };
    return [
      { media: { kind: 'shape', shape: 'rect', fill: { color: '#000000' } }, at: i.at, duration: i.duration, transform: { frame: { x: 0, y: 0, w: 1, h: 1 } } },
      { media: { kind: 'text', text: i.headline }, at: i.at, duration: i.duration, transform: { frame: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } }, slot: { id: 'headline', kind: 'text' } },
    ];
  },
});

const visual = (s: VixelSpec, i: number) => s.tracks[i] as VisualTrack;

describe('applyTemplate command', () => {
  it('inserts the template as a NEW layered (non-sequential) track with minted ids', () => {
    const next = applyCommand(blank, { type: 'applyTemplate', template: 'test/card', atSec: 0, durationSec: 5, content: { headline: 'Hi' } });
    expect(next).not.toBe(blank);
    expect(next.tracks).toHaveLength(1);
    const t = visual(next, 0);
    expect(t.type).toBe('visual');
    expect(t.sequential).toBeFalsy(); // layered, not butted end-to-end
    expect(t.clips).toHaveLength(2);
    expect(t.clips.every((c) => !!c.id)).toBe(true); // minted → immediately addressable
    expect(t.clips[1]!.slot?.id).toBe('headline');
  });

  it('honors atSec/durationSec on the built clips', () => {
    const next = applyCommand(blank, { type: 'applyTemplate', template: 'test/card', atSec: 2, durationSec: 4, content: { headline: 'Hi' } });
    expect(visual(next, 0).clips[0]!.at).toBe(2);
    expect(visual(next, 0).clips[0]!.duration).toBe(4);
  });

  it('unknown template is a clean no-op (same reference)', () => {
    const next = applyCommand(blank, { type: 'applyTemplate', template: 'does-not-exist' });
    expect(next).toBe(blank);
  });

  it('appends the scene ON TOP of existing tracks (track order = stacking order)', () => {
    const withMain: VixelSpec = {
      ...blank,
      tracks: [{ type: 'visual', sequential: true, clips: [{ id: 'x', media: { kind: 'image', source: 'a' }, at: 0, duration: 5 }] }],
    };
    const next = applyCommand(withMain, { type: 'applyTemplate', template: 'test/card', content: { headline: 'Hi' } });
    expect(next.tracks).toHaveLength(2);
    expect(visual(next, 1).clips).toHaveLength(2); // the scene is the LAST track → on top
    expect(visual(next, 1).sequential).toBeFalsy();
  });
});
