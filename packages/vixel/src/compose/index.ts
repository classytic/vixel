/**
 * Compose — the declarative composition primitive (schema = the MCP surface).
 *
 * Today this exports the full {@link VixelSpec} schema an agent emits. The
 * `compose()` renderer (ffmpeg `filter_complex` graph) lands in a dedicated
 * slice; the schema is published now so agents/tools can target a stable shape.
 *
 * Fidelity note: this is the FAST tier. gl-transitions, shapes, and custom shaders
 * are approximated here (e.g. a 3D `cube` transition degrades to `xfade`). For a
 * byte-for-byte match with the editor preview, render through the opt-in
 * `@classytic/vixel-render-pixi` package, which auto-routes to this tier when a
 * spec doesn't need the premium renderer.
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
// Effects — descriptors (contract, in schema) + resolvers (ffmpeg, in engine).
// Register a BYO filter-kind effect with registerEffect; the editor introspects
// BUILTIN_EFFECTS for its panel and the engine resolves them in the clip chain.
export {
  registerEffect,
  hasEffect,
  buildEffectsFilter,
  type EffectResolver,
} from '../effects/index.js';
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
export { registerTransition, resolveTransitionXfade, type TransitionResolver } from './transitions.js';
export {
  detectBeats,
  pickOnsets,
  estimateBpm,
  beatSyncSpec,
  type DetectBeatsConfig,
  type BeatDetectionResult,
  type BeatSyncOptions,
} from './beat-sync.js';
