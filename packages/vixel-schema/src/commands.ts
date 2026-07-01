/**
 * Editor commands — the ONE typed, id-addressed edit vocabulary.
 * ==============================================================
 * Every mutation an editor (or an AI agent) performs is expressible as an
 * {@link EditorCommand}: a discriminated, JSON-serializable record that targets
 * elements by STABLE ID (never array position). {@link applyCommand} is a PURE reducer
 * `(spec, cmd) → spec` over the `with*()` primitives — so the same command applies
 * identically in the browser store, in a Node agent, on a server edit pipeline, or in a
 * test. Lives in `vixel-schema` (zero-dep) so no consumer pulls React to apply an edit.
 *
 * Why id-addressed: a positional `(trackIndex, clipIndex)` edit is invalidated by any
 * concurrent insert/move; an id survives. An agent can emit "split clip `cl7` at 2s"
 * against a spec it reasoned about earlier and still hit the right clip.
 */
import type { VixelSpec } from './spec.js';
import type { VisualClip } from './visual.js';
import type { AudioItem } from './audio.js';
import type { TransitionRef } from './transitions.js';
import type { Marker } from './marker.js';
import type { TimeRange } from './ripple.js';
import { indexSpec, mintIds } from './ids.js';
import { rippleDeleteRanges } from './ripple.js';
import { addMarker, removeMarker, updateMarker } from './marker.js';
import { linkElements, unlinkElements } from './link.js';
import {
  withClipPatch,
  withClipMoved,
  withClipRemoved,
  withClipSplit,
  withClipDuplicated,
  withTransition,
  withAudioPatch,
  withAudioRemoved,
  withClipAppended,
  withSceneAppended,
  withAudioItemAppended,
  withOutputPatch,
} from './edit.js';
import { buildScene } from './templates.js';

/** Patchable clip fields (subset of a {@link VisualClip} an editor mutates directly). */
export interface ClipPatch {
  at: number;
  duration: number;
  /** Link-group id — couple this clip with partner audio/video (J/L cuts). */
  linkId: string;
  volume: number;
  muted: boolean;
  hidden: boolean;
  media: VisualClip['media'];
  enter: NonNullable<VisualClip['enter']>;
  exit: NonNullable<VisualClip['exit']>;
  motionTiming: NonNullable<VisualClip['motionTiming']>;
  animation: NonNullable<VisualClip['animation']>;
  effects: NonNullable<VisualClip['effects']>;
  transform: NonNullable<VisualClip['transform']>;
}

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
  /** Instantiate a registered layout TEMPLATE as a themed scene (a layered lane on top).
   *  `content` is the template's typed input (minus at/duration/theme); slots are filled
   *  after. Unknown template ⇒ no-op. */
  | { type: 'applyTemplate'; template: string; content?: Record<string, unknown>; atSec?: number; durationSec?: number; theme?: string; label?: string }
  | { type: 'addAudioItem'; item: AudioItem; label?: string }
  | { type: 'setOutput'; patch: Partial<VixelSpec['output']>; label?: string }
  /** Cut time ranges (seconds) out of lane `trackId` and close the gaps; link-aware. */
  | { type: 'rippleDelete'; trackId: string; ranges: TimeRange[]; label?: string }
  /** Drop a timeline marker (cut/chapter/beat/note anchor). */
  | { type: 'addMarker'; marker: Marker; label?: string }
  | { type: 'removeMarker'; markerId: string; label?: string }
  | { type: 'updateMarker'; markerId: string; patch: Partial<Omit<Marker, 'id'>>; label?: string }
  /** Couple clips/audio items into one link group (id minted if omitted). */
  | { type: 'linkClips'; ids: string[]; linkId?: string; label?: string }
  | { type: 'unlinkClips'; ids: string[]; label?: string };

/** Discriminator union of every command `type` (for validation / manifests). */
export type EditorCommandType = EditorCommand['type'];

/**
 * Apply a command to a spec, returning a NEW spec (the previous one is untouched).
 * Pure. Resolves ids → positions via {@link indexSpec}, runs the matching primitive, and
 * re-mints ids so any newly-created clip is immediately addressable by the next command.
 * A command targeting a missing id is a no-op (returns the same spec) — one stale ref
 * can't crash a batch.
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
      case 'applyTemplate':
        return withSceneAppended(
          spec,
          buildScene({
            template: cmd.template,
            at: Math.max(0, cmd.atSec ?? 0),
            duration: Math.max(0.05, cmd.durationSec ?? 5),
            theme: cmd.theme,
            content: cmd.content,
          }),
        );
      case 'addAudioItem':
        return withAudioItemAppended(spec, cmd.item);
      case 'setOutput':
        return withOutputPatch(spec, cmd.patch);
      case 'rippleDelete':
        return rippleDeleteRanges(spec, cmd.trackId, cmd.ranges);
      case 'addMarker':
        return addMarker(spec, cmd.marker);
      case 'removeMarker':
        return removeMarker(spec, cmd.markerId);
      case 'updateMarker':
        return updateMarker(spec, cmd.markerId, cmd.patch);
      case 'linkClips':
        return linkElements(spec, cmd.ids, cmd.linkId);
      case 'unlinkClips':
        return unlinkElements(spec, cmd.ids);
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
    case 'applyTemplate':
      return 'Apply template';
    case 'addAudioItem':
      return 'Add audio';
    case 'setOutput':
      return 'Change output';
    case 'rippleDelete':
      return 'Ripple delete';
    case 'addMarker':
      return 'Add marker';
    case 'removeMarker':
      return 'Remove marker';
    case 'updateMarker':
      return 'Edit marker';
    case 'linkClips':
      return 'Link';
    case 'unlinkClips':
      return 'Unlink';
  }
}

// `withClipMoved` isn't used by applyCommand (the store uses it directly) but belongs to
// the same edit core — re-export so a server pipeline has the full vocabulary.
export { withClipMoved };
