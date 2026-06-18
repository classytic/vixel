/**
 * Smart audio mix — the "auto-duck" the Canva/CapCut/Premiere "auto-volume" does:
 * lower the music while someone is talking, restore it in the gaps. Two pure,
 * testable steps that reuse the {@link Keyframe} primitive (no new engine):
 *
 *   1. {@link speechRegionsFromLevels} — windowed amplitude (RMS, à la Remotion's
 *      getWaveformPortion) → speech on/off regions, with hysteresis + min-length.
 *   2. {@link duckEnvelope} — speech regions → a dB gain ENVELOPE for the music
 *      (`AudioItem.gainKeyframes`), with attack/release ramps.
 *
 * The browser supplies the levels (decode the voice → RMS windows); the agent can
 * supply regions straight from its Whisper word-timings. Either way the math + the
 * envelope are these pure functions, so preview == export.
 */
import type { Keyframe } from './keyframes.js';
import { upsertKeyframe } from './keyframes.js';

/** A span where speech (or any signal) is present, in element-relative seconds. */
export interface SpeechRegion {
  startSec: number;
  endSec: number;
}

export interface LevelDetectOptions {
  /** Normalized amplitude (0..1) above which speech is "on". Default 0.08. */
  threshold?: number;
  /** Shortest region kept (drops clicks/breaths). Default 0.15s. */
  minSpeechSec?: number;
}

/**
 * Turn per-window amplitude `levels` (0..1, `hopSec` apart) into speech regions.
 * Schmitt-trigger hysteresis (on at `threshold`, off at 60% of it) avoids chatter
 * at the edges. Pure.
 */
export function speechRegionsFromLevels(levels: readonly number[], hopSec: number, opts: LevelDetectOptions = {}): SpeechRegion[] {
  const on = Math.max(0, opts.threshold ?? 0.08);
  const off = on * 0.6;
  const minSpeech = Math.max(0, opts.minSpeechSec ?? 0.15);
  const regions: SpeechRegion[] = [];
  let active = false;
  let start = 0;
  for (let i = 0; i < levels.length; i++) {
    const t = i * hopSec;
    if (!active && levels[i]! >= on) {
      active = true;
      start = t;
    } else if (active && levels[i]! < off) {
      active = false;
      if (t - start >= minSpeech) regions.push({ startSec: start, endSec: t });
    }
  }
  if (active) {
    const end = levels.length * hopSec;
    if (end - start >= minSpeech) regions.push({ startSec: start, endSec: end });
  }
  return regions;
}

export interface DuckOptions {
  /** Un-ducked level (dB). Default 0 (unity). */
  baseDb?: number;
  /** Ducked level while speech plays (dB, negative). Default -12. */
  duckDb?: number;
  /** Ramp DOWN before speech (s). Default 0.25. */
  attackSec?: number;
  /** Ramp UP after speech (s). Default 0.4. */
  releaseSec?: number;
}

/** Merge regions whose gap is too small to ramp out-and-in (avoids pumping). */
function mergeRegions(speech: readonly SpeechRegion[], minGap: number): SpeechRegion[] {
  const sorted = [...speech].filter((r) => r.endSec > r.startSec).sort((a, b) => a.startSec - b.startSec);
  const out: SpeechRegion[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startSec - last.endSec < minGap) last.endSec = Math.max(last.endSec, r.endSec);
    else out.push({ ...r });
  }
  return out;
}

/**
 * Build a dB gain envelope (`Keyframe[]`) that dips to `duckDb` during each speech
 * region with attack/release ramps, sitting at `baseDb` otherwise. Assign the
 * result to the MUSIC item's `gainKeyframes`. Pure + deterministic.
 */
export function duckEnvelope(speech: readonly SpeechRegion[], opts: DuckOptions = {}): Keyframe[] {
  const baseDb = opts.baseDb ?? 0;
  const duckDb = opts.duckDb ?? -12;
  const attack = Math.max(0, opts.attackSec ?? 0.25);
  const release = Math.max(0, opts.releaseSec ?? 0.4);
  const merged = mergeRegions(speech, attack + release);
  let kfs: Keyframe[] = [];
  for (const r of merged) {
    kfs = upsertKeyframe(kfs, { t: Math.max(0, r.startSec - attack), value: baseDb, easing: 'linear' });
    kfs = upsertKeyframe(kfs, { t: r.startSec, value: duckDb, easing: 'linear' });
    kfs = upsertKeyframe(kfs, { t: r.endSec, value: duckDb, easing: 'linear' });
    kfs = upsertKeyframe(kfs, { t: r.endSec + release, value: baseDb, easing: 'linear' });
  }
  return kfs;
}
