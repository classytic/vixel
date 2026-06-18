/**
 * Effect/transition packs — registerPack merges descriptors into the catalogs,
 * resolves relative `source`s against the pack baseUrl, and built-ins stay intact.
 */
import { describe, it, expect } from 'vitest';
import { registerPack, getEffect, listEffects, getTransition, listPacks } from '../src/index.js';

describe('registerPack', () => {
  it('adds pack effects + resolves relative source vs baseUrl', () => {
    const before = listEffects().length;
    registerPack({
      id: 'neon-fx',
      name: 'Neon FX',
      baseUrl: 'https://cdn.example.com/neon',
      effects: [
        { id: 'neon:rgb-split', name: 'RGB Split', kind: 'shader', source: 'shaders/rgb-split.glsl' },
        { id: 'neon:leak', name: 'Light Leak', kind: 'overlay', source: 'assets/leak.webm', blend: 'screen' },
        { id: 'neon:teal-orange', name: 'Teal & Orange', kind: 'lut', source: 'https://other.cdn/to.cube' },
      ],
    });
    expect(listEffects().length).toBe(before + 3);
    expect(getEffect('neon:rgb-split')?.source).toBe('https://cdn.example.com/neon/shaders/rgb-split.glsl');
    expect(getEffect('neon:leak')?.source).toBe('https://cdn.example.com/neon/assets/leak.webm');
    // absolute URL passes through unchanged
    expect(getEffect('neon:teal-orange')?.source).toBe('https://other.cdn/to.cube');
  });

  it('a pack can ship transitions too, and built-ins remain', () => {
    registerPack({
      id: 'tx-pack',
      name: 'Transitions',
      transitions: [{ id: 'tx:swirl', name: 'Swirl', family: 'shape', gl: { shader: 'swirl' } }],
    });
    expect(getTransition('tx:swirl')?.gl?.shader).toBe('swirl');
    expect(getTransition('fade')).toBeDefined(); // built-in untouched
    expect(listPacks().some((p) => p.id === 'tx-pack')).toBe(true);
  });

  it('the `kind` vocabulary spans the executor types', () => {
    registerPack({ id: 'k', name: 'k', effects: [{ id: 'k:f', name: 'f', kind: 'filter' }, { id: 'k:l', name: 'l', kind: 'lut', source: 'a.cube' }] });
    expect(getEffect('k:l')?.kind).toBe('lut');
  });
});
