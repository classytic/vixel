/**
 * Colour validation — golden unit tests (filter-injection guard).
 */

import { describe, it, expect } from 'vitest';
import { assertSafeColor } from '../src/core/color.js';
import { isConfigError } from '../src/errors.js';

describe('assertSafeColor', () => {
  it('accepts hex (#/0x/bare) and named colours', () => {
    for (const c of ['#101820', '0xFF00FF', '00ff00', '#101820ff', 'red', 'black', 'white', 'black@0.5']) {
      expect(assertSafeColor(c)).toBe(c);
    }
  });

  it('rejects anything that could break out of the filter grammar', () => {
    for (const bad of [
      'black:format=rgb',       // injects a filter option
      'red,scale=2:2',          // chains a filter
      "white'", '0xFF[x]',      // quote / bracket
      'c=red:s=1x1', 'a b',     // spaces / colons
      '#12',                    // wrong length
    ]) {
      expect(() => assertSafeColor(bad), bad).toThrow(/unsafe/);
    }
  });

  it('throws a ConfigError with the field name', () => {
    try {
      assertSafeColor('bad:value', 'output.background');
    } catch (e) {
      expect(isConfigError(e)).toBe(true);
      expect((e as Error).message).toContain('output.background');
    }
  });
});
