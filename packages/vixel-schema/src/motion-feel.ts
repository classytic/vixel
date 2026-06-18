/**
 * Motion FEEL — the agent-native "how should this entrance move?" vocabulary. A clip
 * picks a named feel (and optionally an explicit duration); {@link resolveEntranceOptions}
 * expands it into the {@link EntranceOptions} every renderer already understands. This is
 * the CapCut model — a creator chooses *Snappy* / *Bouncy*, not raw easing curves and
 * millisecond ramps — while the Director can emit the same `motionTiming` field.
 *
 * Pure DATA + one resolver (mirrors `BUILTIN_EASINGS` / `BUILTIN_TEXT_ANIMATIONS`): the
 * feel table lives HERE only, so the preview, the in-browser export, and the editor menu
 * read one source. `default` (or absent `motionTiming`) ⇒ `{}` ⇒ the historical look, so
 * adding this changes nothing until a feel is chosen.
 */
import type { EntranceOptions } from './entrance.js';

/** A named entrance/exit feel — a curated bundle of duration + distance + easing. */
export type MotionFeel = 'default' | 'snappy' | 'smooth' | 'bouncy' | 'gentle';

export interface MotionFeelDescriptor {
  id: MotionFeel;
  name: string;
  /** What the feel resolves to (empty for `default` = engine defaults). */
  options: EntranceOptions;
}

/** The feel table — ordered for the menu (neutral first, then the expressive ones). */
export const MOTION_FEELS: MotionFeelDescriptor[] = [
  { id: 'default', name: 'Default', options: {} },
  // Fast in/out, a touch more travel, exponential settle — the punchy TikTok title.
  { id: 'snappy', name: 'Snappy', options: { inDur: 0.18, outDur: 0.18, distance: 0.1, enterEasing: 'easeOutExpo', exitEasing: 'easeIn' } },
  // Long, symmetric ease-in-out — calm, cinematic.
  { id: 'smooth', name: 'Smooth', options: { inDur: 0.5, outDur: 0.5, distance: 0.05, enterEasing: 'easeInOut', exitEasing: 'easeInOut' } },
  // Overshoot-and-settle on entry — playful.
  { id: 'bouncy', name: 'Bouncy', options: { inDur: 0.55, outDur: 0.3, distance: 0.09, enterEasing: 'easeOutBounce', exitEasing: 'easeIn' } },
  // Slow, small travel, soft ease — understated.
  { id: 'gentle', name: 'Gentle', options: { inDur: 0.75, outDur: 0.75, distance: 0.03, enterEasing: 'easeOut', exitEasing: 'easeOut' } },
];

const FEEL_MAP: Record<MotionFeel, EntranceOptions> = MOTION_FEELS.reduce(
  (m, f) => ((m[f.id] = f.options), m),
  {} as Record<MotionFeel, EntranceOptions>,
);

/**
 * Per-clip entrance/exit timing — what the editor writes to `VisualClip.motionTiming`.
 * A named {@link MotionFeel} plus optional explicit ramp overrides (the Speed control):
 * the feel sets the base, an explicit `inDur`/`outDur` wins over it.
 */
export interface ClipMotionTiming {
  feel?: MotionFeel;
  /** Explicit enter ramp seconds — overrides the feel's `inDur`. */
  inDur?: number;
  /** Explicit exit ramp seconds — overrides the feel's `outDur`. */
  outDur?: number;
}

/** Expand a clip's `motionTiming` into renderer {@link EntranceOptions}. Absent ⇒ `{}`
 *  ⇒ engine defaults (no behavior change). Explicit durations override the feel. Pure. */
export function resolveEntranceOptions(timing: ClipMotionTiming | undefined): EntranceOptions {
  if (!timing) return {};
  const base = FEEL_MAP[timing.feel ?? 'default'] ?? {};
  return {
    ...base,
    ...(timing.inDur != null ? { inDur: timing.inDur } : {}),
    ...(timing.outDur != null ? { outDur: timing.outDur } : {}),
  };
}
