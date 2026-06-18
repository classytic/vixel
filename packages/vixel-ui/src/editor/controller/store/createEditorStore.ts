/**
 * Editor store — an external store over the {@link VixelSpec}.
 * =======================================================
 * A tiny `getState`/`setState`/`subscribe` store (the same pattern as
 * `@classytic/react-media`) consumed via `useSyncExternalStore` so high-frequency
 * updates (playhead, zoom) re-render only the primitives that select them. Every
 * spec mutation is immutable and notifies through `onChange`.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import type {
  EditorState,
  EditorActions,
  SelectionRef,
  FeatureConfig,
  ClipPatch,
} from '../../../types.js';
import { ALL_FEATURES } from '../../../types.js';
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
  withAudioPatch,
  withAudioRemoved,
  withClipAppended,
  withAudioItemAppended,
  withOutputPatch,
  withTransition,
} from '../../../shared/utils/spec.js';

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
  let state: EditorState = {
    spec: opts.spec,
    selection: null,
    selectedSeam: null,
    playheadSec: 0,
    durationSec: totalDurationSec(opts.spec),
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

/** Selection can dangle after a structural undo/redo (a referenced clip vanished). */
function validSelection(spec: VixelSpec, sel: SelectionRef | null): SelectionRef | null {
  if (!sel) return null;
  const track = spec.tracks[sel.trackIndex];
  if (!track) return null;
  const len = track.type === 'visual' ? track.clips.length : track.items.length;
  return sel.itemIndex >= 0 && sel.itemIndex < len ? sel : null;
}

/** Bind imperative {@link EditorActions} to a store + host callbacks. */
export function createEditorActions(
  store: EditorStore,
  options: CreateEditorActionsOptions = {},
): EditorActions {
  // Undo/redo history of FULL specs (edits are immutable + structurally shared, so a
  // snapshot is cheap). `past` = states to undo into, `future` = redo targets.
  let past: VixelSpec[] = [];
  let future: VixelSpec[] = [];
  // Timestamp of the last commit (for burst coalescing). −Infinity ⇒ the next edit
  // ALWAYS starts a fresh undo step (the first edit, and the first after undo/redo).
  let lastTouch = -Infinity;

  /** Push `spec` to the store + derived state, revalidate selection, fire onChange. */
  const applySpec = (spec: VixelSpec) => {
    const durationSec = totalDurationSec(spec);
    const playheadSec = Math.min(store.getState().playheadSec, durationSec);
    const selection = validSelection(spec, store.getState().selection);
    store.setState({ spec, durationSec, playheadSec, selection, canUndo: past.length > 0, canRedo: future.length > 0 });
    options.onChange?.(spec);
  };

  /** Commit a new spec: snapshot the previous one for undo (coalescing bursts). */
  const commit = (spec: VixelSpec) => {
    const prev = store.getState().spec;
    if (spec === prev) return;
    const t = nowMs();
    // A "fresh" gesture (a gap since the last edit) starts a new undo step; rapid
    // ticks within the window slide the timestamp without adding a step.
    if (t - lastTouch >= COALESCE_MS) {
      past.push(prev);
      if (past.length > MAX_HISTORY) past.shift();
    }
    future = [];
    lastTouch = t;
    applySpec(spec);
  };

  return {
    setSpec: (spec) => commit(spec),
    getSpec: () => store.getState().spec,
    requestExport: () => options.onExport?.(store.getState().spec),

    undo: () => {
      if (!past.length) return;
      future.push(store.getState().spec);
      const prev = past.pop()!;
      lastTouch = -Infinity; // the next edit starts a fresh step
      applySpec(prev);
    },
    redo: () => {
      if (!future.length) return;
      past.push(store.getState().spec);
      const next = future.pop()!;
      lastTouch = -Infinity;
      applySpec(next);
    },
    clearHistory: () => {
      past = [];
      future = [];
      lastTouch = -Infinity;
      store.setState({ canUndo: false, canRedo: false });
    },

    select: (ref) => {
      store.setState({ selection: ref, selectedSeam: null });
      options.onSelect?.(ref);
    },
    selectSeam: (seam) => store.setState({ selectedSeam: seam, selection: null }),
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

    updateAudioItem: (trackIndex, itemIndex, patch) =>
      commit(withAudioPatch(store.getState().spec, trackIndex, itemIndex, patch)),
    removeAudioItem: (trackIndex, itemIndex) =>
      commit(withAudioRemoved(store.getState().spec, trackIndex, itemIndex)),

    addClip: (clip) => commit(withClipAppended(store.getState().spec, clip)),
    addAudioItem: (item) => commit(withAudioItemAppended(store.getState().spec, item)),
    setOutput: (patch) => commit(withOutputPatch(store.getState().spec, patch)),
  };
}
