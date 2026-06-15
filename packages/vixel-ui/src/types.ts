/**
 * Shared editor contracts.
 * =======================================================
 * `vixel-ui` edits a {@link VixelSpec} (the `@classytic/vixel` composition
 * contract) plus transient UI state (selection, playhead, zoom). Capabilities
 * live in the package; a client app turns on the subset it needs via
 * {@link FeatureConfig}.
 */
import type { VixelSpec, Track } from '@classytic/vixel-schema';

/**
 * Which editor capabilities are exposed in this mount. Capabilities always
 * exist in the package; a client app enables a subset (the rest tree-shake out
 * when not imported, and are gated at runtime when imported but disabled).
 */
export interface FeatureConfig {
  /** Clip-to-clip transitions UI. */
  transitions?: boolean;
  /** Ken-Burns / zoom / pan clip animation UI. */
  kenBurns?: boolean;
  /** Caption (text overlay + cues) editing. */
  captions?: boolean;
  /** Image/text overlay tracks. */
  overlays?: boolean;
  /** Multiple audio tracks (music / voice / sfx). */
  multiTrackAudio?: boolean;
  /** WebGL premium effects (provided by @classytic/vixel-effects). */
  effects?: boolean;
}

/** Every feature on — the full platform surface. */
export const ALL_FEATURES: Required<FeatureConfig> = {
  transitions: true,
  kenBurns: true,
  captions: true,
  overlays: true,
  multiTrackAudio: true,
  effects: true,
};

/** Discriminates which kind of timeline item a {@link SelectionRef} points at. */
export type SelectionKind = 'clip' | 'overlay' | 'audio';

/** A pointer into the spec identifying the currently-selected item, or `null`. */
export interface SelectionRef {
  kind: SelectionKind;
  /** Index into `spec.tracks`. */
  trackIndex: number;
  /** Index into that track's `clips` / `items`. */
  itemIndex: number;
}

/** The full editor state held by the store. */
export interface EditorState {
  /** The composition being edited — the single source of truth. */
  spec: VixelSpec;
  /** Currently-selected item, or `null`. */
  selection: SelectionRef | null;
  /** Playhead position in seconds. */
  playheadSec: number;
  /** Total composition duration in seconds (derived from `spec`). */
  durationSec: number;
  /** Horizontal zoom — pixels per second. */
  pxPerSec: number;
  /** Whether preview playback is running. */
  isPlaying: boolean;
  /** Enabled capabilities for this mount. */
  features: Required<FeatureConfig>;
}

/** Imperative actions — every spec mutation is immutable and fires `onChange`. */
export interface EditorActions {
  /** Replace the whole spec (e.g. a fresh agent emission). */
  setSpec: (spec: VixelSpec) => void;
  /** Read the current spec (for export via `compose`). */
  getSpec: () => VixelSpec;
  /** Ask the host to export the current spec (fires `onExport`). */
  requestExport: () => void;

  // ── selection / transport (UI state) ──
  select: (ref: SelectionRef | null) => void;
  setPlayhead: (sec: number) => void;
  setZoom: (pxPerSec: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;

  // ── clip edits (video track) ──
  updateClip: (trackIndex: number, clipIndex: number, patch: Partial<ClipPatch>) => void;
  moveClip: (trackIndex: number, fromIndex: number, toIndex: number) => void;
  removeClip: (trackIndex: number, clipIndex: number) => void;

  // ── overlay / audio edits (globally-timed tracks) ──
  updateTrackItem: (trackIndex: number, itemIndex: number, patch: Record<string, unknown>) => void;
  removeTrackItem: (trackIndex: number, itemIndex: number) => void;
}

/** Patchable clip fields (subset of vixel's `Clip` an editor mutates directly). */
export interface ClipPatch {
  in: number;
  out: number;
  duration: number;
  volume: number;
  fit: NonNullable<import('@classytic/vixel-schema').Clip['fit']>;
  transition: NonNullable<import('@classytic/vixel-schema').Clip['transition']>;
  animation: NonNullable<import('@classytic/vixel-schema').Clip['animation']>;
}

/** Props for the {@link VixelEditor} root — the props-in client boundary. */
export interface VixelEditorProps {
  /** The composition to edit. */
  spec: VixelSpec;
  /** Enabled capabilities (defaults to all). */
  features?: FeatureConfig;
  /** Initial zoom in pixels per second (default 100). */
  pxPerSec?: number;
  /** Fired on every spec mutation with the next immutable spec. */
  onChange?: (spec: VixelSpec) => void;
  /** Fired when the user requests export (host calls `compose(spec)`). */
  onExport?: (spec: VixelSpec) => void;
  /** Fired when selection changes. */
  onSelect?: (ref: SelectionRef | null) => void;
  className?: string;
  children?: React.ReactNode;
}

export type { Track, VixelSpec };
