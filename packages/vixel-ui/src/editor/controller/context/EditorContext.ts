'use client';

import { createContext } from 'react';
import type { EditorStore } from '../store/createEditorStore.js';
import type { EditorActions } from '../../../types.js';

/** The external editor store (state). Provided by {@link VixelEditor}. */
export const EditorStoreContext = createContext<EditorStore | null>(null);

/** Imperative editor actions. Provided by {@link VixelEditor}. */
export const EditorActionsContext = createContext<EditorActions | null>(null);
