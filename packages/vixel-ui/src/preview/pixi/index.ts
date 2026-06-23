/**
 * Public barrel for the Pixi renderer — the framework-free, headless/server
 * surface. Exposes the scene renderer + its support functions WITHOUT pulling React
 * (unlike the `../preview` barrel, which also exports `<PixiPreview>`). The premium
 * server export (`@classytic/vixel-render-pixi`) imports THIS in a headless browser,
 * so the only import-map entry it needs is the schema — no React on the server.
 *
 * You pass the dynamically-imported `pixi.js` runtime in (it's never imported
 * here), keeping this subpath dependency-light.
 */
export {
  renderScene,
  disposeScene,
  preloadAssets,
  disposeMediaCache,
  evictUnused,
  awaitVideoSeeks,
  sourceUrl,
  collectSourceUrls,
  collectMediaKeys,
  mediaCacheKey,
  collectFontFaces,
  loadFonts,
  loadLuts,
  loadShaders,
  loadEffectTextures,
  collectEffectTextureUrls,
  PIXI_EFFECT_IDS,
  registerPixiEffect,
  trackAnimatedFilter,
  getElementLayouts,
  subscribeElementLayouts,
  clearElementLayouts,
} from './scene.js';
export type { Pixi, MediaAsset, MediaCache, ElementLayout, RetainedNode, RetainedScene } from './scene.js';
export { createApp, destroyApp } from './app.js';
export type { CreateAppOptions } from './app.js';
