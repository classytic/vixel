/**
 * Caption Constants & Filter Builders
 * ===================================
 * Pure filtergraph builders — no I/O, fully unit-testable.
 */

export const DEFAULT_FONT_SIZE = 28;
export const DEFAULT_FONT_COLOR = 'white';
export const DEFAULT_OUTLINE_WIDTH = 2;
export const DEFAULT_OUTLINE_COLOR = 'black';

/**
 * Escape a filesystem path for use inside an ffmpeg `subtitles=` filter.
 * Windows drive colons and backslashes break the filter parser, so we
 * forward-slash the path and escape the colon.
 *
 *   C:\clips\a.srt  →  C\:/clips/a.srt
 */
export function escapeSubtitlePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** Escape a string literal for ffmpeg drawtext `text='...'`. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/** Build a `subtitles=` filter for burning an .srt/.ass file. */
export function buildSubtitlesFilter(subtitlePath: string, forceStyle?: string): string {
  const escaped = escapeSubtitlePath(subtitlePath);
  // Escape single quotes so a forceStyle value can't break out of the quoted filter arg.
  const style = forceStyle ? `:force_style='${forceStyle.replace(/'/g, "\\'")}'` : '';
  return `subtitles='${escaped}'${style}`;
}

export interface DrawtextOptions {
  text: string;
  fontSize: number;
  fontColor: string;
  outlineWidth: number;
  outlineColor: string;
  position: 'bottom' | 'top' | 'center';
  fontFile?: string | undefined;
}

/** Build a styled `drawtext=` filter for a single text overlay. */
export function buildDrawtextFilter(opts: DrawtextOptions): string {
  const yByPosition = {
    bottom: 'h-th-40',
    top: '40',
    center: '(h-th)/2',
  } as const;

  const parts = [
    `text='${escapeDrawtext(opts.text)}'`,
    `fontsize=${opts.fontSize}`,
    `fontcolor=${opts.fontColor}`,
    `borderw=${opts.outlineWidth}`,
    `bordercolor=${opts.outlineColor}`,
    `x=(w-text_w)/2`,
    `y=${yByPosition[opts.position]}`,
  ];
  if (opts.fontFile) {
    parts.splice(1, 0, `fontfile='${escapeSubtitlePath(opts.fontFile)}'`);
  }
  return `drawtext=${parts.join(':')}`;
}
