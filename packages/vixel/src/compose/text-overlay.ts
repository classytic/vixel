/**
 * Text-overlay ASS authoring for compose.
 * ======================================
 * Burns one or more text {@link VisualClip}s — each with its own BYO {@link TextStyle},
 * frame position, timing, and caption animation mode — into a single ASS document that
 * `compose()` applies with the `ass` filter on the composited video. Reuses the
 * captions engine (styles + the CapCut modes) so text in a timeline looks
 * identical to a standalone `burnCaptions` pass.
 */

import { buildStyleLine, buildCueText, cueEvents, msToAssTime, glowOverride, shadowOverride } from '../captions/ass.js';
import { ENTRANCE_DEFAULTS, isSlide, entranceMotionVec, loopAt, TEXT_LOOP_PERIOD, textDesignToFlatStyle } from './schema.js';
import type { VisualClip, TextMedia, TextLoop } from './schema.js';

interface Canvas {
  readonly width: number;
  readonly height: number;
}

const RAD2DEG = 180 / Math.PI;

/**
 * Render a continuous text LOOP (`clip.loop`) as ASS by SAMPLING the shared
 * {@link loopAt} sampler at quarter-period keyframes and chaining `\t()`
 * transitions between them — so the offline export tracks the exact curve the
 * Pixi preview animates (the keyframes ARE loopAt samples; ASS interpolates
 * linearly between, a faithful triangle approximation of the subtle sine).
 *
 * ASS `\t` interpolates scale (`\fscx`/`\fscy`) and rotation (`\frz`) but NOT
 * position (`\pos`/`\move`), so the position loops (`float`/`bounce`) have no
 * ASS expression and DEGRADE to static server-side — the full motion still plays
 * in the Pixi preview/export. (Same philosophy as `popIn`'s scale degrading to a
 * fade for image/video overlays.) `baseRotDeg` is the clip's static clockwise
 * rotation; a rotation loop folds it in so the two don't both write `\frz`.
 * Returns the override tags (no braces) + whether it animates rotation.
 */
function loopOverride(
  loop: TextLoop | undefined,
  durationMs: number,
  baseRotDeg: number,
): { tags: string; animatesRotation: boolean } {
  if (!loop || loop === 'none') return { tags: '', animatesRotation: false };
  const periodMs = TEXT_LOOP_PERIOD * 1000;
  const step = periodMs / 4; // quarter-cycle keyframes (the sine extrema)
  // Probe an extremum (quarter period) to learn which dimension this loop drives.
  const probe = loopAt(loop, step / 1000);
  const animatesScale = Math.abs(probe.scale - 1) > 1e-4;
  const animatesRotation = Math.abs(probe.rotation) > 1e-4;
  if (!animatesScale && !animatesRotation) return { tags: '', animatesRotation: false }; // float/bounce
  const tagAt = (tMs: number): string => {
    const s = loopAt(loop, tMs / 1000);
    let t = '';
    if (animatesScale) {
      const v = (s.scale * 100).toFixed(2);
      t += `\\fscx${v}\\fscy${v}`;
    }
    if (animatesRotation) t += `\\frz${(-(baseRotDeg + s.rotation * RAD2DEG)).toFixed(2)}`;
    return t;
  };
  let out = tagAt(0); // explicit base value at line start
  const n = Math.max(1, Math.ceil(durationMs / step));
  for (let k = 1; k <= n; k++) {
    out += `\\t(${Math.round((k - 1) * step)},${Math.round(k * step)},${tagAt(k * step)})`;
  }
  return { tags: out, animatesRotation };
}

const ASS_HEADER = (canvas: Canvas): string[] => [
  '[Script Info]',
  'ScriptType: v4.00+',
  `PlayResX: ${canvas.width}`,
  `PlayResY: ${canvas.height}`,
  'WrapStyle: 0', // smart word-wrap within the text box's margins (frame width)
  'ScaledBorderAndShadow: yes',
  'YCbCr Matrix: TV.709',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
];

/** Build a complete ASS document burning every text clip (each own style/position). */
export function buildTextOverlayAss(overlays: VisualClip[], canvas: Canvas): string {
  const styleLines: string[] = [];
  const dialogues: string[] = [];

  overlays.forEach((clip, i) => {
    const media = clip.media as TextMedia;
    const name = `ov${i}`;
    // DEGRADE the SVG-like layer stack (gradients/textures/multi-stroke/3D) to the
    // flat model libass can paint: gradient → dominant solid, back fills dropped,
    // shadows → one offset shadow + one centered glow. The Pixi tier renders the
    // full stack; this fast tier renders a faithful flattening. (Pure → identical
    // degrade everywhere.) Plain flat styles pass through unchanged.
    const style = textDesignToFlatStyle(media.style);
    // A soft (blurred) shadow renders as its own pass below the text, so the main
    // style must NOT also paint the hard Style shadow (which would double up).
    const blurShadow = style.shadow && style.shadow.blur ? style.shadow : undefined;
    let mainStyle = style;
    if (blurShadow) {
      mainStyle = { ...style };
      delete mainStyle.shadow;
    }

    // Position. Preferred: the unified `transform.frame` — a text BOX whose
    // margins both place the text (top of the box) and wrap it to the box width.
    // `alignNumpad` stays top-center (8); `buildStyleLine` shifts it to 7/9 from
    // `style.align`. Falls back to the legacy anchor / `\pos` point.
    let alignNumpad: number;
    let posPrefix = '';
    let marginL = 0;
    let marginR = 0;
    let marginV = 0;
    let frameAnimated = false; // frame branch emits its own \fad → skip the legacy one
    // Per-token kinetic motion (media.motion) has no libass equivalent (no per-glyph
    // layout), so DEGRADE it to a WHOLE-BLOCK entrance using the motion's own preset —
    // the line animates in (just not word-by-word). The Pixi tier does the real
    // staggered per-token reveal. An explicit clip.enter/exit still wins.
    const enter = clip.enter ?? media.motion?.enter;
    const exit = clip.exit ?? media.motion?.exit;
    const frame = clip.transform?.frame;
    if (frame) {
      const bx = Math.round(frame.x * canvas.width);
      const by = Math.round(frame.y * canvas.height);
      const bw = Math.round(frame.w * canvas.width);
      alignNumpad = 8; // top row, center column; `style.align` (hOff) shifts L/R
      marginL = Math.max(0, bx);
      marginR = Math.max(0, canvas.width - (bx + bw));
      marginV = Math.max(0, by);
      // Absolute \pos (or \move for a slide entrance) anchored at the box top.
      // Using \pos/\move disables libass COLLISION DETECTION, which otherwise
      // stacks the glow / shadow / text passes apart vertically (the "glow blob
      // above the text" bug). Margins still drive word-wrap to the box width.
      // Entrance MOTION (slideUp/popIn) is rendered here so text animates in like
      // image/shape overlays — same `in`/`out` primitive, same shared curve.
      const numpad = alignNumpad + (style.align === 'left' ? -1 : style.align === 'right' ? 1 : 0);
      const anchorX = numpad % 3 === 1 ? bx : numpad % 3 === 0 ? bx + bw : bx + Math.round(bw / 2);
      const inMs = Math.round(Math.min(ENTRANCE_DEFAULTS.inDur, clip.duration / 2) * 1000);
      let placement: string;
      if (isSlide(enter)) {
        // Start offset by the shared motion vector, settle at the anchor.
        const m = entranceMotionVec(enter as string, ENTRANCE_DEFAULTS.distance);
        const sx = Math.round(anchorX - m.dx * canvas.width);
        const sy = Math.round(marginV - m.dy * canvas.height);
        placement = `\\move(${sx},${sy},${anchorX},${marginV},0,${inMs})`;
      } else {
        placement = `\\pos(${anchorX},${marginV})`;
      }
      // popIn → scale up from popScale to 100% over the in-window.
      const pop =
        enter === 'popIn'
          ? `\\fscx${Math.round(ENTRANCE_DEFAULTS.popScale * 100)}\\fscy${Math.round(ENTRANCE_DEFAULTS.popScale * 100)}\\t(0,${inMs},\\fscx100\\fscy100)`
          : '';
      // Opacity ramp for any non-`none` enter/exit (the fade component of the
      // shared entrance model — slide/pop fade in too).
      const outMs = Math.round(Math.min(ENTRANCE_DEFAULTS.outDur, clip.duration / 2) * 1000);
      const fIn = enter && enter !== 'none' ? inMs : 0;
      const fOut = exit && exit !== 'none' ? outMs : 0;
      const fad = fIn || fOut ? `\\fad(${fIn},${fOut})` : '';
      frameAnimated = true;
      posPrefix = `{\\an${numpad}${placement}${pop}${fad}}`;
    } else {
      // Boxless text: default to bottom-center (numpad 2). Placement is otherwise
      // driven entirely by `transform.frame` now (legacy `position` is gone).
      alignNumpad = 2;
    }
    styleLines.push(buildStyleLine(mainStyle, { name, alignNumpad }));

    // Boxless text fade in/out → ASS \fad. Frame-positioned text already folded its
    // \fad into posPrefix (with the entrance motion).
    const fadeMs = 400;
    const fadIn = !frameAnimated && enter === 'fadeIn' ? fadeMs : 0;
    const fadOut = !frameAnimated && exit === 'fadeOut' ? fadeMs : 0;
    const fadPrefix = fadIn || fadOut ? `{\\fad(${fadIn},${fadOut})}` : '';
    // Continuous loop (pulse/breathe/wiggle): chained \t() over the clip window,
    // sampled from the shared loopAt for parity. Applies to the window-spanning
    // passes (line + shadow + glow), NOT per-word cue events (a clip-relative loop
    // would restart each word) — loop is a title/line animation, like CapCut's.
    const lp = loopOverride(clip.loop, Math.round(clip.duration * 1000), clip.transform?.rotation ?? 0);
    const loopPrefix = lp.tags ? `{${lp.tags}}` : '';
    // ASS \frz is counter-clockwise; our `rotation` is clockwise → negate. A
    // rotation loop already folded the base angle in, so skip the static one then.
    const rotDeg = clip.transform?.rotation;
    const rotPrefix = rotDeg && !lp.animatesRotation ? `{\\frz${(-rotDeg).toFixed(2)}}` : '';

    const dlg = (startMs: number, endMs: number, text: string, loopTag: string = loopPrefix) =>
      `Dialogue: 0,${msToAssTime(startMs)},${msToAssTime(endMs)},${name},,${marginL},${marginR},${marginV},,${fadPrefix}${posPrefix}${rotPrefix}${loopTag}${text}`;

    // Soft drop-shadow + glow: blurred colored passes rendered FIRST (same layer 0,
    // so they sit behind the sharp text). Shadow is furthest back, then glow, then
    // the text — matching the Pixi preview's compositing order.
    const windowStartMs = Math.round(clip.at * 1000);
    const windowEndMs = Math.round((clip.at + clip.duration) * 1000);
    const plainText = media.text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
    if (blurShadow) {
      dialogues.push(dlg(windowStartMs, windowEndMs, `${shadowOverride(blurShadow)}${plainText}`));
    }
    if (style.glow) {
      dialogues.push(dlg(windowStartMs, windowEndMs, `${glowOverride(style.glow)}${plainText}`));
    }

    if (media.cues && media.cues.length > 0) {
      // Word-timed captions — the cue timestamps (absolute) drive on-screen time.
      for (const cue of media.cues) for (const ev of cueEvents(cue, style)) dialogues.push(dlg(ev.startMs, ev.endMs, ev.text, ''));
    } else {
      // A plain styled line shown for the clip's [at, at+duration] window.
      const startMs = Math.round(clip.at * 1000);
      const endMs = Math.round((clip.at + clip.duration) * 1000);
      dialogues.push(dlg(startMs, endMs, buildCueText({ text: media.text, startMs, endMs }, style)));
    }
  });

  return [...ASS_HEADER(canvas), ...styleLines, '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...dialogues, ''].join('\n');
}
