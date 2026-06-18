/**
 * Keyframe CHANNELS — the multi-channel layer over the single-channel {@link Keyframe}
 * primitive. A clip animates several scalars at once (transform x/y/w/h/rotation/opacity,
 * or audio gain); the timeline shows ONE ◆ diamond per distinct TIME and edits every
 * channel keyed at that instant together — the unified-keyframe model CapCut/Premiere use.
 *
 * Pure + DOM-free, so the same retime/remove math is unit-tested here and reused by the
 * editor's draggable timeline rail. Mirrors the design of `keyframes.ts` (immutable ops,
 * `eps`-tolerant time matching) — this just fans each op across a named channel map.
 */
import type { Keyframe } from './keyframes.js';
import type { TransformKeyframes } from './transform.js';

/** A named set of keyframe channels — e.g. a transform's `{x,y,w,h,rotation,opacity}` or
 *  an audio item's `{gain}`. Empty/absent channels are allowed (just skipped). */
export type KeyframeChannels = Record<string, Keyframe[] | undefined>;

/** Float tolerance for "a keyframe AT this time" (≈0.1ms) — matches `keyframes.ts`. */
const EPS = 1e-4;

/** Every DISTINCT keyframe time across all channels, sorted ascending (deduped within
 *  `eps`). One entry per ◆ the timeline draws. */
export function channelKeyframeTimes(channels: KeyframeChannels, eps = EPS): number[] {
  const times: number[] = [];
  for (const key in channels) {
    const list = channels[key];
    if (!list) continue;
    for (const k of list) if (!times.some((t) => Math.abs(t - k.t) <= eps)) times.push(k.t);
  }
  return times.sort((a, b) => a - b);
}

/**
 * Retime: move EVERY channel keyframe at `fromT` to `toT` (value + easing preserved),
 * keeping each channel sorted. The unified-diamond drag — all properties keyed at that
 * instant move together. On collision (a key already sits at `toT` in some channel) the
 * MOVED key wins (the dropped-on key is replaced). Pure: returns a NEW map; a channel
 * with no key at `fromT` is returned by its original reference (no needless churn).
 * Caller clamps `toT` into the clip's `[0, duration]` range.
 */
export function moveKeyframeTime(channels: KeyframeChannels, fromT: number, toT: number, eps = EPS): KeyframeChannels {
  if (Math.abs(fromT - toT) <= eps) return channels;
  const out: KeyframeChannels = { ...channels };
  for (const key in channels) {
    const list = channels[key];
    if (!list) continue;
    const i = list.findIndex((k) => Math.abs(k.t - fromT) <= eps);
    if (i < 0) continue; // this channel isn't keyed at fromT — leave it untouched
    const moved: Keyframe = { ...list[i]!, t: toT };
    const rest = list.filter((_, j) => j !== i).filter((k) => Math.abs(k.t - toT) > eps);
    out[key] = [...rest, moved].sort((a, b) => a.t - b.t);
  }
  return out;
}

/** Remove EVERY channel keyframe at `t` (the whole ◆). Pure: NEW map; channels without a
 *  key at `t` keep their original reference. */
export function removeKeyframeTime(channels: KeyframeChannels, t: number, eps = EPS): KeyframeChannels {
  const out: KeyframeChannels = { ...channels };
  for (const key in channels) {
    const list = channels[key];
    if (!list) continue;
    const filtered = list.filter((k) => Math.abs(k.t - t) > eps);
    if (filtered.length !== list.length) out[key] = filtered;
  }
  return out;
}

/** Nearest keyframe time to `t` within `maxDist` seconds, or `null` — pointer hit-testing. */
export function nearestKeyframeTime(times: readonly number[], t: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const x of times) {
    const d = Math.abs(x - t);
    if (d <= maxDist && d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

/** Adapt a transform's keyframes to the generic channel map (and back) — keeps the
 *  `{x,y,w,h,rotation,opacity}` ↔ channel mapping in ONE place. */
export function transformToChannels(kf: TransformKeyframes | undefined): KeyframeChannels {
  return { x: kf?.x, y: kf?.y, w: kf?.w, h: kf?.h, rotation: kf?.rotation, opacity: kf?.opacity };
}

/** Inverse of {@link transformToChannels} — drops emptied channels so the persisted
 *  `TransformKeyframes` has no dangling empty arrays. */
export function channelsToTransform(c: KeyframeChannels): TransformKeyframes {
  const pick = (list: Keyframe[] | undefined) => (list && list.length ? list : undefined);
  return { x: pick(c.x), y: pick(c.y), w: pick(c.w), h: pick(c.h), rotation: pick(c.rotation), opacity: pick(c.opacity) };
}
