/**
 * Editor store hooks — selector-based state access (React 19).
 * Uses `useSyncExternalStore` so a component re-renders only when its selected
 * slice changes. `useShallowEditorState` does a shallow compare for object
 * selectors (e.g. selecting `{ playheadSec, durationSec }`).
 */
'use client';

import { use, useCallback, useRef, useSyncExternalStore } from 'react';
import { EditorStoreContext, EditorActionsContext } from '../context/EditorContext.js';
import { resolveSelection } from '../../../shared/utils/selection.js';
import type { EditorState, EditorActions } from '../../../types.js';

/** Select a slice of editor state (re-renders on `Object.is` change). */
export function useEditorState<T>(selector: (state: EditorState) => T): T {
  const store = use(EditorStoreContext);
  if (!store) throw new Error('useEditorState must be used within a <VixelEditor>');

  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => selectorRef.current(store.getState()), [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Select an object slice with shallow equality (avoids needless re-renders). */
export function useShallowEditorState<T extends object>(selector: (state: EditorState) => T): T {
  const store = use(EditorStoreContext);
  if (!store) throw new Error('useShallowEditorState must be used within a <VixelEditor>');

  const prevRef = useRef<T | null>(null);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.getState());
    const prev = prevRef.current;
    if (prev !== null) {
      // Compare key COUNT first: a fixed-shape selector is the common case, but
      // this is public API — a selector whose key set shrinks/grows between calls
      // must not be treated as equal just because every key in `next` matched.
      let equal = Object.keys(prev).length === Object.keys(next).length;
      if (equal) {
        for (const key in next) {
          if (!Object.is(prev[key], next[key])) {
            equal = false;
            break;
          }
        }
      }
      if (equal) return prev;
    }
    prevRef.current = next;
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Access the imperative editor actions. */
export function useEditorActions(): EditorActions {
  const actions = use(EditorActionsContext);
  if (!actions) throw new Error('useEditorActions must be used within a <VixelEditor>');
  return actions;
}

/** Convenience: the current spec (re-renders when the spec identity changes). */
export function useEditorSpec() {
  return useEditorState((s) => s.spec);
}

/**
 * The currently-selected timeline item (a visual clip or an audio item) + its
 * selection ref, or `{ selection: null, item: null }`. Shallow-compared so it
 * only re-renders when the selection or the item's reference changes.
 */
export function useSelectedItem() {
  return useShallowEditorState((s) => {
    const resolved = resolveSelection(s.spec, s.selection);
    return { selection: s.selection, item: resolved?.item ?? null };
  });
}
