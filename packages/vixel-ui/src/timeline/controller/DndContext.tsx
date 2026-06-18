/**
 * Timeline drag-and-drop — ONE per-editor context (no module globals).
 *
 * A drag is owned by one element, but its affordances (snap guide, insertion
 * marker, target-lane highlight, the floating ghost) render at the timeline level,
 * and a panel item being dragged (in a sibling subtree) must resolve a drop target
 * owned by the timeline. Rather than a global singleton, `VixelEditor` provides a
 * single {@link TimelineDnd} instance: the timeline registers its drop resolver,
 * panels + clips publish their intent, and indicators subscribe — all scoped to the
 * editor, testable, and disposable. This is the same store-behind-a-context pattern
 * the editor store uses.
 *
 * Perf: the live drag state changes on every pointer move, so it's held in a ref +
 * a subscriber set (read via `useSyncExternalStore` in {@link useTimelineDrag}) —
 * only the components that read it re-render, never the whole provider subtree.
 */
'use client';

import { createContext, use, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { TimelineDragState } from './dragStore.js';
import type { DropTarget, DropResolver } from './dropResolver.js';

/** The stable DnD API exposed to drag sources (publish), the timeline (resolver),
 *  and indicators (subscribe). Identity never changes, so consumers don't re-render. */
export interface TimelineDnd {
  /** Publish the live drag intent (null = drag ended). */
  publish(next: TimelineDragState | null): void;
  /** Subscribe to drag-state changes (for `useSyncExternalStore`). */
  subscribe(cb: () => void): () => void;
  /** Current drag state snapshot. */
  getSnapshot(): TimelineDragState | null;
  /** The timeline registers how to map a viewport point → a drop target. */
  registerResolver(fn: DropResolver | null): void;
  /** Resolve a viewport point to a drop target (used by panel drags). */
  resolve(clientX: number, clientY: number): DropTarget | null;
}

const TimelineDndContext = createContext<TimelineDnd | null>(null);

export function TimelineDndProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<TimelineDragState | null>(null);
  const subsRef = useRef<Set<() => void> | null>(null);
  if (!subsRef.current) subsRef.current = new Set();
  const resolverRef = useRef<DropResolver | null>(null);

  // Stable instance — created once, identity never changes across renders.
  const dnd = useMemo<TimelineDnd>(
    () => ({
      publish(next) {
        stateRef.current = next;
        subsRef.current!.forEach((cb) => cb());
      },
      subscribe(cb) {
        subsRef.current!.add(cb);
        return () => subsRef.current!.delete(cb);
      },
      getSnapshot() {
        return stateRef.current;
      },
      registerResolver(fn) {
        resolverRef.current = fn;
      },
      resolve(clientX, clientY) {
        return resolverRef.current ? resolverRef.current(clientX, clientY) : null;
      },
    }),
    [],
  );

  return <TimelineDndContext.Provider value={dnd}>{children}</TimelineDndContext.Provider>;
}

/** The editor's DnD controller (publish / resolve / register). Throws outside `<VixelEditor>`. */
export function useTimelineDnd(): TimelineDnd {
  const dnd = use(TimelineDndContext);
  if (!dnd) throw new Error('useTimelineDnd must be used within <VixelEditor>');
  return dnd;
}

/** Subscribe to the live drag state (null when nothing is being dragged). */
export function useTimelineDrag(): TimelineDragState | null {
  const dnd = useTimelineDnd();
  return useSyncExternalStore(dnd.subscribe, dnd.getSnapshot, () => null);
}
