/**
 * Compose — the declarative composition primitive (schema = the MCP surface).
 *
 * Today this exports the full {@link VixelSpec} schema an agent emits. The
 * `compose()` renderer (ffmpeg `filter_complex` graph) lands in a dedicated
 * slice; the schema is published now so agents/tools can target a stable shape.
 */

export * from './schema.js';
export { compose, type ComposeConfig, type ComposeResult } from './render.js';
export {
  planTimeline,
  type TimelinePlan,
  type PlannedClip,
  type PlannedTransition,
} from './timeline.js';
export { buildComposeGraph, fpsNumber, type ComposeGraph, type ComposeInput } from './graph.js';
// Frame-exact time helpers — a host's zoomable timeline / ruler consumes these
// alongside planTimeline()'s frame* fields.
export { toFrames, toSeconds, snapToFrame, formatTimecode, parseTimecode } from '../core/time.js';
export { compileScalarKeyframes, type Keyframe, type KeyframeEasing } from '../core/keyframe.js';
// Load a saved project safely across vixel versions; resolve a clip's source.
export { CURRENT_SPEC_VERSION, migrateSpec, type SpecUpgrade } from '../core/schema-version.js';
export {
  isMediaReference,
  resolveToPath,
  mediaInputArgs,
  type MediaReference,
  type SourceRef,
  type GeneratorReference,
} from '../core/media-reference.js';
export { overlayXY, overlayWidthPx, type OverlayXY } from './layout.js';
export { buildTextOverlayAss } from './text-overlay.js';
export {
  TRANSITION_PRESETS,
  resolveXfadeName,
  type TransitionPreset,
  type TransitionPresetDef,
} from './transitions.js';
export {
  detectBeats,
  pickOnsets,
  estimateBpm,
  beatSyncSpec,
  type DetectBeatsConfig,
  type BeatDetectionResult,
  type BeatSyncOptions,
} from './beat-sync.js';
