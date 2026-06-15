/**
 * Caption + text-style model.
 * ==========================
 * The caption/text types now live in the shared contract
 * `@classytic/vixel-schema` (single source for engine + editor + agent). This
 * module re-exports them so existing `./captions/types.js` imports keep working.
 * Rendering (libass/ASS compile + the ffmpeg `ass` filter) stays in this package
 * (see `./ass.ts`).
 */
export type {
  CaptionWord,
  CaptionCue,
  CaptionAlignment,
  CaptionAnimation,
  TextStyle,
  CaptionCanvas,
} from '@classytic/vixel-schema';
