/**
 * The canonical tool list — the ONE source both transports bind (see `./adapters`).
 * Add a tool here and it appears in arc-ai (in-process) AND arc MCP (external) at once.
 */
import type { VixelToolSpec } from './tool-spec.js';
import { getTimeline, describeCatalogTool, inspectTimeline, getTranscript } from './tools/perception.js';
import {
  addClip,
  setClipProperties,
  splitClip,
  removeClip,
  rippleDelete,
  linkClips,
  addMarker,
  removeMarker,
} from './tools/editing.js';

export type { VixelToolSpec };

export const vixelToolSpecs: VixelToolSpec[] = [
  // perception
  getTimeline,
  describeCatalogTool,
  inspectTimeline,
  getTranscript,
  // editing
  addClip,
  setClipProperties,
  splitClip,
  removeClip,
  rippleDelete,
  linkClips,
  addMarker,
  removeMarker,
];
