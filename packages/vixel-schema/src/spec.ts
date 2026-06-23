/**
 * VixelSpec — the top-level composition document an agent emits and the engine renders.
 */
import type { Track } from './track.js';
import type { EffectPack } from './pack.js';
import type { Marker } from './marker.js';

export interface VixelSpec {
  version: 1;
  output: {
    width: number;
    height: number;
    /** Frames per second (rational allowed for NTSC, e.g. 30000/1001). */
    fps: number | { num: number; den: number };
    /** Background color `#RRGGBB`. Default `#000000`. */
    background?: string;
  };
  tracks: Track[];
  /**
   * SELF-CONTAINED BYO packs — effect/transition descriptors (inline GLSL / asset
   * URLs) carried WITH the spec, so a custom shader travels with the project (and an
   * agent can emit a novel effect) without a pre-registered global pack. The host
   * registers them on load via `registerSpecPacks` before rendering.
   */
  packs?: EffectPack[];
  /** Timeline-absolute time anchors — cut points, chapters, beats, notes. Intent,
   *  never geometry; survive export/handoff. The agent's "cut here" anchor. See `./marker`. */
  markers?: Marker[];
  metadata?: Record<string, unknown>;
}

/** Identity helper for authoring a spec with full type-checking. */
export function defineComposition(spec: VixelSpec): VixelSpec {
  return spec;
}
