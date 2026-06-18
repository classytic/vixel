export { PixiPreview } from './primitives/PixiPreview.js';
export type { PixiPreviewProps } from './primitives/PixiPreview.js';
export { TransformOverlay } from './primitives/TransformOverlay.js';
export type { TransformOverlayProps } from './primitives/TransformOverlay.js';

// Live preview audio — plays audio-track items + transition SFX in sync with the
// playhead, volume driven by the same `gainKeyframes` envelope the exporter mixes.
export { PreviewAudio } from './audio/PreviewAudio.js';
export {
  collectScheduledAudio,
  audioFrameAt,
  effectiveGainDb,
  gainToLinear,
} from './audio/schedule.js';
export type { ScheduledAudio, AudioFrame } from './audio/schedule.js';

// Lower-level renderer (for custom Pixi hosts / advanced integration).
export {
  preloadAssets,
  renderScene,
  sourceUrl,
  collectSourceUrls,
  collectFontFaces,
  loadFonts,
  PIXI_EFFECT_IDS,
  registerPixiEffect,
  trackAnimatedFilter,
  getElementLayouts,
  subscribeElementLayouts,
} from './pixi/index.js';
export type { ElementLayout } from './pixi/index.js';
export type { MediaAsset, MediaCache } from './pixi/index.js';
