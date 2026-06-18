/**
 * Smart audio mix — amplitude → speech regions (hysteresis) → a dB duck envelope.
 * The envelope is sampled by the same keyframe sampler as everything else.
 */
import { describe, it, expect } from 'vitest';
import { speechRegionsFromLevels, duckEnvelope, sampleChannel } from '../src/index.js';

describe('speechRegionsFromLevels', () => {
  it('detects a talk region above threshold, ignores quiet windows', () => {
    // 0.1s hop: silent, loud×3, silent → one region ~[0.1, 0.4)
    const levels = [0.01, 0.3, 0.5, 0.4, 0.02, 0.01];
    const r = speechRegionsFromLevels(levels, 0.1, { threshold: 0.08, minSpeechSec: 0.1 });
    expect(r).toHaveLength(1);
    expect(r[0].startSec).toBeCloseTo(0.1);
    expect(r[0].endSec).toBeCloseTo(0.4);
  });

  it('hysteresis: a brief dip above the OFF threshold does not split the region', () => {
    const levels = [0.3, 0.06, 0.3, 0.01]; // dip to 0.06 (> off=0.048) stays "on"
    const r = speechRegionsFromLevels(levels, 0.1, { threshold: 0.1, minSpeechSec: 0 });
    expect(r).toHaveLength(1);
  });

  it('drops sub-minimum blips', () => {
    const levels = [0.5, 0.01]; // one loud window = 0.1s; min 0.2 → dropped
    expect(speechRegionsFromLevels(levels, 0.1, { minSpeechSec: 0.2 })).toHaveLength(0);
  });
});

describe('duckEnvelope', () => {
  it('dips to duckDb during speech and rests at baseDb outside', () => {
    const env = duckEnvelope([{ startSec: 2, endSec: 4 }], { baseDb: 0, duckDb: -12, attackSec: 0.25, releaseSec: 0.4 });
    expect(sampleChannel(env, 0)).toBe(0); // before the duck → unity
    expect(sampleChannel(env, 3)).toBe(-12); // mid-speech → fully ducked
    expect(sampleChannel(env, 2)).toBe(-12); // at speech start
    expect(sampleChannel(env, 5)).toBe(0); // after release → restored
    expect(sampleChannel(env, 2 - 0.125)!).toBeCloseTo(-6); // mid-attack ramp
  });

  it('merges close regions so it does not pump between them', () => {
    // Two regions 0.1s apart (< attack+release) → one continuous duck.
    const env = duckEnvelope([{ startSec: 1, endSec: 2 }, { startSec: 2.1, endSec: 3 }], { attackSec: 0.25, releaseSec: 0.4 });
    expect(sampleChannel(env, 2.05)).toBe(-12); // still ducked in the tiny gap, not bouncing to 0
  });

  it('no speech → empty envelope (music keeps its static gain)', () => {
    expect(duckEnvelope([])).toEqual([]);
  });
});
