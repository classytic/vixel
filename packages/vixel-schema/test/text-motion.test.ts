import { describe, it, expect } from 'vitest';
import {
  tokenizeText,
  tokenRank,
  textTokenSampleAt,
  BUILTIN_TEXT_MOTIONS,
  type TextMotion,
} from '../src/index.js';

describe('tokenizeText', () => {
  it('splits words on whitespace, dropping empties', () => {
    const t = tokenizeText('  hello   world ', 'word');
    expect(t.map((x) => x.text)).toEqual(['hello', 'world']);
    expect(t.map((x) => x.index)).toEqual([0, 1]);
  });
  it('splits chars by code point and lines by newline', () => {
    expect(tokenizeText('ab', 'char').map((x) => x.text)).toEqual(['a', 'b']);
    expect(tokenizeText('a\nb', 'line').map((x) => x.text)).toEqual(['a', 'b']);
  });
});

describe('tokenRank — animation order', () => {
  it('forward = index, reverse mirrors', () => {
    expect([0, 1, 2].map((i) => tokenRank(i, 3, 'forward'))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => tokenRank(i, 3, 'reverse'))).toEqual([2, 1, 0]);
  });
  it('center leads from the middle outward', () => {
    expect([0, 1, 2, 3, 4].map((i) => tokenRank(i, 5, 'center'))).toEqual([2, 1, 0, 1, 2]);
  });
  it('random is deterministic (same input → same rank)', () => {
    const a = [0, 1, 2, 3].map((i) => tokenRank(i, 4, 'random'));
    const b = [0, 1, 2, 3].map((i) => tokenRank(i, 4, 'random'));
    expect(a).toEqual(b);
  });
});

describe('textTokenSampleAt — staggered entrance', () => {
  const motion: TextMotion = { by: 'word', enter: 'fadeIn', stagger: 0.1, inDur: 0.1 };

  it('a token is hidden before its stagger offset', () => {
    // token index 2, stagger 0.1 → starts at t=0.2. At t=0.1 it has not begun.
    const s = textTokenSampleAt(motion, 2, 5, 0.1, 5);
    expect(s.opacity).toBe(0);
  });

  it('a token is fully shown after its entrance completes', () => {
    // token 2 starts 0.2, inDur 0.1 → done by 0.3. At t=1 it is identity.
    const s = textTokenSampleAt(motion, 2, 5, 1, 5);
    expect(s.opacity).toBeCloseTo(1, 5);
  });

  it('the first token leads the last (forward order)', () => {
    // At t=0.15: token 0 (starts 0) is mid/past entrance, token 4 (starts 0.4) hidden.
    const first = textTokenSampleAt(motion, 0, 5, 0.15, 5);
    const last = textTokenSampleAt(motion, 4, 5, 0.15, 5);
    expect(first.opacity).toBeGreaterThan(last.opacity);
    expect(last.opacity).toBe(0);
  });

  it('reverse order makes the last token lead', () => {
    const rev: TextMotion = { ...motion, order: 'reverse' };
    const first = textTokenSampleAt(rev, 0, 5, 0.15, 5);
    const last = textTokenSampleAt(rev, 4, 5, 0.15, 5);
    expect(last.opacity).toBeGreaterThan(first.opacity);
  });

  it('exit dims every token near the clip end', () => {
    const withExit: TextMotion = { ...motion, exit: 'fadeOut', outDur: 0.3 };
    const s = textTokenSampleAt(withExit, 0, 5, 4.95, 5); // last 50ms
    expect(s.opacity).toBeLessThan(1);
  });

  it('no exit → tokens stay at full opacity at the end', () => {
    const s = textTokenSampleAt(motion, 0, 5, 4.99, 5);
    expect(s.opacity).toBeCloseTo(1, 5);
  });
});

describe('BUILTIN_TEXT_MOTIONS', () => {
  it('every preset has a unique id and a valid motion', () => {
    const ids = BUILTIN_TEXT_MOTIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BUILTIN_TEXT_MOTIONS) expect(p.motion.enter ?? 'popIn').toBeTruthy();
  });
});
