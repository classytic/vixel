/**
 * VixelSpec — the top-level composition document an agent emits and the engine renders.
 */
import type { Track } from './track.js';

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
  metadata?: Record<string, unknown>;
}

/** Identity helper for authoring a spec with full type-checking. */
export function defineComposition(spec: VixelSpec): VixelSpec {
  return spec;
}
