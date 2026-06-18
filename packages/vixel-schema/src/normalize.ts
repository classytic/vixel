/**
 * normalizeSpec — resolve the agent-friendly shorthands into the explicit shape
 * every renderer reads. Pure, zero-dependency, idempotent.
 *
 * It does TWO things, both purely computable:
 *   1. Resolve a clip's semantic `place` (region / grid) into `transform.frame`.
 *   2. Inline a shape clip's `style` preset (e.g. `'glass'`) into its fields.
 *
 * It does NOT do aspect-dependent sizing (an image's `frame.h` from its intrinsic
 * aspect needs the canvas + a media probe) — that is completed by the engine's
 * transform resolver. See ARCHITECTURE.md.
 */
import type { VixelSpec } from './spec.js';
import type { Track } from './track.js';
import type { VisualClip } from './visual.js';
import { resolvePlacement } from './layout.js';
import { inlineShapePreset } from './shape-presets.js';

function normalizeClip(c: VisualClip): VisualClip {
  let clip = c;
  // Inline a shape's style preset first (so the result is self-contained).
  if (clip.media.kind === 'shape' && clip.media.style) {
    clip = { ...clip, media: inlineShapePreset(clip.media) };
  }
  // Resolve semantic placement → frame, unless an explicit frame already wins.
  if (clip.place && !clip.transform?.frame) {
    const frame = resolvePlacement(clip.place);
    if (frame) clip = { ...clip, transform: { ...(clip.transform ?? {}), frame } };
  }
  return clip;
}

/** Resolve a spec's shorthands to the explicit shape renderers read. Idempotent. */
export function normalizeSpec(spec: VixelSpec): VixelSpec {
  const tracks: Track[] = spec.tracks.map((t) =>
    t.type === 'visual' ? { ...t, clips: t.clips.map(normalizeClip) } : t,
  );
  return { ...spec, tracks };
}
