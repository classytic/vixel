import { describe, it, expect } from 'vitest';
import { textDesignToSvg, getTextPreset, type TextStyle } from '../src/index.js';

describe('textDesignToSvg — pure design → SVG projection', () => {
  it('renders a flat style as a single <text> with the fill color + escaped content', () => {
    const svg = textDesignToSvg({ fillColor: '#ff0000' }, { idPrefix: 'a', text: 'A&B' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('A&amp;B'); // XML-escaped
    expect(svg).not.toContain('<linearGradient'); // solid → no gradient def
  });

  it('emits a gradient def for a linear fill and references it', () => {
    const style: TextStyle = {
      fills: [{ fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] } }],
    };
    const svg = textDesignToSvg(style, { idPrefix: 'g' });
    expect(svg).toContain('<linearGradient id="g-f"');
    expect(svg).toContain('fill="url(#g-f)"');
  });

  it('draws a back fill layer (3D offset) AND the front fill = two <text> nodes', () => {
    const style: TextStyle = {
      fills: [
        { fill: { type: 'solid', color: '#111' }, dx: 0.06, dy: 0.06 },
        { fill: { type: 'solid', color: '#fff' } },
      ],
    };
    const svg = textDesignToSvg(style, { idPrefix: 'd' });
    expect((svg.match(/<text/g) ?? []).length).toBe(2);
  });

  it('renders the box card + a feDropShadow filter when present', () => {
    const svg = textDesignToSvg({ box: { color: '#fff' }, shadow: { depth: 3, color: '#000' } }, { idPrefix: 's' });
    expect(svg).toContain('<rect');
    expect(svg).toContain('<feDropShadow');
    expect(svg).toContain('filter="url(#s-sh)"');
  });

  it('round-trips a built-in layered preset (gold-luxe → gradient SVG)', () => {
    const p = getTextPreset('gold-luxe')!;
    const svg = textDesignToSvg(p.style, { idPrefix: p.id });
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('stroke=');
  });
});
