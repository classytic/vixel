/**
 * Rendered-element layout store. The Pixi renderer publishes each element's EXACT
 * box (from the real render) here; a DOM overlay (the transform gizmo) subscribes
 * via `useSyncExternalStore` so it frames elements precisely instead of guessing.
 */
import type { ElementLayout } from './types.js';

let layoutStore: Map<string, ElementLayout> = new Map();
const layoutSubs = new Set<() => void>();

/** Snapshot of the last published rendered-element layouts (see `renderScene`). */
export function getElementLayouts(): Map<string, ElementLayout> {
  return layoutStore;
}

/** Subscribe to rendered-layout updates (for `useSyncExternalStore`). */
export function subscribeElementLayouts(cb: () => void): () => void {
  layoutSubs.add(cb);
  return () => layoutSubs.delete(cb);
}

export function publishLayouts(next: Map<string, ElementLayout>): void {
  // Merge (not replace) so an element's EXACT last-rendered box — carrying its true
  // aspect — survives when it scrolls off the playhead, keeping the transform gizmo
  // accurate for a selected-but-off-screen element instead of falling back to a guess.
  layoutStore = new Map([...layoutStore, ...next]);
  layoutSubs.forEach((c) => c());
}

/**
 * Reset the layout store. Because {@link publishLayouts} intentionally MERGES (never
 * evicts), a preview MUST clear on unmount — otherwise its boxes leak into the next
 * mount, and a second concurrent editor would read this one's stale entries. (This
 * store is module-global; a future per-editor refactor would scope it to context.)
 */
export function clearElementLayouts(): void {
  if (layoutStore.size === 0) return;
  layoutStore = new Map();
  layoutSubs.forEach((c) => c());
}
