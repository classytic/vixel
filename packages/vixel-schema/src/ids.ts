/**
 * Stable element identity — the foundation for an id-keyed editing model.
 * =======================================================================
 * vixel's editing surface historically referenced elements by ARRAY POSITION
 * (trackIndex, clipIndex) — which any insert/move/ripple/sort silently
 * invalidates. This module mints a STABLE `id` on every track / clip / audio item
 * (preserving any author-provided id) and provides an O(1) id→position resolver,
 * so selections, edits, transitions, links, and markers can reference identity.
 *
 * `mintIds` is PURE, deterministic, and idempotent — `normalizeSpec` runs it, so a
 * normalized spec always carries ids and a second normalize preserves them. ids are
 * counter-based (`tk1`/`cl1`/`au1`) and collision-free against any pre-existing ids;
 * no `Math.random`/`Date`, so the same spec always yields the same ids.
 */
import type { VixelSpec } from './spec.js';

/** Position of a visual clip within the spec. */
export interface ClipPos {
  trackIndex: number;
  clipIndex: number;
}
/** Position of an audio item within the spec. */
export interface AudioPos {
  trackIndex: number;
  itemIndex: number;
}

/** id → position maps for O(1) resolution (render order stays array order). */
export interface SpecIndex {
  /** Visual lane id → track index. */
  track: Map<string, number>;
  /** Visual clip id → its (track, clip) position. */
  clip: Map<string, ClipPos>;
  /** Audio item id → its (track, item) position. */
  audio: Map<string, AudioPos>;
}

/** Collect every id already present on tracks / clips / items. */
function collectIds(spec: VixelSpec): Set<string> {
  const used = new Set<string>();
  for (const t of spec.tracks) {
    if (t.id) used.add(t.id);
    if (t.type === 'visual') {
      for (const c of t.clips) if (c.id) used.add(c.id);
    } else {
      for (const it of t.items) if (it.id) used.add(it.id);
    }
  }
  return used;
}

/**
 * Mint a stable `id` on every track / clip / audio item that lacks one, preserving
 * existing ids. Pure, deterministic, idempotent (a spec that already has ids is
 * returned with the same id VALUES). New ids are `tk{n}` (lane) / `cl{n}` (clip) /
 * `au{n}` (audio item), skipping any value already in use.
 */
export function mintIds(spec: VixelSpec): VixelSpec {
  const used = collectIds(spec);
  const counters: Record<string, number> = { tk: 0, cl: 0, au: 0 };
  const mint = (prefix: 'tk' | 'cl' | 'au'): string => {
    let id: string;
    do {
      id = `${prefix}${(counters[prefix] += 1)}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };

  const tracks = spec.tracks.map((t) => {
    if (t.type === 'visual') {
      return {
        ...t,
        id: t.id ?? mint('tk'),
        clips: t.clips.map((c) => (c.id ? c : { ...c, id: mint('cl') })),
      };
    }
    return {
      ...t,
      id: t.id ?? mint('tk'),
      items: t.items.map((it) => (it.id ? it : { ...it, id: mint('au') })),
    };
  });

  return { ...spec, tracks };
}

/**
 * Build the id→position index for a spec. O(n). Untracked elements (no id — i.e. a
 * spec that wasn't run through `normalizeSpec`/`mintIds`) are simply absent from the
 * maps; run `mintIds` first if you need every element resolvable.
 */
export function indexSpec(spec: VixelSpec): SpecIndex {
  const index: SpecIndex = { track: new Map(), clip: new Map(), audio: new Map() };
  spec.tracks.forEach((t, trackIndex) => {
    if (t.id) index.track.set(t.id, trackIndex);
    if (t.type === 'visual') {
      t.clips.forEach((c, clipIndex) => {
        if (c.id) index.clip.set(c.id, { trackIndex, clipIndex });
      });
    } else {
      t.items.forEach((it, itemIndex) => {
        if (it.id) index.audio.set(it.id, { trackIndex, itemIndex });
      });
    }
  });
  return index;
}

/** Resolve a visual clip's position by id (undefined if unknown). */
export function clipPosById(spec: VixelSpec, id: string): ClipPos | undefined {
  return indexSpec(spec).clip.get(id);
}

/** Resolve an audio item's position by id (undefined if unknown). */
export function audioPosById(spec: VixelSpec, id: string): AudioPos | undefined {
  return indexSpec(spec).audio.get(id);
}
