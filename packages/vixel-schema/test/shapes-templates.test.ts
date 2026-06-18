/**
 * Shape presets inline self-contained, `place` resolves to a frame on normalize, and
 * the templates emit valid, in-bounds VisualClip[] — the agent's authoring guarantees,
 * on the UNIFIED model (every item is a VisualClip; its kind lives in `media.kind`).
 */
import { describe, it, expect } from 'vitest';
import { normalizeSpec, inlineShapePreset, statCards, titleCard, lowerThird, type VixelSpec, type VisualClip, type Rect } from '../src/index.js';

const out = { width: 1080, height: 1920, fps: 30 };
const frameOf = (c: VisualClip): Rect | undefined => c.transform?.frame;
const within01 = (r: Rect) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe('inlineShapePreset', () => {
  it('inlines the glass preset, drops the style id, explicit fields win', () => {
    const r = inlineShapePreset({ kind: 'shape', style: 'glass', cornerRadius: 8 });
    expect((r as { style?: string }).style).toBeUndefined(); // id dropped → self-contained
    expect(r.shape).toBe('roundedRect'); // from preset
    expect(r.cornerRadius).toBe(8); // explicit override wins over preset's 24
    expect(r.fill).toEqual({ color: '#FFFFFF', opacity: 0.08 }); // from preset
    expect(r.backdrop).toEqual({ blur: 24 });
  });

  it('drops an unknown preset id but keeps explicit fields', () => {
    const r = inlineShapePreset({ kind: 'shape', style: 'nope', shape: 'ellipse' });
    expect((r as { style?: string }).style).toBeUndefined();
    expect(r.shape).toBe('ellipse');
  });
});

describe('templates emit valid in-bounds VisualClip[]', () => {
  it('statCards: shapes + text, every clip in-bounds, cards cascade by stagger', () => {
    const clips = statCards({
      at: 2,
      duration: 6,
      heading: 'designed to detect chronic illness patterns',
      cards: [
        { title: 'Sympathetic/Parasympathetic Balance', grade: 'C', trend: 'down', body: '78/22 dominance' },
        { title: 'Circadian HRV Desynchronization', grade: 'C+', trend: 'down', body: 'HRV peaks at 6PM' },
      ],
      stagger: 0.15,
    });
    expect(clips.length).toBeGreaterThan(0);
    for (const c of clips) {
      const f = frameOf(c);
      if (f) expect(within01(f)).toBe(true);
      expect(c.at).toBeGreaterThanOrEqual(2);
    }
    const cards = clips.filter((c) => c.media.kind === 'shape');
    expect(cards).toHaveLength(2);
    expect(cards[1]!.at).toBeCloseTo(cards[0]!.at + 0.15); // staggered
  });

  it('statCards: the two card backgrounds do not overlap', () => {
    const clips = statCards({ at: 0, duration: 4, cards: [{ title: 'A' }, { title: 'B' }] });
    const [a, b] = clips.filter((c) => c.media.kind === 'shape').map(frameOf) as [Rect, Rect];
    const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
    expect(overlap).toBe(false);
  });

  it('titleCard + lowerThird produce non-empty, in-bounds clips', () => {
    for (const clips of [
      titleCard({ at: 0, duration: 3, title: 'Hello', subtitle: 'World', panelStyle: 'glass' }),
      lowerThird({ at: 0, duration: 3, title: 'Jane Doe', subtitle: 'Cardiologist' }),
    ]) {
      expect(clips.length).toBeGreaterThan(0);
      for (const c of clips) {
        const f = frameOf(c);
        if (f) expect(within01(f)).toBe(true);
      }
    }
  });
});

describe('normalizeSpec over a template is idempotent', () => {
  it('a statCards visual track normalizes idempotently', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [{ type: 'visual', clips: statCards({ at: 1, duration: 5, heading: 'H', cards: [{ title: 'A', grade: 'B+', body: 'x' }, { title: 'C', grade: 'C', body: 'y' }] }) }],
    };
    const once = normalizeSpec(spec);
    expect(normalizeSpec(once)).toEqual(once);
  });
});
