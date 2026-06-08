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
export { overlayXY, overlayWidthPx, type OverlayXY } from './layout.js';
export { buildTextOverlayAss } from './text-overlay.js';
