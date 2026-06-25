/**
 * Shared editor contracts.
 * =======================================================
 * `vixel-ui` edits a {@link VixelSpec} (the `@classytic/vixel` composition
 * contract) plus transient UI state (selection, playhead, zoom). Capabilities
 * live in the package; a client app turns on the subset it needs via
 * {@link FeatureConfig}.
 */
import type { VixelSpec, Track, VisualClip, AudioItem, ClipPatch } from '@classytic/vixel-schema';
import type { EditorCommand } from './shared/utils/commands.js';

export type { EditorCommand, EditorCommandType } from './shared/utils/commands.js';
// ClipPatch moved to the schema's edit core (alongside applyCommand); re-exported here.
export type { ClipPatch } from '@classytic/vixel-schema';

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

/**
 * A POSITIONAL pointer used to ISSUE a selection — "the item at this lane/slot",
 * i.e. where the user clicked. Consumers build it from what they're rendering and
 * pass it to `select(...)`; the store immediately resolves it to a stable, id-keyed
 * {@link SelectionRef} for storage. Positions are fine as an INPUT (they name what
 * was clicked right now); they are never STORED (a later insert/move would drift).
 */
export interface SelectionTarget {
  kind: SelectionKind;
  /** Index into `spec.tracks`. */
  trackIndex: number;
  /** Index into that lane's `clips` / `items`. */
  itemIndex: number;
}

/**
 * The STORED selection — the currently-selected item addressed by stable IDENTITY,
 * or `null`. Because it names the element by `id` (not position), it survives any
 * insert / move / sort / undo above it with zero re-resolution: a stale position is
 * impossible by construction. Resolve it to a live position/item on demand with
 * `resolveSelection(spec, ref)`.
 */
export interface SelectionRef {
  kind: SelectionKind;
  /** Stable id of the selected clip / audio item. */
  id: string;
}

/** A POSITIONAL pointer to a transition seam (the gap between clips `gap`/`gap + 1`
 *  of a visual lane) used to ISSUE a seam selection. Resolved to a {@link SeamRef}. */
export interface SeamTarget {
  trackIndex: number;
  /** Lower clip index of the adjacent pair. */
  gap: number;
}

/** The STORED transition seam, addressed by stable IDS — the seam AFTER `afterClipId`
 *  on lane `trackId`. Survives edits; resolve with `resolveSeam(spec, ref)`. */
export interface SeamRef {
  /** Stable lane id. */
  trackId: string;
  /** Stable id of the clip BEFORE the seam (the seam rides with this clip). */
  afterClipId: string;
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
  /** Human-readable label of the next undo / redo step (for tooltips), if any. */
  undoLabel?: string;
  redoLabel?: string;
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

  // ── commands (the standard, id-addressed edit path) ──
  /**
   * Apply a typed, id-addressed {@link EditorCommand} — the standard edit entry
   * point: one uniform path for the UI, AI agents, and telemetry, with a
   * human-readable undo label. The imperative methods below are positional sugar
   * over the same `with*()` primitives.
   */
  dispatch: (command: EditorCommand) => void;

  // ── history (undo / redo) ──
  /** Revert the last edit (rapid bursts like a drag coalesce into one step). */
  undo: () => void;
  /** Re-apply the last undone edit. */
  redo: () => void;
  /** Drop all history (e.g. after an external spec replacement / fresh load). */
  clearHistory: () => void;

  // ── selection / transport (UI state) ──
  /** Select the item at a position (the store stores it by stable id). `null` clears. */
  select: (target: SelectionTarget | null) => void;
  /** Select a transition seam by position (clears item selection); `null` to deselect. */
  selectSeam: (seam: SeamTarget | null) => void;
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
  /** Hide / show an ENTIRE visual lane (sets `hidden` on every clip). No-op for audio. */
  setTrackHidden: (trackIndex: number, hidden: boolean) => void;
  /** Mute / unmute an ENTIRE lane — a visual lane's video clips, or all audio items
   *  (preserving each item's pre-mute gain for restore). */
  setTrackMuted: (trackIndex: number, muted: boolean) => void;

  // ── audio edits ──
  updateAudioItem: (trackIndex: number, itemIndex: number, patch: Partial<AudioItem>) => void;
  removeAudioItem: (trackIndex: number, itemIndex: number) => void;

  // ── add content (appends to the first matching lane, creating it if absent) ──
  addClip: (clip: VisualClip) => void;
  addAudioItem: (item: AudioItem) => void;
  /** Patch the composition output (size / fps / background). */
  setOutput: (patch: Partial<VixelSpec['output']>) => void;
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
