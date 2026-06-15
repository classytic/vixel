/**
 * Captions — animated, word-level (TikTok / karaoke) captions via libass.
 *
 * Bring your own {@link TextStyle} or start from a {@link CAPTION_PRESETS} preset.
 * The caption model matches `@remotion/captions` / Whisper word timestamps, so
 * an AI agent or ASR pipeline can emit cues directly.
 *
 * @example
 * ```ts
 * await burnCaptions(src, cues, 'out.mp4', { preset: 'tiktok-bold' });
 * // or BYO style:
 * await burnCaptions(src, cues, 'out.mp4', {
 *   style: { fontFamily: 'Bangers', fontFile: './Bangers.ttf', highlightColor: '#FF0066', animation: 'pop' },
 *   fontsDir: './fonts',
 * });
 * ```
 */

export { burnCaptions, type BurnCaptionsConfig, type BurnCaptionsResult } from './burn.js';
export { buildAss, buildStyleLine, buildCueText, cueEvents, hexToAssBgr, msToAssTime } from './ass.js';
export { CAPTION_PRESETS, type CaptionPreset } from './presets.js';
export type {
  CaptionWord,
  CaptionCue,
  CaptionCanvas,
  CaptionAlignment,
  CaptionAnimation,
  TextStyle,
} from './types.js';
