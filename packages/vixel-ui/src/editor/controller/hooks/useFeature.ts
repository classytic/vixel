/**
 * Capability gate. Primitives call this to no-op when a client app disabled the
 * feature for this mount. Capabilities always exist in the package; exposure is
 * the client's choice.
 */
'use client';

import { useEditorState } from './useEditorStore.js';
import type { FeatureConfig } from '../../../types.js';

export function useFeature(name: keyof FeatureConfig): boolean {
  return useEditorState((s) => s.features[name]);
}
