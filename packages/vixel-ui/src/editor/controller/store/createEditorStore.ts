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
  withItemPatch,
  withItemRemoved,
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
    playheadSec: 0,
    durationSec: totalDurationSec(opts.spec),
    pxPerSec: opts.pxPerSec ?? 100,
    isPlaying: false,
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

/** Bind imperative {@link EditorActions} to a store + host callbacks. */
export function createEditorActions(
  store: EditorStore,
  options: CreateEditorActionsOptions = {},
): EditorActions {
  /** Commit a new spec: update derived duration + clamp playhead, then notify. */
  const commit = (spec: VixelSpec) => {
    const durationSec = totalDurationSec(spec);
    const playheadSec = Math.min(store.getState().playheadSec, durationSec);
    store.setState({ spec, durationSec, playheadSec });
    options.onChange?.(spec);
  };

  return {
    setSpec: (spec) => commit(spec),
    getSpec: () => store.getState().spec,
    requestExport: () => options.onExport?.(store.getState().spec),

    select: (ref) => {
      store.setState({ selection: ref });
      options.onSelect?.(ref);
    },
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

    updateTrackItem: (trackIndex, itemIndex, patch) =>
      commit(withItemPatch(store.getState().spec, trackIndex, itemIndex, patch)),
    removeTrackItem: (trackIndex, itemIndex) =>
      commit(withItemRemoved(store.getState().spec, trackIndex, itemIndex)),
  };
}
