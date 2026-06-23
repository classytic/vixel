/**
 * Editor store — an external store over the {@link VixelSpec}.
 * =======================================================
 * A tiny `getState`/`setState`/`subscribe` store (the same pattern as
 * `@classytic/react-media`) consumed via `useSyncExternalStore` so high-frequency
 * updates (playhead, zoom) re-render only the primitives that select them. Every
 * spec mutation is immutable and notifies through `onChange`.
 */
import { mintIds, type VixelSpec } from '@classytic/vixel-schema';
import type {
  EditorState,
  EditorActions,
  SelectionRef,
  FeatureConfig,
  ClipPatch,
} from '../../../types.js';
import { ALL_FEATURES } from '../../../types.js';
import {
  selectionRefAt,
  seamRefAt,
  pruneSelection,
  pruneSeam,
} from '../../../shared/utils/selection.js';
import {
  totalDurationSec,
  withClipPatch,
  withClipMoved,
  withClipRemoved,
  withClipSplit,
  withClipDuplicated,
  withClipInNewLane,
  withClipAutoPlaced,
  withTrackMoved,
  withTrackHidden,
  withTrackMuted,
  withAudioPatch,
  withAudioRemoved,
  withClipAppended,
  withAudioItemAppended,
  withOutputPatch,
  withTransition,
} from '../../../shared/utils/spec.js';
import { applyCommand, commandLabel } from '../../../shared/utils/commands.js';

export interface EditorStore {
  getState: () => EditorState;
  setState: (next: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface CreateEditorStoreOptions {
  spec: VixelSpec;
  features?: FeatureConfig;
  pxPerSec?: number;
}

/** Create the external editor store seeded from a spec. */
export function createEditorStore(opts: CreateEditorStoreOptions): EditorStore {
  // Mint stable ids up front so selection/seam are identity-addressable from frame 0.
  const initialSpec = mintIds(opts.spec);
  let state: EditorState = {
    spec: initialSpec,
    selection: null,
    selectedSeam: null,
    playheadSec: 0,
    durationSec: totalDurationSec(initialSpec),
    pxPerSec: opts.pxPerSec ?? 100,
    isPlaying: false,
    canUndo: false,
    canRedo: false,
    features: { ...ALL_FEATURES, ...opts.features },
  };

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    getState: () => state,
    setState: (next) => {
      const patch = typeof next === 'function' ? next(state) : next;
      state = { ...state, ...patch };
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface CreateEditorActionsOptions {
  onChange?: (spec: VixelSpec) => void;
  onExport?: (spec: VixelSpec) => void;
  onSelect?: (ref: SelectionRef | null) => void;
}

/** Cap the undo stack so a long session can't grow memory unbounded. */
const MAX_HISTORY = 100;
/** Rapid edits within this window (a drag / slider sweep) coalesce into ONE undo
 *  step — so undo reverts the whole gesture, not each intermediate tick. */
const COALESCE_MS = 600;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Bind imperative {@link EditorActions} to a store + host callbacks. */
export function createEditorActions(
  store: EditorStore,
  options: CreateEditorActionsOptions = {},
): EditorActions {
  // Undo/redo history of FULL specs + the edit's LABEL (snapshots are cheap thanks
  // to structural sharing). `past` = states to undo into, `future` = redo targets.
  interface HistoryEntry {
    spec: VixelSpec;
    /** Label of the edit that moved off this snapshot (what undo/redo reverts). */
    label: string;
  }
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  // Timestamp of the last commit (for burst coalescing). −Infinity ⇒ the next edit
  // ALWAYS starts a fresh undo step (the first edit, and the first after undo/redo).
  let lastTouch = -Infinity;

  /** Push `spec` to the store + derived state, prune a now-deleted selection/seam
   *  (id-keyed refs need no positional re-resolution — they can't drift), expose the
   *  undo/redo labels, fire onChange. */
  const applySpec = (spec: VixelSpec) => {
    const durationSec = totalDurationSec(spec);
    const playheadSec = Math.min(store.getState().playheadSec, durationSec);
    const selection = pruneSelection(spec, store.getState().selection);
    const selectedSeam = pruneSeam(spec, store.getState().selectedSeam);
    store.setState({
      spec,
      durationSec,
      playheadSec,
      selection,
      selectedSeam,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoLabel: past.at(-1)?.label,
      redoLabel: future.at(-1)?.label,
    });
    options.onChange?.(spec);
  };

  /** Commit a new spec under an undo `label`: snapshot the previous one (coalescing
   *  bursts), mint ids so new clips are identity-stable, then apply. */
  const commit = (raw: VixelSpec, label = 'Edit') => {
    const prev = store.getState().spec;
    if (raw === prev) return;
    const spec = mintIds(raw);
    const t = nowMs();
    // A "fresh" gesture (a gap since the last edit) starts a new undo step; rapid
    // ticks within the window slide the timestamp without adding a step — so the
    // step keeps the FIRST edit's label (one "Trim clip" for a whole drag).
    if (t - lastTouch >= COALESCE_MS) {
      past.push({ spec: prev, label });
      if (past.length > MAX_HISTORY) past.shift();
    }
    future = [];
    lastTouch = t;
    applySpec(spec);
  };

  return {
    setSpec: (spec) => commit(spec, 'Replace composition'),
    getSpec: () => store.getState().spec,
    requestExport: () => options.onExport?.(store.getState().spec),

    // The STANDARD edit path — typed, id-addressed, labeled (UI + agents + telemetry).
    dispatch: (command) =>
      commit(applyCommand(store.getState().spec, command), command.label ?? commandLabel(command)),

    undo: () => {
      if (!past.length) return;
      const entry = past.pop()!;
      future.push({ spec: store.getState().spec, label: entry.label });
      lastTouch = -Infinity; // the next edit starts a fresh step
      applySpec(entry.spec);
    },
    redo: () => {
      if (!future.length) return;
      const entry = future.pop()!;
      past.push({ spec: store.getState().spec, label: entry.label });
      lastTouch = -Infinity;
      applySpec(entry.spec);
    },
    clearHistory: () => {
      past = [];
      future = [];
      lastTouch = -Infinity;
      store.setState({ canUndo: false, canRedo: false, undoLabel: undefined, redoLabel: undefined });
    },

    select: (target) => {
      // Position → stable id at issue time; the stored ref then survives any edit.
      const sel: SelectionRef | null = target
        ? selectionRefAt(store.getState().spec, target.kind, target.trackIndex, target.itemIndex)
        : null;
      store.setState({ selection: sel, selectedSeam: null });
      options.onSelect?.(sel);
    },
    selectSeam: (target) =>
      store.setState({
        selectedSeam: target ? seamRefAt(store.getState().spec, target.trackIndex, target.gap) : null,
        selection: null,
      }),
    setTransition: (trackIndex, gap, ref) =>
      commit(withTransition(store.getState().spec, trackIndex, gap, ref)),
    setPlayhead: (sec) =>
      store.setState((s) => ({ playheadSec: Math.max(0, Math.min(sec, s.durationSec)) })),
    setZoom: (pxPerSec) => store.setState({ pxPerSec: Math.max(1, pxPerSec) }),
    play: () => store.setState({ isPlaying: true }),
    pause: () => store.setState({ isPlaying: false }),
    togglePlay: () => store.setState((s) => ({ isPlaying: !s.isPlaying })),

    updateClip: (trackIndex, clipIndex, patch: Partial<ClipPatch>) =>
      commit(withClipPatch(store.getState().spec, trackIndex, clipIndex, patch)),
    moveClip: (trackIndex, fromIndex, toIndex) =>
      commit(withClipMoved(store.getState().spec, trackIndex, fromIndex, toIndex)),
    removeClip: (trackIndex, clipIndex) =>
      commit(withClipRemoved(store.getState().spec, trackIndex, clipIndex)),
    splitClip: (trackIndex, clipIndex, tInSec) =>
      commit(withClipSplit(store.getState().spec, trackIndex, clipIndex, tInSec)),
    duplicateClip: (trackIndex, clipIndex) =>
      commit(withClipDuplicated(store.getState().spec, trackIndex, clipIndex)),
    addClipInNewLane: (clip, laneIndex) =>
      commit(withClipInNewLane(store.getState().spec, clip, clip.at ?? 0, laneIndex)),
    addClipAuto: (clip) =>
      commit(withClipAutoPlaced(store.getState().spec, clip, clip.at ?? 0)),
    moveLane: (fromIndex, toIndex) => commit(withTrackMoved(store.getState().spec, fromIndex, toIndex)),
    setTrackHidden: (trackIndex, hidden) => commit(withTrackHidden(store.getState().spec, trackIndex, hidden)),
    setTrackMuted: (trackIndex, muted) => commit(withTrackMuted(store.getState().spec, trackIndex, muted)),

    updateAudioItem: (trackIndex, itemIndex, patch) =>
      commit(withAudioPatch(store.getState().spec, trackIndex, itemIndex, patch)),
    removeAudioItem: (trackIndex, itemIndex) =>
      commit(withAudioRemoved(store.getState().spec, trackIndex, itemIndex)),

    addClip: (clip) => commit(withClipAppended(store.getState().spec, clip)),
    addAudioItem: (item) => commit(withAudioItemAppended(store.getState().spec, item)),
    setOutput: (patch) => commit(withOutputPatch(store.getState().spec, patch)),
  };
}
