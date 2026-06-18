/**
 * Feature detection — does this spec use anything the ffmpeg filtergraph can't
 * render faithfully, so it should go through the Pixi (WYSIWYG) tier?
 * ====================================================================
 * Pure + cheap, so the router can call it on every spec. A transition that
 * carries a `gl.shader` is the canonical signal: ffmpeg only APPROXIMATES it via
 * `xfade` (the fast tier), while the editor shows the real GLSL — exactly the
 * preview/export mismatch this package exists to close. Shape overlays are the
 * other documented ffmpeg gap. Effects/transitions may also self-declare
 * `unsupported: ['ffmpeg']`, which we honor verbatim.
 */
import { BUILTIN_TRANSITIONS } from '@classytic/vixel-schema';
import type { VixelSpec } from '@classytic/vixel-schema';

export interface PixiNeed {
  /** True if at least one element needs the Pixi tier for fidelity. */
  needs: boolean;
  /** Human-readable reasons (for the logger / a "why premium?" explanation). */
  reasons: string[];
}

const GL_TRANSITION_IDS = new Set(BUILTIN_TRANSITIONS.filter((d) => d.gl?.shader).map((d) => d.id));

/** A transition id whose faithful render needs GLSL (ffmpeg only approximates it). */
function transitionNeedsPixi(id: string | undefined): boolean {
  return !!id && id !== 'none' && GL_TRANSITION_IDS.has(id);
}

/** Inspect a spec for features that require the Pixi tier. */
export function specNeedsPixi(spec: VixelSpec): PixiNeed {
  const reasons: string[] = [];
  for (const track of spec.tracks ?? []) {
    if (track.type !== 'visual') continue;
    // Adjacent-clip sequence transitions on the lane.
    for (const t of track.transitions ?? []) {
      if (transitionNeedsPixi(t.transition?.id)) reasons.push(`gl-transition '${t.transition.id}'`);
    }
    // A clip's type lives in its `media.kind`; shapes are the documented ffmpeg gap.
    for (const clip of track.clips ?? []) {
      if (clip.media.kind === 'shape') reasons.push('shape overlay');
    }
  }
  return { needs: reasons.length > 0, reasons: [...new Set(reasons)] };
}
