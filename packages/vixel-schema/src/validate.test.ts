import { describe, it, expect } from 'vitest';
import { parseSpec, safeParseSpec, validateSpec } from './validate.js';
import { listEffects, listTransitions } from './pack.js';
import type { VixelSpec } from './spec.js';

const valid: VixelSpec = {
  version: 1,
  output: { width: 1080, height: 1920, fps: 30 },
  tracks: [
    { type: 'visual', clips: [{ media: { kind: 'image', source: 'a.jpg' }, at: 0, duration: 2 }] },
    { type: 'audio', items: [{ source: 'a.mp3', at: 0, in: 0, out: 5 }] },
  ],
};

describe('vixel-schema/validate — structural', () => {
  it('accepts a well-formed spec + returns it typed', () => {
    expect(validateSpec(valid).valid).toBe(true);
    expect(parseSpec(valid)).toEqual(valid);
  });

  it('rejects a bad version / missing output / non-positive duration', () => {
    expect(validateSpec({ ...valid, version: 2 }).valid).toBe(false);
    expect(validateSpec({ version: 1, tracks: [] }).valid).toBe(false); // no output
    const badDur = { ...valid, tracks: [{ type: 'visual', clips: [{ media: { kind: 'image', source: 's' }, at: 0, duration: 0 }] }] };
    const r = validateSpec(badDur);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /duration/.test(e))).toBe(true);
  });

  it('strips unknown keys instead of rejecting (forward-compatible)', () => {
    const withFuture = { ...valid, output: { ...valid.output, someFutureKnob: 7 } };
    const r = safeParseSpec(withFuture);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data.output as Record<string, unknown>).someFutureKnob).toBeUndefined();
  });
});

describe('vixel-schema/validate — semantic (registry-derived)', () => {
  it('flags an unknown effect id on a clip (the silent-skip footgun)', () => {
    const spec = { ...valid, tracks: [{ type: 'visual', clips: [{ media: { kind: 'image', source: 's' }, at: 0, duration: 2, effects: [{ id: '__nope__' }] }] }] };
    const r = validateSpec(spec);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /unknown effect id "__nope__"/.test(e))).toBe(true);
  });

  it('flags an unknown transition id on a seam', () => {
    const spec = { ...valid, tracks: [{ type: 'visual', clips: valid.tracks[0]!.type === 'visual' ? valid.tracks[0].clips : [], transitions: [{ between: [0, 1], transition: { id: '__nope__' } }] }] };
    expect(validateSpec(spec).valid).toBe(false);
  });

  it('accepts a real registered effect id', () => {
    const real = listEffects()[0];
    expect(real).toBeTruthy();
    const spec = { ...valid, tracks: [{ type: 'visual', clips: [{ media: { kind: 'image', source: 's' }, at: 0, duration: 2, effects: [{ id: real!.id }] }] }] };
    expect(validateSpec(spec).valid).toBe(true);
  });

  it('range-checks a numeric param against the descriptor', () => {
    // Find any registered effect with a bounded numeric param.
    const eff = listEffects().find((e) => (e.params ?? []).some((p) => p.type === 'number' && p.max != null));
    if (!eff) return; // catalog has none — skip rather than assert a fixture that may change
    const p = eff.params!.find((q) => q.type === 'number' && q.max != null)!;
    const spec = { ...valid, tracks: [{ type: 'visual', clips: [{ media: { kind: 'image', source: 's' }, at: 0, duration: 2, effects: [{ id: eff.id, params: { [p.name]: (p.max as number) + 1000 } }] }] }] };
    const r = validateSpec(spec);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /above max/.test(e))).toBe(true);
  });

  it('transition registry is reachable (sanity)', () => {
    expect(listTransitions().length).toBeGreaterThan(0);
  });
});
