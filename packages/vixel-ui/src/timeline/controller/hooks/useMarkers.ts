/**
 * `useMarkers` — the behavior primitive for timeline markers (cut/chapter/beat/note
 * anchors). Reads `spec.markers` and exposes add / remove / seek over the id-addressed
 * {@link EditorCommand}s, so the rail UI and any toolbar/keymap share ONE path (and
 * get undo labels for free). Markers are document state (they live in the spec and
 * survive export/handoff) — distinct from the transient playhead/selection.
 */
'use client';

import { useMemo } from 'react';
import type { Marker } from '@classytic/vixel-schema';
import { useEditorState, useEditorActions } from '../../../editor/controller/hooks/useEditorStore.js';

const EMPTY: readonly Marker[] = [];

export interface UseMarkers {
  /** The composition's markers, time-sorted (empty array when none). */
  markers: readonly Marker[];
  /** Add a marker at `atSec` (default: the current playhead), with optional fields. */
  add: (atSec?: number, opts?: Omit<Marker, 'at'>) => void;
  /** Remove the marker with this id. */
  remove: (markerId: string) => void;
  /** Patch a marker's fields (label / color / kind / at). */
  update: (markerId: string, patch: Partial<Omit<Marker, 'id'>>) => void;
  /** Rename a marker (convenience over {@link update}). */
  rename: (markerId: string, label: string) => void;
  /** Move the playhead to a marker. */
  seekTo: (marker: Marker) => void;
}

export function useMarkers(): UseMarkers {
  const markers = useEditorState((s) => s.spec.markers ?? EMPTY);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const actions = useEditorActions();

  return useMemo<UseMarkers>(
    () => ({
      markers,
      add: (atSec, opts) =>
        actions.dispatch({ type: 'addMarker', marker: { at: Math.max(0, atSec ?? playheadSec), ...opts } }),
      remove: (markerId) => actions.dispatch({ type: 'removeMarker', markerId }),
      update: (markerId, patch) => actions.dispatch({ type: 'updateMarker', markerId, patch }),
      rename: (markerId, label) => actions.dispatch({ type: 'updateMarker', markerId, patch: { label } }),
      seekTo: (marker) => actions.setPlayhead(marker.at),
    }),
    [markers, playheadSec, actions],
  );
}
