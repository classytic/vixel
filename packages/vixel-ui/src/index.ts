/**
 * @classytic/vixel-ui — headless React editor primitives over the vixel
 * composition contract. The root + store live here; timeline/transport/shared
 * primitives are subpath exports (`@classytic/vixel-ui/timeline`, etc.) so apps
 * only bundle what they enable.
 */

// Root + store + hooks
export {
  VixelEditor,
  useEditorState,
  useShallowEditorState,
  useEditorActions,
  useEditorSpec,
  useSelectedItem,
  useFeature,
  createEditorStore,
  createEditorActions,
  EditorStoreContext,
  EditorActionsContext,
} from './editor/index.js';
export type {
  EditorStore,
  CreateEditorStoreOptions,
  CreateEditorActionsOptions,
} from './editor/index.js';

// Styled, ready-to-use compositions (reference implementations)
export { StandardEditor } from './examples/index.js';
export type { StandardEditorProps } from './examples/index.js';

// Public contracts
export { ALL_FEATURES } from './types.js';
export type {
  FeatureConfig,
  SelectionKind,
  SelectionTarget,
  SelectionRef,
  SeamTarget,
  SeamRef,
  EditorState,
  EditorActions,
  ClipPatch,
  VixelEditorProps,
  Track,
  VixelSpec,
} from './types.js';

// Selection resolution (position ⇄ stable id) — for hosts/agents driving selection.
export {
  resolveSelection,
  resolveSeam,
  selectionRefAt,
  seamRefAt,
  pruneSelection,
  pruneSeam,
} from './shared/utils/selection.js';
export type { ResolvedSelection, ResolvedSeam } from './shared/utils/selection.js';
