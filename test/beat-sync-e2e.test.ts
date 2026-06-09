/**
 * beatSync — e2e (real ffmpeg): detect beats in a generated click track.
 *
 * Synthesizes a 120-BPM metronome (clicks every 0.5s for 6s → ~12 beats) and
 * asserts detectBeats recovers roughly that count and tempo.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectBeats } from '../src/compose/beat-sync.js';

const exec = promisify(execFile);
let workDir = '';
let click = '';

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vixel-beat-'));
  click = join(workDir, 'click.wav');
  // 120 BPM: a short 1kHz blip every 0.5s, gated by a 8Hz-ish pulse train.
  // `aevalsrc` gates a tone to sharp clicks at 2 Hz (every 0.5s).
  await exec('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', "aevalsrc='sin(2*PI*1000*t)*gt(sin(2*PI*2*t)\\,0.99)':s=22050:d=6",
    click,
  ]);
});

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('detectBeats (real audio)', () => {
  it('recovers ~120 BPM clicks from a generated metronome', async () => {
    // audio-only source handle (detectBeats needs only the path) — a host with
    // a music file constructs the same structural { inputPath, duration }.
    const res = await detectBeats({ inputPath: click, duration: 6 }, { sensitivity: 1.0 });

    expect(res.durationSec).toBeGreaterThan(5);
    // ~12 clicks over 6s; allow detector slack (edge frames, gating)
    expect(res.beats.length).toBeGreaterThanOrEqual(8);
    expect(res.beats.length).toBeLessThanOrEqual(16);
    // tempo near 120 BPM (0.5s spacing)
    expect(res.bpm).toBeGreaterThanOrEqual(100);
    expect(res.bpm).toBeLessThanOrEqual(140);
  }, 60_000);
});
