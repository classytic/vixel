/**
 * Preview-audio SCHEDULING — the pure algorithm behind {@link PreviewAudio} (the live
 * `<audio>` engine), kept DOM-free so it's unit-tested and shared with the offline
 * mixer's mental model. It answers, for a {@link VixelSpec} + a playhead: which audio
 * sources exist, and for each — should it play right now, at what volume (sampling the
 * `gainKeyframes` envelope — auto-duck OR a manual curve — exactly like `export/audio`),
 * and what source-time it should be at. So what you HEAR while scrubbing == what exports.
 */
import type { VixelSpec, Keyframe } from '@classytic/vixel-schema';
import { sampleChannel, collectTransitionSounds } from '@classytic/vixel-schema';
import { sourceUrl } from '../pixi/index.js';

/** One playable audio source resolved from the spec (a track item or a transition SFX). */
export interface ScheduledAudio {
  /** Stable key for retaining the `<audio>` element across renders. */
  key: string;
  src: string;
  /** Timeline start (seconds). */
  at: number;
  /** Source-time offset (trim in). */
  inSec: number;
  /** On-screen duration (seconds); 0 ⇒ never active. */
  dur: number;
  /** Static volume in dB (used only when there's no envelope). */
  gain: number;
  /** dB volume envelope over element-relative time (auto-duck / manual curve). */
  gainKeyframes?: Keyframe[];
}

/** Every audio source the preview should play: audio-track items + transition SFX. Pure. */
export function collectScheduledAudio(spec: VixelSpec): ScheduledAudio[] {
  const out: ScheduledAudio[] = [];
  spec.tracks.forEach((t, ti) => {
    if (t.type !== 'audio') return;
    t.items.forEach((it, i) => {
      const src = sourceUrl(it.source);
      if (!src) return;
      const inSec = it.in ?? 0;
      const dur = it.out != null ? Math.max(0, it.out - inSec) : 0;
      out.push({ key: `${ti}:${i}:${src}`, src, at: it.at ?? 0, inSec, dur, gain: it.gain ?? 0, gainKeyframes: it.gainKeyframes });
    });
  });
  // Transition SFX (whoosh/impact) — one-shot, lead-in 80ms so the hit builds INTO the
  // cut. A nominal 2s window covers a short SFX; it stops when the file ends.
  collectTransitionSounds(spec).forEach((c, i) => {
    const src = sourceUrl(c.source);
    if (!src) return;
    out.push({ key: `sfx:${i}:${src}`, src, at: Math.max(0, c.at - 0.08), inSec: 0, dur: 2, gain: c.gain ?? 0 });
  });
  return out;
}

/** dB → linear amplitude, clamped to [0,1] (HTML `<audio>.volume` has no boost). */
export const gainToLinear = (db: number): number => Math.min(1, Math.max(0, Math.pow(10, db / 20)));

/** Volume in dB at the playhead: the envelope sampled (element-relative time) when a
 *  curve exists, else the static gain. Mirrors the export mixer. Pure. */
export function effectiveGainDb(it: ScheduledAudio, playhead: number): number {
  if (it.gainKeyframes && it.gainKeyframes.length) return sampleChannel(it.gainKeyframes, playhead - it.at) ?? it.gain;
  return it.gain;
}

/** Per-frame target for one source at the playhead. */
export interface AudioFrame {
  /** Whether the element should be playing now. */
  shouldPlay: boolean;
  /** Linear volume 0..1. */
  volume: number;
  /** Source-time (seconds) the element should be at. */
  seekTo: number;
}

/** Resolve an item to its play/volume/seek target at the playhead. Pure. */
export function audioFrameAt(it: ScheduledAudio, playhead: number, isPlaying: boolean): AudioFrame {
  const active = it.dur > 0 && playhead >= it.at && playhead < it.at + it.dur;
  const volume = gainToLinear(effectiveGainDb(it, playhead));
  return { shouldPlay: isPlaying && active && volume > 0, volume, seekTo: it.inSec + (playhead - it.at) };
}
