/**
 * Caption Burn-in Generator Types
 */

import type { BaseGeneratorConfig, GeneratorProgressCallback, GeneratorResult } from '../../types/generators.js';

export type CaptionPosition = 'bottom' | 'top' | 'center';

export interface CaptionConfig extends BaseGeneratorConfig {
  /** Path to a .srt or .ass subtitle file to burn in. */
  subtitlePath?: string;
  /** A single line/block of text to overlay (drawtext) — alternative to `subtitlePath`. */
  text?: string;
  /** Font size in px (default: 28 for subtitles, auto for text). */
  fontSize?: number;
  /** Font color (default: 'white'). */
  fontColor?: string;
  /** Outline width in px (default: 2). */
  outlineWidth?: number;
  /** Outline color (default: 'black'). */
  outlineColor?: string;
  /** Vertical placement for `text` mode (default: 'bottom'). */
  position?: CaptionPosition;
  /** Absolute path to a font file (.ttf) — recommended on Windows for drawtext. */
  fontFile?: string;
  /** Extra libass `force_style` string for .srt (e.g. 'Fontsize=30,Outline=2'). */
  forceStyle?: string;
  /** Video codec for the (required) re-encode (default: 'libx264'). */
  videoCodec?: string;
  /** CRF quality (default: 20). */
  crf?: number;
  /** Encoding preset (default: 'fast'). */
  preset?: string;
  /** Progress callback. */
  onProgress?: GeneratorProgressCallback;
}

export interface CaptionResult extends GeneratorResult {
  /** 'subtitles' (file burn-in) or 'text' (drawtext overlay). */
  mode: 'subtitles' | 'text';
}
