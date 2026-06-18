/**
 * Shared editor contracts.
 * =======================================================
 * `vixel-ui` edits a {@link VixelSpec} (the `@classytic/vixel` composition
 * contract) plus transient UI state (selection, playhead, zoom). Capabilities
 * live in the package; a client app turns on the subset it needs via
 * {@link FeatureConfig}.
 */
import type { VixelSpec, Track, VisualClip, AudioItem } from '@classytic/vixel-schema';

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
  /** Caption (text clip + cues) editing. */
  captions?: boolean;
  /** Extra visual lanes beyond the main track (text/image/video/shape on their own lanes). */
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

/**
 * Discriminates which kind of timeline item a {@link SelectionRef} points at.
 * Every visual lane item is a `clip` (image/video/text/shape/effect — the kind is
 * `clip.media.kind`); audio items are `audio`.
 */
export type SelectionKind = 'clip' | 'audio';

/** A pointer into the spec identifying the currently-selected item, or `null`. */
export interface SelectionRef {
  kind: SelectionKind;
  /** Index into `spec.tracks`. */
  trackIndex: number;
  /** Index into that lane's `clips` / `items`. */
  itemIndex: number;
}

/** A transition seam — the gap between clips `gap` and `gap + 1` of a sequential visual lane. */
export interface SeamRef {
  trackIndex: number;
  gap: number;
}

/** The full editor state held by the store. */
export interface EditorState {
  /** The composition being edited — the single source of truth. */
  spec: VixelSpec;
  /** Currently-selected item, or `null`. */
  selection: SelectionRef | null;
  /** Currently-selected transition seam (gap between clips `gap`/`gap+1`), or `null`. */
  selectedSeam: SeamRef | null;
  /** Playhead position in seconds. */
  playheadSec: number;
  /** Total composition duration in seconds (derived from `spec`). */
  durationSec: number;
  /** Horizontal zoom — pixels per second. */
  pxPerSec: number;
  /** Whether preview playback is running. */
  isPlaying: boolean;
  /** Whether there is an edit to undo / redo (drives toolbar buttons). */
  canUndo: boolean;
  canRedo: boolean;
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

  // ── history (undo / redo) ──
  /** Revert the last edit (rapid bursts like a drag coalesce into one step). */
  undo: () => void;
  /** Re-apply the last undone edit. */
  redo: () => void;
  /** Drop all history (e.g. after an external spec replacement / fresh load). */
  clearHistory: () => void;

  // ── selection / transport (UI state) ──
  select: (ref: SelectionRef | null) => void;
  /** Select a transition seam (clears item selection); `null` to deselect. */
  selectSeam: (seam: SeamRef | null) => void;
  /** Set (or clear) the transition on a seam — writes `VisualTrack.transitions[]`. */
  setTransition: (trackIndex: number, gap: number, ref: import('@classytic/vixel-schema').TransitionRef | null) => void;
  setPlayhead: (sec: number) => void;
  setZoom: (pxPerSec: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;

  // ── clip edits (any visual lane) ──
  updateClip: (trackIndex: number, clipIndex: number, patch: Partial<ClipPatch>) => void;
  /** Reorder a clip within a sequential lane (re-flows `at`). */
  moveClip: (trackIndex: number, fromIndex: number, toIndex: number) => void;
  removeClip: (trackIndex: number, clipIndex: number) => void;
  /** Split a clip at `tInSec` into its on-screen duration → two clips. */
  splitClip: (trackIndex: number, clipIndex: number, tInSec: number) => void;
  /** Duplicate a clip in place (a copy right after it). */
  duplicateClip: (trackIndex: number, clipIndex: number) => void;
  /** Add a clip on its OWN new visual lane (defaults to the top lane). */
  addClipInNewLane: (clip: VisualClip, laneIndex?: number) => void;
  /**
   * Smart-place a clip at its `at` (CapCut-style): REUSE a compatible lane's free
   * gap before spawning a new lane — so repeatedly adding effects/overlays packs
   * them onto existing lanes instead of stacking a fresh lane each time.
   */
  addClipAuto: (clip: VisualClip) => void;
  /** Move a whole visual lane to another stacking position (re-layering). */
  moveLane: (fromIndex: number, toIndex: number) => void;

  // ── audio edits ──
  updateAudioItem: (trackIndex: number, itemIndex: number, patch: Partial<AudioItem>) => void;
  removeAudioItem: (trackIndex: number, itemIndex: number) => void;

  // ── add content (appends to the first matching lane, creating it if absent) ──
  addClip: (clip: VisualClip) => void;
  addAudioItem: (item: AudioItem) => void;
  /** Patch the composition output (size / fps / background). */
  setOutput: (patch: Partial<VixelSpec['output']>) => void;
}

/** Patchable clip fields (subset of a {@link VisualClip} an editor mutates directly). */
export interface ClipPatch {
  at: number;
  duration: number;
  volume: number;
  muted: boolean;
  hidden: boolean;
  media: VisualClip['media'];
  enter: NonNullable<VisualClip['enter']>;
  exit: NonNullable<VisualClip['exit']>;
  animation: NonNullable<VisualClip['animation']>;
  effects: NonNullable<VisualClip['effects']>;
  transform: NonNullable<VisualClip['transform']>;
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
