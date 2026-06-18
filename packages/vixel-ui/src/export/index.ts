/**
 * `@classytic/vixel-ui/export` — in-browser export using the same Pixi renderer
 * as the live preview: MP4 ({@link exportToMp4}), still image ({@link
 * exportToImage}), and animated GIF ({@link exportToGif}). One renderer → every
 * sink is WYSIWYG with the editor.
 */
export {
  exportToMp4,
  canExportInBrowser,
  withinBrowserBudget,
  type ExportOptions,
  type ExportProgress,
} from './exportMp4.js';
export { exportToImage, type ImageExportOptions } from './exportImage.js';
export { exportToGif, type GifExportOptions } from './exportGif.js';
export { renderAudioMix } from './audio.js';
export {
  gopInterval,
  yieldToScheduler,
  waitEncoderQueue,
  glFinish,
  getCanvasGl,
  ENCODER_QUEUE_LIMIT,
  type QueuedEncoder,
} from './scheduler.js';
export { createReadinessGate, awaitFontsReady, type ReadinessGate } from './readiness.js';
export { canStreamToOpfs, estimateExportBytes, type ExportSinkMode } from './opfs-sink.js';
