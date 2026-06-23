export { VixelEditor } from './primitives/VixelEditor.js';

export {
  useEditorState,
  useShallowEditorState,
  useEditorActions,
  useEditorSpec,
  useSelectedItem,
} from './controller/hooks/useEditorStore.js';
export { useFeature } from './controller/hooks/useFeature.js';

export {
  createEditorStore,
  createEditorActions,
} from './controller/store/createEditorStore.js';
export type {
  EditorStore,
  CreateEditorStoreOptions,
  CreateEditorActionsOptions,
} from './controller/store/createEditorStore.js';

export { EditorStoreContext, EditorActionsContext } from './controller/context/EditorContext.js';

// The typed, id-addressed command vocabulary (the standard edit path via
// `actions.dispatch`). Re-exported here for command palettes / agent bridges.
export { applyCommand, commandLabel } from '../shared/utils/commands.js';
export type { EditorCommand, EditorCommandType } from '../shared/utils/commands.js';
