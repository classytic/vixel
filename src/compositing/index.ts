/**
 * Compositing — descriptor-backed primitives (the `mixer2` family).
 * =================================================================
 * blend · chromaKey · mask. Each ships a {@link VixelPrimitiveDescriptor}, so
 * an agent or an editor UI can enumerate them and their parameters as data.
 * See DESIGN.md.
 */

import type { VixelPrimitiveDescriptor } from '../core/descriptor.js';
import { blendDescriptor } from './blend.js';
import { chromaKeyDescriptor } from './chroma-key.js';
import { maskDescriptor } from './mask.js';

export { blend, buildBlendFilter, blendDescriptor, BLEND_MODES, type BlendMode, type BlendConfig, type BlendResult } from './blend.js';
export { chromaKey, buildChromaKeyGraph, chromaKeyDescriptor, type ChromaKeyConfig, type ChromaKeyResult } from './chroma-key.js';
export { mask, buildMaskFilter, maskDescriptor, type MaskShape, type MaskConfig, type MaskResult } from './mask.js';

/** The compositing primitive catalog — published as data for agents/editor hosts. */
export const COMPOSITING_DESCRIPTORS: readonly VixelPrimitiveDescriptor[] = [
  blendDescriptor,
  chromaKeyDescriptor,
  maskDescriptor,
];
