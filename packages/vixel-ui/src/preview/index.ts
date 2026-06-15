export { PixiPreview } from './primitives/PixiPreview.js';
export type { PixiPreviewProps } from './primitives/PixiPreview.js';

// Lower-level renderer (for custom Pixi hosts / advanced integration).
export { preloadAssets, renderScene, sourceUrl } from './renderer/scene.js';
export type { MediaAsset, MediaCache } from './renderer/scene.js';
