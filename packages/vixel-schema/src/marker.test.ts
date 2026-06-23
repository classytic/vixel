import { describe, it, expect } from 'vitest';
import { addMarker, removeMarker, markersInRange, nearestMarker, mintMarkerIds, sortMarkers } from './marker.js';
import { normalizeSpec } from './normalize.js';
import type { VixelSpec } from './spec.js';

const base = (): VixelSpec => ({
  version: 1,
  output: { width: 1920, height: 1080, fps: 30 },
  tracks: [{ type: 'visual', clips: [{ media: { kind: 'text', text: 'a' }, at: 0, duration: 2 }] }],
});

describe('marker', () => {
  it('adds markers time-sorted and mints ids', () => {
    let s = addMarker(base(), { at: 5, label: 'B' });
    s = addMarker(s, { at: 1, label: 'A' });
    expect(s.markers!.map((m) => m.label)).toEqual(['A', 'B']);
    expect(s.markers!.every((m) => m.id)).toBe(true);
  });

  it('removes by id', () => {
    let s = addMarker(base(), { at: 1, label: 'A' });
    const id = s.markers![0]!.id!;
    s = removeMarker(s, id);
    expect(s.markers).toEqual([]);
    expect(removeMarker(s, 'nope')).toBe(s); // no-op same ref
  });

  it('queries range and nearest', () => {
    const ms = sortMarkers([{ at: 1 }, { at: 4 }, { at: 9 }]);
    expect(markersInRange(ms, 0, 5).map((m) => m.at)).toEqual([1, 4]);
    expect(nearestMarker(ms, 3.6)?.at).toBe(4);
    expect(nearestMarker(ms, 3.6, 0.1)).toBeUndefined();
  });

  it('normalizeSpec mints marker ids deterministically', () => {
    const s = normalizeSpec({ ...base(), markers: [{ at: 0 }, { at: 2, id: 'mk1' }] });
    expect(s.markers!.map((m) => m.id).sort()).toEqual(['mk1', 'mk2']);
    // idempotent
    expect(mintMarkerIds(s)).toEqual(s);
  });
});
