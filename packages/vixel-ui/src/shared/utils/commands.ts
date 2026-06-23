/**
 * Editor commands — the ONE typed, id-addressed edit vocabulary.
 * ==============================================================
 * Every mutation an editor (or an AI agent) performs is expressible as an
 * {@link EditorCommand}: a discriminated, JSON-serializable record that targets
 * elements by STABLE ID (never array position). {@link applyCommand} is a PURE
 * reducer `(spec, cmd) → spec` over the existing `with*()` primitives — so the
 * same command applies identically in the browser store, in a Node agent, in a
 * test, or in a server-side edit pipeline. The store layers undo/labels on top;
 * this file has no React and no store, so it is the headless edit core.
 *
 * Why id-addressed: a positional `(trackIndex, clipIndex)` edit is invalidated by
 * any concurrent insert/move; an id survives. An agent can emit "split clip
 * `cl7` at 2s" against a spec it reasoned about earlier and have it still hit the
 * right clip.
 */
import { indexSpec, mintIds, type VixelSpec, type VisualClip, type AudioItem, type TransitionRef } from '@classytic/vixel-schema';
import type { ClipPatch } from '../../types.js';
import {
  withClipPatch,
  withClipRemoved,
  withClipSplit,
  withClipDuplicated,
  withTransition,
  withAudioPatch,
  withAudioRemoved,
  withClipAppended,
  withAudioItemAppended,
  withOutputPatch,
} from './spec.js';

/** A single, typed, id-addressed edit. `label` overrides the default undo label. */
export type EditorCommand =
  | { type: 'updateClip'; clipId: string; patch: Partial<ClipPatch>; label?: string }
  | { type: 'removeClip'; clipId: string; label?: string }
  | { type: 'splitClip'; clipId: string; atSec: number; label?: string }
  | { type: 'duplicateClip'; clipId: string; label?: string }
  /** Set (or clear, `ref: null`) the transition AFTER `afterClipId` into the next clip. */
  | { type: 'setTransition'; afterClipId: string; ref: TransitionRef | null; label?: string }
  | { type: 'updateAudioItem'; audioId: string; patch: Partial<AudioItem>; label?: string }
  | { type: 'removeAudioItem'; audioId: string; label?: string }
  | { type: 'addClip'; clip: VisualClip; label?: string }
  | { type: 'addAudioItem'; item: AudioItem; label?: string }
  | { type: 'setOutput'; patch: Partial<VixelSpec['output']>; label?: string };

/** Discriminator union of every command `type` (for validation / manifests). */
export type EditorCommandType = EditorCommand['type'];

/**
 * Apply a command to a spec, returning a NEW spec (the previous one is untouched).
 * Pure. Resolves ids → positions via {@link indexSpec}, runs the matching `with*()`
 * primitive, and re-mints ids so any newly-created clip is immediately addressable
 * by the next command. A command targeting a missing id is a no-op (returns the
 * same spec) rather than throwing — one stale ref can't crash a batch.
 */
export function applyCommand(spec: VixelSpec, cmd: EditorCommand): VixelSpec {
  const idx = indexSpec(spec);
  const next = ((): VixelSpec => {
    switch (cmd.type) {
      case 'updateClip': {
        const p = idx.clip.get(cmd.clipId);
        return p ? withClipPatch(spec, p.trackIndex, p.clipIndex, cmd.patch) : spec;
      }
      case 'removeClip': {
        const p = idx.clip.get(cmd.clipId);
        return p ? withClipRemoved(spec, p.trackIndex, p.clipIndex) : spec;
      }
      case 'splitClip': {
        const p = idx.clip.get(cmd.clipId);
        return p ? withClipSplit(spec, p.trackIndex, p.clipIndex, cmd.atSec) : spec;
      }
      case 'duplicateClip': {
        const p = idx.clip.get(cmd.clipId);
        return p ? withClipDuplicated(spec, p.trackIndex, p.clipIndex) : spec;
      }
      case 'setTransition': {
        const p = idx.clip.get(cmd.afterClipId); // p.clipIndex IS the gap (clip before the seam)
        return p ? withTransition(spec, p.trackIndex, p.clipIndex, cmd.ref) : spec;
      }
      case 'updateAudioItem': {
        const p = idx.audio.get(cmd.audioId);
        return p ? withAudioPatch(spec, p.trackIndex, p.itemIndex, cmd.patch) : spec;
      }
      case 'removeAudioItem': {
        const p = idx.audio.get(cmd.audioId);
        return p ? withAudioRemoved(spec, p.trackIndex, p.itemIndex) : spec;
      }
      case 'addClip':
        return withClipAppended(spec, cmd.clip);
      case 'addAudioItem':
        return withAudioItemAppended(spec, cmd.item);
      case 'setOutput':
        return withOutputPatch(spec, cmd.patch);
    }
  })();
  // No-op (missing id / nothing changed) → return the SAME reference so callers can
  // cheaply detect "did nothing". Otherwise mint ids on the new clips.
  return next === spec ? spec : mintIds(next);
}

/** Default human-readable undo label for a command (used when `cmd.label` is unset). */
export function commandLabel(cmd: EditorCommand): string {
  switch (cmd.type) {
    case 'updateClip':
      return 'Edit clip';
    case 'removeClip':
      return 'Delete clip';
    case 'splitClip':
      return 'Split clip';
    case 'duplicateClip':
      return 'Duplicate clip';
    case 'setTransition':
      return cmd.ref ? 'Add transition' : 'Remove transition';
    case 'updateAudioItem':
      return 'Edit audio';
    case 'removeAudioItem':
      return 'Delete audio';
    case 'addClip':
      return 'Add clip';
    case 'addAudioItem':
      return 'Add audio';
    case 'setOutput':
      return 'Change output';
  }
}
