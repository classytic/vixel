/**
 * Editor store hooks — selector-based state access (React 19).
 * Uses `useSyncExternalStore` so a component re-renders only when its selected
 * slice changes. `useShallowEditorState` does a shallow compare for object
 * selectors (e.g. selecting `{ playheadSec, durationSec }`).
 */
'use client';

import { use, useCallback, useRef, useSyncExternalStore } from 'react';
import { EditorStoreContext, EditorActionsContext } from '../context/EditorContext.js';
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
      let equal = true;
      for (const key in next) {
        if (!Object.is(prev[key], next[key])) {
          equal = false;
          break;
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
