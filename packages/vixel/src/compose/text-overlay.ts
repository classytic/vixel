/**
 * Text-overlay ASS authoring for compose.
 * ======================================
 * Burns one or more {@link TextOverlay}s — each with its own BYO {@link TextStyle},
 * position, timing, and caption animation mode — into a single ASS document that
 * `compose()` applies with the `ass` filter on the composited video. Reuses the
 * captions engine (styles + the CapCut modes) so text in a timeline looks
 * identical to a standalone `burnCaptions` pass.
 */

import { buildStyleLine, buildCueText, cueEvents, msToAssTime } from '../captions/ass.js';
import type { Anchor, TextOverlay } from './schema.js';

interface Canvas {
  readonly width: number;
  readonly height: number;
}

/** ASS alignment numpad (7-9 top, 4-6 mid, 1-3 bottom) per anchor. */
const ANCHOR_NUMPAD: Record<Anchor, number> = {
  'top-left': 7,
  top: 8,
  'top-right': 9,
  'center-left': 4,
  center: 5,
  'center-right': 6,
  'bottom-left': 1,
  bottom: 2,
  'bottom-right': 3,
};

const ASS_HEADER = (canvas: Canvas): string[] => [
  '[Script Info]',
  'ScriptType: v4.00+',
  `PlayResX: ${canvas.width}`,
  `PlayResY: ${canvas.height}`,
  'WrapStyle: 2',
  'ScaledBorderAndShadow: yes',
  'YCbCr Matrix: TV.709',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
];

/** Build a complete ASS document burning every text overlay (each own style/position). */
export function buildTextOverlayAss(overlays: TextOverlay[], canvas: Canvas): string {
  const styleLines: string[] = [];
  const dialogues: string[] = [];

  overlays.forEach((ov, i) => {
    const name = `ov${i}`;
    const style = ov.style ?? {};

    // Position → alignment anchor, or an absolute \pos for a normalized {x,y}
    // (centered on the point via \an5).
    let alignNumpad: number;
    let posPrefix = '';
    if (ov.position && typeof ov.position === 'object') {
      alignNumpad = 5;
      posPrefix = `{\\pos(${Math.round(ov.position.x * canvas.width)},${Math.round(ov.position.y * canvas.height)})}`;
    } else {
      alignNumpad = ANCHOR_NUMPAD[ov.position ?? 'bottom'];
    }
    styleLines.push(buildStyleLine(style, { name, alignNumpad }));

    // Overlay-level fade in/out → ASS \fad (in addition to any caption animation).
    const fadeMs = 400;
    const fadIn = ov.in === 'fadeIn' ? fadeMs : 0;
    const fadOut = ov.out === 'fadeOut' ? fadeMs : 0;
    const fadPrefix = fadIn || fadOut ? `{\\fad(${fadIn},${fadOut})}` : '';

    const dlg = (startMs: number, endMs: number, text: string) =>
      `Dialogue: 0,${msToAssTime(startMs)},${msToAssTime(endMs)},${name},,0,0,0,,${fadPrefix}${posPrefix}${text}`;

    if (ov.cues && ov.cues.length > 0) {
      // Word-timed captions — the cue timestamps (absolute) drive on-screen time.
      for (const cue of ov.cues) for (const ev of cueEvents(cue, style)) dialogues.push(dlg(ev.startMs, ev.endMs, ev.text));
    } else {
      // A plain styled line shown for the overlay's [at, at+duration] window.
      const startMs = Math.round(ov.at * 1000);
      const endMs = Math.round((ov.at + ov.duration) * 1000);
      dialogues.push(dlg(startMs, endMs, buildCueText({ text: ov.text, startMs, endMs }, style)));
    }
  });

  return [...ASS_HEADER(canvas), ...styleLines, '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...dialogues, ''].join('\n');
}
