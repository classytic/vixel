/**
 * @classytic/vixel-render-pixi — premium WYSIWYG server export for vixel.
 * =====================================================================
 * Renders the SAME Pixi scene as the editor through a headless browser, so
 * gl-transitions / shapes / shaders that the ffmpeg filtergraph can't do are
 * byte-for-byte what you previewed. Opt-in and dependency-light: bring your own
 * browser driver (`playwright-core` or `puppeteer-core`) and `@classytic/vixel-ui`.
 *
 * - {@link composeAuto} — capability-aware router (recommended entry).
 * - {@link renderSpecWithPixi} — force the Pixi tier.
 * - {@link specNeedsPixi} / {@link canRenderWithPixi} — introspection.
 */
export { composeAuto, canRenderWithPixi } from './compose-auto.js';
export type { ComposeAutoOptions, ComposeAutoResult, Logger } from './compose-auto.js';
export { renderSpecWithPixi, bundlesResolvable } from './render.js';
export type { PixiRenderOptions } from './render.js';
export { specNeedsPixi } from './detect.js';
export type { PixiNeed } from './detect.js';
export { resolveDriver } from './driver.js';
export type { BrowserDriver, DriverPage, DriverBrowser, LaunchOptions } from './driver.js';
