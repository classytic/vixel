/**
 * Link groups — the A/V coupling relationship (J/L cuts, detached audio, multicam).
 * =================================================================================
 * A clip and the audio that belongs with it (a camera clip + its dual-system sound,
 * a video whose source audio was detached to its own lane, a multicam angle + its
 * mic) form a LINK GROUP: editing one should carry its partners so they stay in
 * sync. vixel models this with a shared, stable `linkId` on every member —
 * {@link VisualClip.linkId} / {@link AudioItem.linkId} — NOT a containment hierarchy,
 * so members can live on different lanes and a member can be unlinked without
 * rewriting the others.
 *
 * This module is the PURE resolver every editor/agent uses to answer "what moves
 * with this?" before a move / trim / ripple / delete. It does not mutate — the
 * editing primitives (see `./ripple`, the command reducer) consult it and apply the
 * same delta to the whole group. Keeping resolution here means no consumer
 * re-implements "find the partners," exactly like {@link transitionGap} for
 * transitions and {@link indexSpec} for positions.
 *
 * An element with no `linkId`, or a `linkId` shared by no one else, is simply a
 * group of one — link-aware code degrades to single-element behavior for free.
 */
import type { VixelSpec } from './spec.js';

/** One member of a link group, addressed by identity + kind (lane is positional). */
export interface LinkMember {
  /** Stable element id (clip id or audio item id). */
  id: string;
  /** Which collection it lives in. */
  kind: 'clip' | 'audio';
  /** Index of the lane holding it. */
  trackIndex: number;
}

/** Every element carrying `linkId`, grouped — `id → members`. Pure. O(n). */
export function linkGroups(spec: VixelSpec): Map<string, LinkMember[]> {
  const groups = new Map<string, LinkMember[]>();
  const add = (linkId: string | undefined, m: LinkMember): void => {
    if (!linkId) return;
    const arr = groups.get(linkId);
    if (arr) arr.push(m);
    else groups.set(linkId, [m]);
  };
  spec.tracks.forEach((t, trackIndex) => {
    if (t.type === 'visual') {
      for (const c of t.clips) if (c.id) add(c.linkId, { id: c.id, kind: 'clip', trackIndex });
    } else {
      for (const it of t.items) if (it.id) add(it.linkId, { id: it.id, kind: 'audio', trackIndex });
    }
  });
  return groups;
}

/** The `linkId` of the clip or audio item with this id, if any. Pure. */
export function linkIdOf(spec: VixelSpec, elementId: string): string | undefined {
  for (const t of spec.tracks) {
    if (t.type === 'visual') {
      for (const c of t.clips) if (c.id === elementId) return c.linkId;
    } else {
      for (const it of t.items) if (it.id === elementId) return it.linkId;
    }
  }
  return undefined;
}

/**
 * All members of the link group the element belongs to — INCLUDING the element
 * itself. Returns `[]` if the id is unknown, and a single-element array if it has no
 * `linkId` (a group of one). The set an editor moves/trims/deletes together. Pure.
 */
export function linkGroupOf(spec: VixelSpec, elementId: string): LinkMember[] {
  const linkId = linkIdOf(spec, elementId);
  if (linkId) return linkGroups(spec).get(linkId) ?? [];
  // No linkId → group of one (locate the element so callers get a uniform shape).
  let found: LinkMember | undefined;
  spec.tracks.forEach((t, trackIndex) => {
    if (found) return;
    if (t.type === 'visual') {
      const c = t.clips.find((x) => x.id === elementId);
      if (c?.id) found = { id: c.id, kind: 'clip', trackIndex };
    } else {
      const it = t.items.find((x) => x.id === elementId);
      if (it?.id) found = { id: it.id, kind: 'audio', trackIndex };
    }
  });
  return found ? [found] : [];
}

/** The other members linked to this element (the group minus itself). Pure. */
export function linkedPartners(spec: VixelSpec, elementId: string): LinkMember[] {
  return linkGroupOf(spec, elementId).filter((m) => m.id !== elementId);
}

/** Are two elements in the same link group? Pure. */
export function areLinked(spec: VixelSpec, a: string, b: string): boolean {
  if (a === b) return true;
  const la = linkIdOf(spec, a);
  return la != null && la === linkIdOf(spec, b);
}
