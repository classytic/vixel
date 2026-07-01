import { describe, it, expect } from 'vitest';
import { resolveGradient } from './shape.js';

describe('resolveGradient — the standardized gradient model', () => {
  it('expands the from/to shorthand to two linear stops (back-compat)', () => {
    const g = resolveGradient({ from: '#ffffff', to: '#000000', angle: 90 });
    expect(g.type).toBe('linear');
    expect(g.angle).toBe(90);
    expect(g.stops).toEqual([
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#000000' },
    ]);
  });

  it('takes an explicit multi-stop list, sorted, over from/to', () => {
    const g = resolveGradient({
      stops: [
        { offset: 1, color: '#0000ff' },
        { offset: 0, color: '#ff0000' },
        { offset: 0.5, color: '#00ff00' },
      ],
      from: 'ignored',
      to: 'ignored',
    });
    expect(g.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(g.stops[0]!.color).toBe('#ff0000');
    expect(g.stops[2]!.color).toBe('#0000ff');
  });

  it('resolves radial geometry with sensible defaults', () => {
    const g = resolveGradient({ type: 'radial', from: '#ffffff', to: '#000000' });
    expect(g.type).toBe('radial');
    expect([g.cx, g.cy, g.radius]).toEqual([0.5, 0.5, 0.5]);
  });

  it('honors explicit radial center + radius', () => {
    const g = resolveGradient({ type: 'radial', cx: 0.3, cy: 0.2, radius: 0.8, from: '#fff', to: '#000' });
    expect([g.cx, g.cy, g.radius]).toEqual([0.3, 0.2, 0.8]);
  });
});
