/**
 * AgentContext — the ONE seam a host implements to let the vixel agent tools read,
 * edit, and SEE a composition.
 * ============================================================================
 * The tools (`./tools`) are pure descriptions + executors; they own no state and open
 * no connections. Everything stateful/IO is injected here so the SAME tools run in two
 * places (the ADR's "one definition, both transports"):
 *   • server (vidra-agent): `applyEdit` writes the Mongo-persisted spec, `render` calls
 *     the headless Pixi renderer, `providers` are the host's stock/TTS/transcribe.
 *   • browser (vidra-web): `applyEdit` dispatches into the live editor store (instant
 *     preview + undo), `render` uses the mounted canvas.
 *
 * Edits are expressed as id-addressed {@link EditorCommand}s — the host applies them
 * (and records undo) via `@classytic/vixel-schema`'s `applyCommand`. vixel-agent only
 * PRODUCES commands; it never reduces them — and the reducer is in the zero-dep schema,
 * so this package depends on NOTHING but the schema + zod.
 */
import type { VixelSpec, AsrWord, EditorCommand } from '@classytic/vixel-schema';

export type { EditorCommand };

/** A rendered frame the agent can look at. The host picks the encoding (URL vs bytes). */
export interface ImageRef {
  /** Project frame this was rendered at. */
  frame: number;
  /** A URL / data-URL the agent or chat UI can display. */
  url?: string;
  /** Base64 (no data-URL prefix) when not a URL. */
  base64?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

/** The outcome of an {@link AgentContext.applyEdit}. */
export interface EditResult {
  /** The spec AFTER the edit (already minted/normalized by the host). */
  spec: VixelSpec;
  /** The undo label the host recorded. */
  label: string;
}

/** A semantic media-search hit (source-time range). */
export interface MediaHit {
  ref: string;
  startSec?: number;
  endSec?: number;
  score?: number;
  label?: string;
}

/** Host-injected AI/media providers. All optional — tools degrade when one is absent. */
export interface AgentProviders {
  /** Transcribe a source asset / clip → word-level ASR tokens (ms-from-source). */
  transcribe?: (ref: { mediaRef?: string; clipId?: string }) => Promise<AsrWord[]>;
  /** Semantic visual+spoken search over the media library. */
  searchMedia?: (query: string, scope?: 'visual' | 'spoken' | 'both') => Promise<MediaHit[]>;
  // generate? / library? / alignAudio? — future provider slots.
}

/** What the host currently supports (gated tools report this instead of failing blind). */
export interface AgentCapabilities {
  canGenerate: boolean;
  canSearch: boolean;
  canTranscribe: boolean;
}

/** The single injected seam. Implemented by the host; consumed by every tool. */
export interface AgentContext {
  /** Read the current composition. */
  getSpec: () => Promise<VixelSpec>;
  /** Apply id-addressed commands as ONE undoable step; returns the new spec + label. */
  applyEdit: (commands: EditorCommand[], label: string) => Promise<EditResult>;
  /** Render the COMPOSITED frame at a project frame (downscale via `scale`). */
  render: (frame: number, opts?: { scale?: number }) => Promise<ImageRef>;
  /** Optional: sample `count` composited frames across `[startFrame, endFrame)`. */
  renderRange?: (startFrame: number, endFrame: number, count: number) => Promise<ImageRef[]>;
  providers?: AgentProviders;
  capabilities?: () => AgentCapabilities;
}
