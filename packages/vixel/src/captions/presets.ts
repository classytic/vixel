/**
 * Named caption style presets — research-backed starting points users can use
 * as-is or merge their own {@link TextStyle} on top of (BYO styling).
 */

import type { TextStyle } from './types.js';

export const CAPTION_PRESETS = {
  /** Chunky white, thick black outline, yellow active word, scale pop-in. */
  'tiktok-bold': {
    fontFamily: 'Montserrat',
    fontSize: 120,
    bold: true,
    fillColor: '#FFFFFF',
    highlightColor: '#FFD400',
    stroke: { width: 8, color: '#000000' },
    alignment: 'center',
    marginV: 260,
    animation: 'pop',
  },
  /** Clean, thin, subtle fade — unobtrusive lower-third. */
  minimal: {
    fontFamily: 'Inter',
    fontSize: 72,
    fillColor: '#FFFFFF',
    stroke: { width: 2, color: '#000000' },
    alignment: 'bottom',
    marginV: 120,
    animation: 'fade',
  },
  /** Sweeping fill, dim→bright, no scale — classic karaoke. */
  'karaoke-highlight': {
    fontFamily: 'Poppins',
    fontSize: 96,
    bold: true,
    fillColor: '#FFFFFF',
    highlightColor: '#22D3EE',
    stroke: { width: 5, color: '#101010' },
    shadow: { depth: 2, color: '#000000' },
    alignment: 'bottom',
    marginV: 200,
    animation: 'karaoke',
  },
  /** ONE big word at a time — maximum focus (Hormozi/Opus style). */
  'word-focus': {
    fontFamily: 'Montserrat',
    fontSize: 150,
    bold: true,
    fillColor: '#FFFFFF',
    stroke: { width: 10, color: '#000000' },
    alignment: 'center',
    animation: 'word-by-word',
  },
  /** Full line, the current word pops to the accent color (active-word). */
  'active-word': {
    fontFamily: 'Montserrat',
    fontSize: 104,
    bold: true,
    fillColor: '#FFFFFF',
    highlightColor: '#39FF14',
    stroke: { width: 7, color: '#000000' },
    alignment: 'center',
    marginV: 240,
    animation: 'highlight',
  },
  /** One word at a time inside a filled accent box (the boxed-word look). */
  boxed: {
    fontFamily: 'Montserrat',
    fontSize: 120,
    bold: true,
    fillColor: '#000000',
    highlightColor: '#FFE600', // box color
    alignment: 'center',
    animation: 'highlight-box',
  },
} as const satisfies Record<string, TextStyle>;

export type CaptionPreset = keyof typeof CAPTION_PRESETS;
