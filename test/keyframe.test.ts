/**
 * Keyframe compiler — golden unit tests (pure expr strings, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { compileScalarKeyframes } from '../src/core/keyframe.js';

describe('compileScalarKeyframes', () => {
  it('a single keyframe is a constant', () => {
    expect(compileScalarKeyframes([{ t: 0, value: 0.5 }])).toBe('0.5');
  });

  it('two keyframes linearly interpolate with a clamped progress (commas escaped)', () => {
    const e = compileScalarKeyframes([{ t: 0, value: 0 }, { t: 2, value: 1 }]);
    // 0 + (1)*clip((t-0)/2,0,1)
    expect(e).toBe('(0+(1)*clip((t-0)/2\\,0\\,1))');
  });

  it('honors a custom time variable (local overlay time)', () => {
    const e = compileScalarKeyframes([{ t: 0, value: 0.1 }, { t: 1, value: 0.9 }], '(t-3)');
    expect(e).toContain('clip(((t-3)-0)/1\\,0\\,1)');
  });

  it('applies easeIn / easeOut / hold', () => {
    expect(compileScalarKeyframes([{ t: 0, value: 0, easing: 'easeIn' }, { t: 1, value: 1 }])).toContain('pow(clip');
    expect(compileScalarKeyframes([{ t: 0, value: 0, easing: 'easeOut' }, { t: 1, value: 1 }])).toContain('(1-pow(1-');
    // hold → the eased term is 0, so the value holds at the start until the next key
    expect(compileScalarKeyframes([{ t: 0, value: 0.2, easing: 'hold' }, { t: 1, value: 0.8 }])).toBe('(0.2+(0.6)*0)');
  });

  it('three keyframes nest into if(lt(...)) segments', () => {
    const e = compileScalarKeyframes([{ t: 0, value: 0 }, { t: 1, value: 1 }, { t: 2, value: 0 }]);
    expect(e.startsWith('if(lt(t\\,1)\\,')).toBe(true); // first boundary at t=1
    expect(e).toContain('(1+(-1)*'); // second segment goes 1 → 0
  });

  it('sorts out-of-order keyframes by time', () => {
    const e = compileScalarKeyframes([{ t: 2, value: 0 }, { t: 0, value: 1 }]);
    expect(e).toContain('(1+(-1)*'); // starts at the t=0 value (1), heads to 0
  });

  it('throws on empty input', () => {
    expect(() => compileScalarKeyframes([])).toThrow(/at least one keyframe/);
  });
});
