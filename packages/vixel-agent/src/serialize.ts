/**
 * Token-economical timeline serialization — the read an agent opens a session with.
 * Mirrors Palmier's `get_timeline` discipline: state fps/resolution/duration once, list
 * every track + clip by stable id, and OMIT default-valued fields (speed 1, volume 1,
 * unmuted, no trim, no link) so a long timeline stays cheap in context. Pure.
 */
import { totalDurationSec, sourceUrl, type VixelSpec, type VisualClip, type AudioItem } from '@classytic/vixel-schema';

export interface SerializedClip {
  id?: string;
  kind: string;
  at: number;
  duration: number;
  source?: string;
  text?: string;
  trimStart?: number;
  loop?: boolean;
  volume?: number;
  muted?: boolean;
  linkId?: string;
}

export interface SerializedAudio {
  id?: string;
  at: number;
  in?: number;
  out?: number;
  loop?: boolean;
  loopDuration?: number;
  gain?: number;
  linkId?: string;
}

export interface SerializedTimeline {
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  tracks: Array<
    | { id?: string; type: 'visual'; index: number; sequential?: boolean; clips: SerializedClip[] }
    | { id?: string; type: 'audio'; index: number; items: SerializedAudio[] }
  >;
  markers: VixelSpec['markers'];
}

/** Frames per second as a scalar (resolves the NTSC rational form). */
export function fpsOf(spec: VixelSpec): number {
  const f = spec.output.fps;
  return typeof f === 'number' ? f : f.num / f.den;
}

function serClip(c: VisualClip): SerializedClip {
  const o: SerializedClip = { id: c.id, kind: c.media.kind, at: c.at, duration: c.duration };
  if (c.media.kind === 'video' || c.media.kind === 'image') o.source = sourceUrl(c.media.source);
  if (c.media.kind === 'text') o.text = c.media.text;
  if (c.media.kind === 'video' && c.media.trimStart) o.trimStart = c.media.trimStart;
  if (c.media.kind === 'video' && c.media.loop) o.loop = true;
  if (c.volume != null && c.volume !== 1) o.volume = c.volume;
  if (c.muted) o.muted = true;
  if (c.linkId) o.linkId = c.linkId;
  return o;
}

function serAudio(it: AudioItem): SerializedAudio {
  const o: SerializedAudio = { id: it.id, at: it.at ?? 0 };
  if (it.in) o.in = it.in;
  if (it.out != null) o.out = it.out;
  if (it.loop) o.loop = true;
  if (it.loopDuration != null) o.loopDuration = it.loopDuration;
  if (it.gain != null && it.gain !== 0) o.gain = it.gain;
  if (it.linkId) o.linkId = it.linkId;
  return o;
}

/** Serialize a spec to the agent-facing timeline view. Pure. */
export function serializeTimeline(spec: VixelSpec): SerializedTimeline {
  return {
    fps: fpsOf(spec),
    width: spec.output.width,
    height: spec.output.height,
    durationSec: totalDurationSec(spec),
    tracks: spec.tracks.map((t, index) =>
      t.type === 'visual'
        ? { id: t.id, type: 'visual' as const, index, ...(t.sequential ? { sequential: true } : {}), clips: t.clips.map(serClip) }
        : { id: t.id, type: 'audio' as const, index, items: t.items.map(serAudio) },
    ),
    markers: spec.markers ?? [],
  };
}
