/**
 * Frame-exact time — golden unit tests.
 */

import { describe, it, expect } from 'vitest';
import { toFrames, toSeconds, snapToFrame, formatTimecode, parseTimecode } from '../src/core/time.js';

describe('seconds ↔ frames', () => {
  it('rounds to the nearest frame', () => {
    expect(toFrames(2, 24)).toBe(48);
    expect(toFrames(1 / 24, 24)).toBe(1);
    expect(toFrames(0.49 / 24, 24)).toBe(0); // sub-half-frame rounds down
    expect(toSeconds(48, 24)).toBeCloseTo(2, 10);
  });
  it('snaps an off-grid seconds value onto the frame grid', () => {
    expect(snapToFrame(2.0207, 24)).toBeCloseTo(48 / 24, 10); // 2.0207*24=48.49 → 48
    expect(snapToFrame(2.03, 24)).toBeCloseTo(49 / 24, 10); // 2.03*24=48.72 → 49
  });
});

describe('timecode', () => {
  it('formats HH:MM:SS:FF (non-drop)', () => {
    expect(formatTimecode(0, 24)).toBe('00:00:00:00');
    expect(formatTimecode(1.5, 24)).toBe('00:00:01:12'); // 1s + 12 frames
    expect(formatTimecode(3661 + 5 / 30, 30)).toBe('01:01:01:05');
  });
  it('round-trips parse(format(t)) exactly on the grid', () => {
    for (const [s, fps] of [[1.5, 24], [3723.25, 30], [0.04, 25]] as const) {
      expect(parseTimecode(formatTimecode(s, fps), fps)).toBeCloseTo(snapToFrame(s, fps), 10);
    }
  });
  it('accepts MM:SS:FF (no hours)', () => {
    expect(parseTimecode('01:30:00', 30)).toBeCloseTo(90, 10);
  });
  it('rejects garbage', () => {
    expect(() => parseTimecode('not:a:tc', 30)).toThrow(/invalid timecode/);
  });
});
