import { describe, it, expect } from 'vitest';
import {
  addMarker,
  removeMarker,
  updateMarker,
  markersToVtt,
  markersToFfmetadata,
  markersInRange,
  nearestMarker,
  mintMarkerIds,
  sortMarkers,
} from './marker.js';
import type { Marker } from './marker.js';
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

  it('updateMarker patches fields and re-sorts when at changes', () => {
    let s = addMarker(addMarker(base(), { at: 1, label: 'A' }), { at: 5, label: 'B' });
    const aId = s.markers![0]!.id!;
    s = updateMarker(s, aId, { label: 'Intro', kind: 'chapter' });
    expect(s.markers![0]).toMatchObject({ label: 'Intro', kind: 'chapter' });
    // Move A past B → list re-sorts.
    s = updateMarker(s, aId, { at: 9 });
    expect(s.markers!.map((m) => m.label)).toEqual(['B', 'Intro']);
    expect(updateMarker(s, 'nope', { label: 'x' })).toBe(s); // unknown id → no-op
  });
});

describe('chapter export', () => {
  const ms: Marker[] = [
    { at: 0, label: 'Intro' },
    { at: 5, label: 'Body' },
    { at: 12 }, // unlabeled → "Chapter 3"
  ];

  it('markersToVtt spans each marker to the next, last to totalSec', () => {
    const vtt = markersToVtt(ms, 20);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000\nIntro');
    expect(vtt).toContain('00:00:05.000 --> 00:00:12.000\nBody');
    expect(vtt).toContain('00:00:12.000 --> 00:00:20.000\nChapter 3');
  });

  it('drops markers at/after totalSec and returns empty when none remain', () => {
    expect(markersToVtt([{ at: 30 }], 20)).toBe('');
    expect(markersToVtt([], 20)).toBe('');
  });

  it('markersToFfmetadata emits ms-timebased CHAPTER blocks', () => {
    const meta = markersToFfmetadata(ms, 20);
    expect(meta.startsWith(';FFMETADATA1')).toBe(true);
    expect(meta).toContain('[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=5000\ntitle=Intro');
    expect(meta).toContain('START=12000\nEND=20000\ntitle=Chapter 3');
  });
});
