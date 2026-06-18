/**
 * `<VixelEditor>` — the editor root and props-in client boundary.
 *
 * Owns the external store, provides it (+ actions) via context, and keeps the
 * controlled `spec` prop in sync (e.g. a fresh agent emission). Capabilities are
 * gated by the `features` prop so a client app exposes only the subset it needs.
 *
 * @example
 * ```tsx
 * <VixelEditor spec={spec} features={{ transitions: true }} onChange={save}>
 *   <Timeline>…</Timeline>
 * </VixelEditor>
 * ```
 */
'use client';

import { useEffect, useRef } from 'react';
import { EditorStoreContext, EditorActionsContext } from '../controller/context/EditorContext.js';
import {
  createEditorStore,
  createEditorActions,
  type EditorStore,
} from '../controller/store/createEditorStore.js';
import { totalDurationSec } from '../../shared/utils/spec.js';
import { TimelineDndProvider } from '../../timeline/controller/DndContext.js';
import { LiveRegionProvider } from '../../a11y/live-region.js';
import { ALL_FEATURES } from '../../types.js';
import type { EditorActions, VixelEditorProps, VixelSpec, SelectionRef } from '../../types.js';

/** Is a selection ref still in-bounds for this spec? (Index-based selection can
 *  dangle after an external spec replacement or a destructive edit.) */
function selectionValid(spec: VixelSpec, sel: SelectionRef | null): boolean {
  if (!sel) return true;
  const track = spec.tracks[sel.trackIndex];
  if (!track) return false;
  const len = track.type === 'visual' ? track.clips.length : track.items.length;
  return sel.itemIndex >= 0 && sel.itemIndex < len;
}

export function VixelEditor({
  spec,
  features,
  pxPerSec,
  onChange,
  onExport,
  onSelect,
  className,
  children,
}: VixelEditorProps) {
  // Latest host callbacks, read indirectly so actions stay stable across renders.
  const cbRef = useRef<{
    onChange?: (s: VixelSpec) => void;
    onExport?: (s: VixelSpec) => void;
    onSelect?: (r: SelectionRef | null) => void;
  }>({ onChange, onExport, onSelect });
  cbRef.current = { onChange, onExport, onSelect };

  // Create store + actions exactly once (seeded from the initial props).
  const storeRef = useRef<EditorStore | null>(null);
  const actionsRef = useRef<EditorActions | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createEditorStore({ spec, features, pxPerSec });
    actionsRef.current = createEditorActions(storeRef.current, {
      onChange: (s) => cbRef.current.onChange?.(s),
      onExport: (s) => cbRef.current.onExport?.(s),
      onSelect: (r) => cbRef.current.onSelect?.(r),
    });
  }
  const store = storeRef.current;
  const actions = actionsRef.current!;

  // Controlled `spec`: re-seed only on a GENUINE external replacement.
  // A controlled parent echoes our own internal edits back through the `spec` prop
  // (commit → onChange → parent setState → new prop). That echoed spec is ALREADY
  // in the store, so re-seeding it would needlessly clear selection / the selected
  // seam on EVERY edit (e.g. dragging a transition's duration slider would deselect
  // the seam). So: ignore the echo (`spec === store spec`); only a spec the store
  // does NOT already hold is a real external update (a fresh agent emission) — then
  // revalidate the index-based selection/seam, which may now dangle.
  const lastSpecRef = useRef<VixelSpec>(spec);
  useEffect(() => {
    if (spec === lastSpecRef.current) return;
    lastSpecRef.current = spec;
    if (spec === store.getState().spec) return; // echo of an internal commit — no-op
    const cur = store.getState();
    const selection = selectionValid(spec, cur.selection) ? cur.selection : null;
    store.setState({ spec, durationSec: totalDurationSec(spec), selection, selectedSeam: null });
    actions.clearHistory(); // a genuine external replacement starts a fresh undo history
  }, [spec, store, actions]);

  // Undo / redo keyboard shortcuts (Ctrl/Cmd+Z, Shift+Z or Ctrl+Y to redo). Scoped
  // to the window but yields to native text-editing undo when an input is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      if (k === 'y' || (k === 'z' && e.shiftKey)) actions.redo();
      else actions.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  // `features` + `pxPerSec` are CONTROLLED too (not just initial seeds): sync them
  // when the parent passes a new value, so live capability/zoom changes take effect
  // without remounting the editor (no `key=` workaround).
  const lastFeaturesRef = useRef(features);
  useEffect(() => {
    if (features !== lastFeaturesRef.current) {
      lastFeaturesRef.current = features;
      store.setState({ features: { ...ALL_FEATURES, ...features } });
    }
  }, [features, store]);

  const lastPxRef = useRef(pxPerSec);
  useEffect(() => {
    if (pxPerSec != null && pxPerSec !== lastPxRef.current) {
      lastPxRef.current = pxPerSec;
      store.setState({ pxPerSec: Math.max(1, pxPerSec) });
    }
  }, [pxPerSec, store]);

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorActionsContext.Provider value={actions}>
        {/* One per-editor DnD controller, shared by panels (drag sources) + the
            timeline (drop resolver + indicators). No module globals. */}
        <TimelineDndProvider>
          {/* Screen-reader announcer — item actions / drag commits announce results. */}
          <LiveRegionProvider>
            <div className={className} data-vixel-editor="">
              {children}
            </div>
          </LiveRegionProvider>
        </TimelineDndProvider>
      </EditorActionsContext.Provider>
    </EditorStoreContext.Provider>
  );
}
