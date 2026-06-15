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
import type { EditorActions, VixelEditorProps, VixelSpec, SelectionRef } from '../../types.js';

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

  // Controlled `spec`: re-seed when the parent passes a new spec reference,
  // WITHOUT firing onChange (that would loop). Internal edits never change the
  // `spec` prop, so this only runs on genuine external updates.
  const lastSpecRef = useRef<VixelSpec>(spec);
  useEffect(() => {
    if (spec !== lastSpecRef.current) {
      lastSpecRef.current = spec;
      store.setState({ spec, durationSec: totalDurationSec(spec) });
    }
  }, [spec, store]);

  return (
    <EditorStoreContext.Provider value={store}>
      <EditorActionsContext.Provider value={actions}>
        <div className={className} data-vixel-editor="">
          {children}
        </div>
      </EditorActionsContext.Provider>
    </EditorStoreContext.Provider>
  );
}
