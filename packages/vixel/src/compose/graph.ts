/**
 * filter_complex graph builder — pure (no ffmpeg).
 * ===============================================
 * Compiles a {@link VixelSpec} + {@link TimelinePlan} into the ordered input
 * list, the `filter_complex` string, and the output stream labels. Pure so the
 * exact graph is golden-snapshot-testable.
 *
 * v1 scope (the prism shot-stitcher backbone):
 *  - Video: clips scaled/padded/fps-normalized, then an `xfade` chain
 *    (crossfades) OR plain `concat` (all hard cuts). A MIX of transitions and
 *    hard cuts in one track is rejected (use transitions on all gaps or none).
 *  - Audio: each clip's audio (silence synthesized where a clip has none) joined
 *    with `acrossfade`/`concat` to mirror the video, plus an optional music bed
 *    mixed in and (optionally) sidechain-ducked under the program audio.
 *  - Overlays (text/image/captions) compose in a later increment; apply the
 *    `captions`/`overlay` ops to the composed output meanwhile.
 */

import { ConfigError } from '../errors.js';
import { escapeSubtitlePath } from '../generators/captions/constants.js';
import { resolveTransitionXfade } from './transitions.js';
import { resolveToPath } from '../core/media-reference.js';
import { assertSafeColor } from '../core/color.js';
import { buildEffectsFilter } from '../effects/index.js';
import { frameToPx, ENTRANCE_DEFAULTS, entranceMotionVec, isSlide, resolveEntranceOptions } from '@classytic/vixel-schema';
import type { EntranceOptions, Easing } from '@classytic/vixel-schema';
import type { TimelinePlan } from './timeline.js';
import type {
  AudioItem,
  ClipAnimation,
  MediaKind,
  OverlayEnter,
  OverlayExit,
  VisualClip,
  VixelSpec,
} from './schema.js';

/**
 * Video-safe ken-burns / zoom / pan as a `zoompan` with `d=1` (one output per
 * input frame, ramped over the clip) — unlike the stills builder (`d=frames`).
 * Prescaled so the zoom has pixels to crop. Returns a `,…` filter suffix.
 */
function clipAnimationFilter(anim: ClipAnimation, W: number, H: number, F: number, durSec: number): string {
  const frames = Math.max(1, Math.round(durSec * F));
  const amount = anim.amount ?? 0.15;
  const dir = anim.direction ?? (anim.preset === 'pan' ? 'right' : 'in');
  const cx = 'iw/2-(iw/zoom/2)';
  const cy = 'ih/2-(ih/zoom/2)';
  let z = '1';
  let x = cx;
  let y = cy;
  if (dir === 'in') z = `min(1+${amount}*on/${frames}\\,${gain(1 + amount)})`;
  else if (dir === 'out') z = `max(${gain(1 + amount)}-${amount}*on/${frames}\\,1)`;
  else {
    z = gain(1 + amount);
    if (dir === 'left') x = `(iw-iw/zoom)*on/${frames}`;
    else if (dir === 'right') x = `(iw-iw/zoom)*(1-on/${frames})`;
    else if (dir === 'up') y = `(ih-ih/zoom)*on/${frames}`;
    else if (dir === 'down') y = `(ih-ih/zoom)*(1-on/${frames})`;
  }
  return `,scale=${W * 2}:-2,zoompan=z='${z}':d=1:x='${x}':y='${y}':s=${W}x${H}:fps=${F}`;
}

/** An ffmpeg input: a source plus optional per-input flags (e.g. `-loop 1`). */
export interface ComposeInput {
  readonly source: string;
  readonly options?: string[];
}

export interface ComposeGraph {
  /** Ordered inputs (clips, then the audio bed, then image/video overlays). */
  readonly inputs: ComposeInput[];
  readonly filterComplex: string;
  readonly videoLabel: string;
  readonly audioLabel: string | null;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

/** Per-input flags so a still image / GIF loops for its on-screen window. */
function overlayInputOptions(source: string): string[] | undefined {
  const s = source.toLowerCase();
  if (s.endsWith('.gif')) return ['-ignore_loop', '0']; // loop animated GIF
  if (IMAGE_EXTS.some((e) => s.endsWith(e))) return ['-loop', '1']; // make a still infinite
  return undefined; // a video overlay plays its own frames
}

/**
 * Opacity + fade alpha chain shared by image and video overlays. Returns '' when
 * the layer is fully opaque with no fade, else a `,format=rgba…` suffix. Fades
 * are keyed on ABSOLUTE time so they land inside the on-screen window.
 */
function overlayAlphaChain(
  opacity: number | undefined,
  enter: OverlayEnter | undefined,
  exit: OverlayExit | undefined,
  at: number,
  duration: number,
  opts: EntranceOptions = {},
): string {
  const op = opacity ?? 1;
  // Every non-`none` entrance ramps opacity here (the fade component of the shared
  // entrance model). Slide ALSO gets positional motion via `overlayEntranceSlide`;
  // pop's scale isn't expressible per-frame in the `overlay` filter, so pop
  // degrades to this fade server-side (full slide+pop in the Pixi preview/export).
  // Durations come from the SAME resolved motion feel the Pixi path uses; the opacity
  // ramp stays LINEAR in both renderers (schema fades opacity linearly too), so only
  // the duration is feel-driven here, not a curve.
  const inDur = Math.min(opts.inDur ?? ENTRANCE_DEFAULTS.inDur, duration / 2);
  const outDur = Math.min(opts.outDur ?? ENTRANCE_DEFAULTS.outDur, duration / 2);
  const fadeIn = enter && enter !== 'none' ? `,fade=t=in:st=${gain(at)}:d=${gain(inDur)}:alpha=1` : '';
  const fadeOut =
    exit && exit !== 'none'
      ? `,fade=t=out:st=${gain(Math.max(0, at + duration - outDur))}:d=${gain(outDur)}:alpha=1`
      : '';
  const needsAlpha = op !== 1 || fadeIn !== '' || fadeOut !== '';
  return needsAlpha
    ? `,format=rgba${op !== 1 ? `,colorchannelmixer=aa=${gain(op)}` : ''}${fadeIn}${fadeOut}`
    : '';
}

/**
 * Cover/contain/stretch-fit an overlay into a normalized {x,y,w,h} box of the
 * canvas — the building block for split-screen, grids, and slide layouts.
 * Returns the scale/crop chain + the `overlay` x/y (box top-left, or centered for
 * `contain`). `null` when no box is set (fall back to width/position placement).
 */
function overlayBoxGeom(
  box: { x: number; y: number; w: number; h: number } | undefined,
  fit: 'contain' | 'cover' | 'stretch' | undefined,
  W: number,
  H: number,
): { size: string; place: OverlayXY } | null {
  if (!box) return null;
  const bw = Math.max(2, Math.round(box.w * W));
  const bh = Math.max(2, Math.round(box.h * H));
  const bx = Math.round(box.x * W);
  const by = Math.round(box.y * H);
  const f = fit ?? 'cover';
  if (f === 'stretch') return { size: `scale=${bw}:${bh}`, place: { x: `${bx}`, y: `${by}`, quote: false } };
  if (f === 'contain') {
    return {
      size: `scale=${bw}:${bh}:force_original_aspect_ratio=decrease`,
      place: { x: `${bx}+(${bw}-w)/2`, y: `${by}+(${bh}-h)/2`, quote: false },
    };
  }
  // cover: fill the box, crop the overflow (no distortion).
  return {
    size: `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}`,
    place: { x: `${bx}`, y: `${by}`, quote: false },
  };
}

/**
 * Rotate an overlay around its center by `rotation` DEGREES (clockwise). Returns
 * '' or a `,format=rgba,rotate=…` suffix with bounding-box expansion + transparent
 * corners. `overlayXY` centers on `w/2`/`h/2`, which become the rotated box dims,
 * so the pivot stays the overlay's center.
 */
function overlayRotateFilter(rotation: number | undefined): string {
  if (!rotation) return '';
  const rad = ((rotation * Math.PI) / 180).toFixed(5);
  return `,format=rgba,rotate=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=none`;
}

/**
 * Map a schema overlay blend mode to an ffmpeg `blend` `all_mode` (null = normal
 * alpha `overlay`). A blend-mode overlay is the VFX-layer model (light leaks,
 * particles, grain on black → `screen`): composited FULL-FRAME, not positioned.
 */
function ffmpegBlendMode(blend: string | undefined): string | null {
  switch (blend) {
    case 'screen': return 'screen';
    case 'multiply': return 'multiply';
    case 'overlay': return 'overlay';
    case 'soft-light': return 'softlight';
    case 'add': return 'addition';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    default: return null;
  }
}

/**
 * The composite line for an image/video overlay clip: a full-frame `blend` (VFX
 * layer, opacity via `all_opacity`) when a blend mode is set, else the normal
 * alpha `overlay` at its frame-box top-left (+ entrance-slide offset). Placement
 * is purely `transform.frame`-driven now (legacy position/motion are gone): a
 * boxless clip centers full-frame.
 */
function overlayComposite(
  curV: string,
  ovLabel: string,
  outL: string,
  layer: VisualLayer,
  blendMode: string | null,
  boxGeom: ReturnType<typeof overlayBoxGeom>,
  W: number,
  H: number,
): string {
  const { at, duration } = layer;
  const t = layer.clip.transform;
  const enable = `enable='between(t,${at},${at + duration})'`;
  if (blendMode) {
    const op = t?.opacity;
    const opPart = op != null && op !== 1 ? `:all_opacity=${gain(op)}` : '';
    return `[${curV}][${ovLabel}]blend=all_mode=${blendMode}${opPart}:${enable}[${outL}]`;
  }
  // Box placement (frame top-left), or full-frame centered when boxless.
  const base: OverlayXY = boxGeom ? boxGeom.place : { x: '(W-w)/2', y: '(H-h)/2', quote: false };
  const xy = formatOverlayXY(
    overlayEntranceSlide(base, layer.clip.enter, layer.clip.exit, at, duration, W, H, resolveEntranceOptions(layer.clip.motionTiming)),
  );
  return `[${curV}][${ovLabel}]overlay=${xy}:${enable}[${outL}]`;
}

/**
 * Rotate a CLIP's content around its center by `rotation` DEGREES, keeping the
 * box dimensions (rotated content cropped to the box, exposed corners filled with
 * the output background) — mirrors the Pixi preview's centered sprite rotation.
 * Applied to the sized content BEFORE it's padded into the canvas/sub-region.
 */
function clipRotateFilter(rotation: number | undefined, bg: string): string {
  if (!rotation) return '';
  const rad = ((rotation * Math.PI) / 180).toFixed(5);
  return `,rotate=${rad}:c=${bg}`;
}

/**
 * An `overlay` x/y placement: the raw RHS expressions for `x=` and `y=`, plus
 * whether they must be single-quoted (needed when an expression contains commas,
 * e.g. keyframe motion or a slide's `clip(...)`). Kept as parts so an entrance
 * slide can add a time-varying offset before the `overlay=` string is assembled.
 */
interface OverlayXY {
  readonly x: string;
  readonly y: string;
  readonly quote: boolean;
}

/** Assemble an {@link OverlayXY} into the `overlay` filter's `x=…:y=…` fragment. */
function formatOverlayXY(p: OverlayXY): string {
  return p.quote ? `x='${p.x}':y='${p.y}'` : `x=${p.x}:y=${p.y}`;
}

/**
 * Add a slide entrance/exit's time-varying pixel offset to an overlay's x/y,
 * mirroring the schema's {@link entranceAt}: the offset is
 * `coef · (1 − clip(progress,0,1))³` (cubic — matching easeOut on enter / easeIn
 * on exit), decaying to 0 once the ramp completes. Enter ramps over `[at, at+inDur]`,
 * exit over `[end−outDur, end]`. Fade + pop are carried by the alpha chain (pop's
 * scale degrades to fade); only positional slides translate here. Returns the
 * input UNCHANGED when there's no slide, so non-slide overlays emit a
 * byte-identical filtergraph.
 */
/**
 * A named {@link Easing} as an ffmpeg `overlay`-expression over a progress sub-expr
 * `P` (already clamped to [0,1]). Mirrors the schema's `applyEasing` term-for-term so
 * the compiled slide curve == `entranceAt` (the parity test in `compose-entrance`
 * evaluates BOTH numerically). Uses only ffmpeg eval builtins — `pow`, `if`, `lt`,
 * `gte` — so it's expressible per-frame in the filtergraph. The motion feel
 * (`motionTiming`) reaches here resolved into {@link EntranceOptions}, exactly like
 * the Pixi path, so both renderers read ONE contract. */
function easeExpr(easing: Easing | undefined, P: string): string {
  switch (easing) {
    case 'easeIn':
      return `pow(${P},3)`;
    case 'easeInOut':
      return `if(lt(${P},0.5),4*pow(${P},3),1-pow(2-2*(${P}),3)/2)`;
    case 'easeOutExpo':
      return `if(gte(${P},1),1,1-pow(2,-10*(${P})))`;
    case 'easeOutBounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      const seg = (sub: number, add: number) => `${gain(n1)}*pow((${P})-${gain(sub)},2)+${gain(add)}`;
      return (
        `if(lt(${P},${gain(1 / d1)}),${gain(n1)}*pow(${P},2),` +
        `if(lt(${P},${gain(2 / d1)}),${seg(1.5 / d1, 0.75)},` +
        `if(lt(${P},${gain(2.5 / d1)}),${seg(2.25 / d1, 0.9375)},${seg(2.625 / d1, 0.984375)})))`
      );
    }
    case 'easeOut':
      return `(1-pow(1-(${P}),3))`;
    case 'linear':
    default:
      return `(${P})`;
  }
}

function overlayEntranceSlide(
  base: OverlayXY,
  enter: OverlayEnter | undefined,
  exit: OverlayExit | undefined,
  at: number,
  duration: number,
  W: number,
  H: number,
  opts: EntranceOptions = {},
): OverlayXY {
  const slideEnter = isSlide(enter);
  const slideExit = isSlide(exit);
  if (!slideEnter && !slideExit) return base;

  const dist = opts.distance ?? ENTRANCE_DEFAULTS.distance;
  const inDur = Math.min(opts.inDur ?? ENTRANCE_DEFAULTS.inDur, duration / 2);
  const outDur = Math.min(opts.outDur ?? ENTRANCE_DEFAULTS.outDur, duration / 2);
  const enterEasing = opts.enterEasing ?? 'easeOut';
  const exitEasing = opts.exitEasing ?? 'easeIn';
  const enterVec = slideEnter ? entranceMotionVec(enter as string, dist) : { dx: 0, dy: 0 };
  const exitVec = slideExit ? entranceMotionVec(exit as string, dist) : { dx: 0, dy: 0 };
  const end = at + duration;

  // Time factors mirroring `entranceAt`: enter offset = coef·(1−ease(p)); exit
  // offset = coef·ease(1−q). p/q are the clamped enter/exit ramps. With the default
  // easeOut/easeIn these reduce to the historical `(1−ramp)³` (parity guard checks it).
  const enterP = inDur > 0 ? `clip((t-${gain(at)})/${gain(inDur)},0,1)` : null;
  const exitQ = outDur > 0 ? `clip((${gain(end)}-t)/${gain(outDur)},0,1)` : null;
  const enterFactor = enterP ? `(1-(${easeExpr(enterEasing, enterP)}))` : null;
  const exitFactor = exitQ ? `(${easeExpr(exitEasing, `(1-${exitQ})`)})` : null;
  const axis = (enterCoef: number, exitCoef: number): string | null => {
    const parts: string[] = [];
    if (enterFactor && enterCoef !== 0) parts.push(`${gain(enterCoef)}*${enterFactor}`);
    if (exitFactor && exitCoef !== 0) parts.push(`${gain(exitCoef)}*${exitFactor}`);
    return parts.length ? parts.join('+') : null;
  };
  const offX = axis(-enterVec.dx * W, exitVec.dx * W);
  const offY = axis(-enterVec.dy * H, exitVec.dy * H);
  if (!offX && !offY) return base;

  return {
    x: offX ? `(${base.x})+(${offX})` : base.x,
    y: offY ? `(${base.y})+(${offY})` : base.y,
    quote: true,
  };
}

/** Pre-rasterized BoxStyle PNGs for one overlay (rounded mask / border / shadow). */
interface BoxStyleLayer {
  readonly order: number;
  readonly maskPath?: string;
  readonly borderPath?: string;
  readonly shadow?: { path: string; padX: number; padY: number; offX: number; offY: number };
}

/**
 * Apply a clip's rounded corners + border to an already-box-sized overlay leg
 * `[inL]`, returning the new (still box-sized RGBA) label. Pushes filter parts and
 * each PNG as a new `-loop 1` input. Runs in the box's own space BEFORE the
 * caller's rotation/fade/placement, so corners round on the upright box and the
 * whole styled box then rotates/fades as a unit (matching the preview). Shadow is
 * handled separately by {@link boxStyleShadowUnderlay} (it needs the absolute
 * canvas position to underlay behind the clip).
 */
function applyBoxStyleChain(
  parts: string[],
  inputs: ComposeInput[],
  inL: string,
  k: number,
  bw: number,
  bh: number,
  bs: BoxStyleLayer,
): string {
  let cur = inL;

  // Rounded corners: alphamerge the box-sized rounded-rect's alpha onto the clip.
  if (bs.maskPath) {
    const mIdx = inputs.length;
    inputs.push({ source: bs.maskPath, options: ['-loop', '1'] });
    const mL = `bsm${k}`;
    const rL = `bsr${k}`;
    // `extractplanes=a` pulls the mask PNG's rounded alpha as a gray plane;
    // alphamerge writes it as the clip's alpha (the clip is forced to rgba first).
    parts.push(`[${mIdx}:v]scale=${bw}:${bh},format=rgba,extractplanes=a[${mL}]`);
    parts.push(`[${cur}]format=rgba,setsar=1[bsc${k}];[bsc${k}][${mL}]alphamerge[${rL}]`);
    cur = rL;
  }

  // Border: overlay the stroke PNG on TOP of the (rounded) clip.
  if (bs.borderPath) {
    const bIdx = inputs.length;
    inputs.push({ source: bs.borderPath, options: ['-loop', '1'] });
    const bL = `bsbi${k}`;
    const outL = `bsbo${k}`;
    parts.push(`[${bIdx}:v]scale=${bw}:${bh},format=rgba,setsar=1[${bL}]`);
    parts.push(`[${cur}][${bL}]overlay=0:0:format=auto[${outL}]`);
    cur = outL;
  }

  return cur;
}

/**
 * Underlay a clip's drop-shadow PNG onto the running composite `[curV]` at the
 * box's absolute canvas position, returning the new composite label. The shadow
 * PNG is on a padded canvas: its top-left lands at `(boxX - pad + offX, boxY - pad
 * + offY)` so the blurred silhouette sits behind the box, offset by the shadow.
 * Time-gated to the clip's on-screen window so it appears/disappears with the clip.
 * Done BEFORE the clip overlay so the shadow reads behind it. No-ops (returns
 * `curV`) when the clip has no shadow.
 */
function boxStyleShadowUnderlay(
  parts: string[],
  inputs: ComposeInput[],
  curV: string,
  k: number,
  boxX: number,
  boxY: number,
  at: number,
  duration: number,
  bs: BoxStyleLayer | undefined,
): string {
  if (!bs?.shadow) return curV;
  const sh = bs.shadow;
  const sIdx = inputs.length;
  inputs.push({ source: sh.path, options: ['-loop', '1'] });
  const sL = `bss${k}`;
  const outL = `bssc${k}`;
  const x = boxX - sh.padX + sh.offX;
  const y = boxY - sh.padY + sh.offY;
  parts.push(`[${sIdx}:v]format=rgba,setsar=1[${sL}]`);
  parts.push(`[${curV}][${sL}]overlay=${x}:${y}:enable='between(t,${at},${at + duration})'[${outL}]`);
  return outL;
}

/**
 * One composited visual element in POSITIONAL stacking order. There is no z by
 * media kind anymore: layers composite in (trackIndex, clipIndex) order — the
 * order `collectOverlays` emits them — which both the graph (images/video/shape)
 * and the renderer (text → ASS) iterate, so their `order` indices agree.
 */
export interface VisualLayer {
  readonly kind: MediaKind;
  readonly clip: VisualClip;
  /** Absolute on-screen start (seconds). */
  readonly at: number;
  /** On-screen duration (seconds). */
  readonly duration: number;
  /** Stable positional index across the flattened layer list (compositing order). */
  readonly order: number;
}

/** Is this lane the sequential "main track" (its clips form the timeline plan)? */
function isMainTrack(track: { sequential?: boolean }): boolean {
  return track.sequential === true;
}

/**
 * Flatten every NON-main-track visual clip into one positionally-ordered layer
 * list. Stacking = (track index, clip index): later lanes / later clips composite
 * on top. The first `sequential` visual lane is the timeline base and is skipped
 * here (its clips are the render plan, not overlays). Hidden clips are dropped.
 */
export function collectOverlays(spec: VixelSpec): VisualLayer[] {
  const out: VisualLayer[] = [];
  let order = 0;
  let mainSeen = false;
  for (const t of spec.tracks) {
    if (t.type !== 'visual') continue;
    if (!mainSeen && isMainTrack(t)) {
      mainSeen = true;
      continue; // the base/main track is the timeline plan, not an overlay
    }
    for (const clip of t.clips) {
      if (clip.hidden) continue; // editor visibility toggle — skipped by the renderer
      out.push({ kind: clip.media.kind, clip, at: clip.at, duration: clip.duration, order: order++ });
    }
  }
  return out;
}

/** The first sequential visual lane (the main track that drives the timeline plan). */
export function mainVisualTrack(spec: VixelSpec): VixelSpec['tracks'][number] & { type: 'visual' } | undefined {
  for (const t of spec.tracks) if (t.type === 'visual' && isMainTrack(t)) return t;
  return undefined;
}

export interface ComposeGraphInput {
  readonly spec: VixelSpec;
  readonly plan: TimelinePlan;
  /** Whether each clip (by plan index) carries an audio stream. */
  readonly clipHasAudio: boolean[];
  /** One generated ASS file per text overlay, keyed by its `collectOverlays` order. */
  readonly textAssLayers?: ReadonlyArray<{ order: number; assPath: string }>;
  /** Directory of attached font files (from text `style.fontFile`), passed to the
   * `ass` filter as `fontsdir` so libass can resolve custom fonts by family name.
   * Absent → libass uses system fonts only. */
  readonly fontsDir?: string;
  /** Whether each video overlay (by `collectOverlays` order) carries an audio
   * stream — so its audio is mixed only when present (referencing a missing
   * `[idx:a]` hard-fails ffmpeg). Absent → no overlay audio is mixed. */
  readonly overlayHasAudio?: ReadonlyArray<{ order: number; hasAudio: boolean }>;
  /** One rasterized PNG per shape overlay (keyed by `collectOverlays` order),
   * with its overlay top-left in canvas px. Composited like an image overlay.
   * `backdrop` (frosted glass) carries the silhouette mask PNG + crop box so the
   * compositor blurs the content behind the card, rounded to its shape. */
  readonly shapePngLayers?: ReadonlyArray<{
    order: number;
    path: string;
    xPx: number;
    yPx: number;
    backdrop?: { maskPath: string; blur: number; x: number; y: number; w: number; h: number };
  }>;
  /** `shader`-kind effect id → its pre-written libplacebo `.hook` temp path. Lets
   * `buildEffectsFilter` emit the GPU shader chain; absent → shader effects skip. */
  readonly shaderPaths?: ReadonlyMap<string, string>;
  /** One set of pre-rasterized BoxStyle PNGs per image/video overlay (keyed by
   * `collectOverlays` order): a rounded-corner `mask` (alphamerge), a `border`
   * stroke PNG (overlaid on top), and/or a blurred `shadow` PNG (underlaid behind
   * the clip at its offset). All box-sized; the graph forces the clip to the box
   * px first so the mask aligns. Mirrors the Pixi preview's `applyBoxStyle`. */
  readonly boxStylePngLayers?: ReadonlyArray<{
    order: number;
    maskPath?: string;
    borderPath?: string;
    shadow?: { path: string; padX: number; padY: number; offX: number; offY: number };
  }>;
}

/**
 * Canonical audio format every leaf is forced to BEFORE any combiner. ffmpeg's
 * `acrossfade`/`concat`/`amix`/`sidechaincompress` all require matching sample
 * rate + channel layout (concat also sample_fmt) — without this, a 44.1k bed or
 * a synthesized-silence clip meeting a 48k clip hard-fails at runtime.
 */
const A_NORM = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';

export function fpsNumber(fps: VixelSpec['output']['fps']): number {
  if (typeof fps === 'number') {
    if (!(fps > 0)) throw new ConfigError(`output.fps must be > 0 (got ${fps})`);
    return fps;
  }
  if (!(fps.den > 0) || !(fps.num > 0)) {
    throw new ConfigError(`output.fps {num,den} must both be > 0 (got ${fps.num}/${fps.den})`);
  }
  return fps.num / fps.den;
}

/** Round a float gain to 3 decimals for a clean filter string. */
function gain(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** A normalized frame → integer px box (clamped inside the canvas by the shared
 *  {@link frameToPx}), or null for full-frame. */
function framePx(
  frame: { x: number; y: number; w: number; h: number } | undefined,
  W: number,
  H: number,
): { fw: number; fh: number; fx: number; fy: number } | null {
  if (!frame) return null;
  const p = frameToPx(frame, W, H);
  return { fw: p.w, fh: p.h, fx: p.x, fy: p.y };
}

/** A normalized frame → integer px box (via {@link frameToPx}), or the full canvas
 *  (`0,0,W,H`) when boxless — the box BoxStyle masks/borders/shadows are sized to. */
function boxToPx(
  frame: { x: number; y: number; w: number; h: number } | undefined,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  if (!frame) return { x: 0, y: 0, w: W, h: H };
  return frameToPx(frame, W, H);
}

/** First music/voice item across audio tracks (the bed). v1 = one bed. */
function firstAudioItem(spec: VixelSpec): AudioItem | undefined {
  for (const t of spec.tracks) if (t.type === 'audio' && t.items[0]) return t.items[0];
  return undefined;
}

export function buildComposeGraph({
  spec,
  plan,
  clipHasAudio,
  textAssLayers,
  overlayHasAudio,
  shapePngLayers,
  boxStylePngLayers,
  fontsDir,
  shaderPaths,
}: ComposeGraphInput): ComposeGraph {
  const W = spec.output.width;
  const H = spec.output.height;
  const F = fpsNumber(spec.output.fps);
  const bg = assertSafeColor(spec.output.background ?? '#000000', 'output.background').replace('#', '0x');
  const n = plan.clips.length;

  const loopSrcClips = mainVisualTrack(spec)?.clips ?? [];
  const inputs: ComposeInput[] = plan.clips.map((c, i) => {
    const options: string[] = [];
    // A looping VIDEO clip repeats its whole source at the demuxer so the trim can
    // extend past the source length to fill the clip's `duration` (`-stream_loop -1`
    // = repeat forever — the same flag the overlay video path uses).
    const m = loopSrcClips[i]?.media;
    if (m?.kind === 'video' && m.loop === true) options.push('-stream_loop', '-1');
    // A main-track GIF must LOOP its frames (animate) for the clip's duration;
    // `-ignore_loop 0` honors the GIF's loop. Non-looping images/videos are untouched.
    if (typeof c.source === 'string' && c.source.toLowerCase().endsWith('.gif')) options.push('-ignore_loop', '0');
    return options.length ? { source: c.source, options } : { source: c.source };
  });
  const bed = firstAudioItem(spec);
  const bedIndex = bed ? inputs.length : -1;
  if (bed) inputs.push({ source: resolveToPath(bed.source) });

  const parts: string[] = [];

  // Source clips of the main track (for per-clip transform/animation/effects,
  // which the timeline plan doesn't carry).
  const vTrack = mainVisualTrack(spec);
  const sourceClips: VisualClip[] = vTrack ? vTrack.clips : [];

  // ── per-clip video (scale/pad/fps, then an optional ken-burns/zoom/pan) ──
  plan.clips.forEach((c, i) => {
    const src = sourceClips[i];
    const fxFilter = buildEffectsFilter(src?.effects, shaderPaths);
    const anim = src?.animation;
    const animFilter = anim ? clipAnimationFilter(anim, W, H, F, c.duration) : '';
    // A clip is a box: its `transform.frame` region, or the whole canvas when
    // unframed. Animation runs first (on the source), then the content is fit into
    // the box, then padded onto the canvas only for a sub-region. One path → a
    // framed clip keeps its ken-burns, and `fit` is honored either way.
    const fr = framePx(src?.transform?.frame, W, H);
    const bw = fr ? fr.fw : W;
    const bh = fr ? fr.fh : H;
    const fit = src?.transform?.fit ?? 'cover'; // default fill (cover); explicit fit overrides
    const sized =
      fit === 'stretch'
        ? `scale=${bw}:${bh}`
        : fit === 'contain'
          ? `scale=${bw}:${bh}:force_original_aspect_ratio=decrease,pad=${bw}:${bh}:(${bw}-iw)/2:(${bh}-ih)/2:color=${bg}`
          : `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}`;
    const rotDeg = src?.transform?.rotation ?? 0;
    const op = src?.transform?.opacity ?? 1;
    // Opacity on a base clip blends it with the output background (`aa` scales the
    // alpha, then it's composited over a bg canvas) — matches the preview's
    // `sprite.alpha`. Only emitted when op<1, so opaque clips stay on the simple path.
    const aa = op < 1 ? `,colorchannelmixer=aa=${gain(op)}` : '';
    if (fr && rotDeg) {
      // FRAMED + ROTATED: rotate the box content as a UNIT (transparent corners),
      // then composite it over the canvas background centered at the box center —
      // so the exported media is the same rotated rectangle the preview shows
      // (NOT cropped to the axis-aligned box). Unframed rotation stays the simple
      // in-place `rotate` (the box IS the canvas) handled below.
      const rad = (rotDeg * Math.PI) / 180;
      const ac = Math.abs(Math.cos(rad));
      const as = Math.abs(Math.sin(rad));
      const rotW = Math.round(bw * ac + bh * as);
      const rotH = Math.round(bh * ac + bw * as);
      const ox = Math.round(fr.fx + bw / 2 - rotW / 2);
      const oy = Math.round(fr.fy + bh / 2 - rotH / 2);
      parts.push(
        `[${i}:v]trim=start=${c.trimStart}:duration=${c.duration},setpts=PTS-STARTPTS${animFilter},${sized}${fxFilter},` +
          `format=rgba,rotate=${rad.toFixed(5)}:ow=${rotW}:oh=${rotH}:c=none,setsar=1,fps=${F}${aa}[crot${i}];` +
          `color=c=${bg}:s=${W}x${H}:r=${F}:d=${gain(c.duration)}[cbg${i}];` +
          `[cbg${i}][crot${i}]overlay=${ox}:${oy}:format=auto,format=yuv420p[v${i}]`,
      );
    } else if (op < 1) {
      // Opacity (no framed rotation): build the full-canvas frame, then blend it
      // over the background at `op`.
      const rotateFilter = clipRotateFilter(rotDeg, bg); // unframed rotate (keeps WxH) or none
      const place = fr ? `,pad=${W}:${H}:${fr.fx}:${fr.fy}:color=${bg}` : '';
      parts.push(
        `[${i}:v]trim=start=${c.trimStart}:duration=${c.duration},setpts=PTS-STARTPTS${animFilter},${sized}${rotateFilter}${place},` +
          `setsar=1,fps=${F}${fxFilter},format=rgba${aa}[ctmp${i}];` +
          `color=c=${bg}:s=${W}x${H}:r=${F}:d=${gain(c.duration)}[cbg${i}];` +
          `[cbg${i}][ctmp${i}]overlay=0:0:format=auto,format=yuv420p[v${i}]`,
      );
    } else {
      const rotateFilter = clipRotateFilter(rotDeg, bg); // unframed rotate (keeps WxH) or none
      const place = fr ? `,pad=${W}:${H}:${fr.fx}:${fr.fy}:color=${bg}` : '';
      parts.push(
        `[${i}:v]trim=start=${c.trimStart}:duration=${c.duration},setpts=PTS-STARTPTS${animFilter},${sized}${rotateFilter}${place},` +
          `setsar=1,fps=${F}${fxFilter},format=yuv420p[v${i}]`,
      );
    }
  });

  // ── per-clip audio (synthesize silence where a clip has none), all forced to
  //    the canonical format so they can be combined ──
  plan.clips.forEach((c, i) => {
    const muted = sourceClips[i]?.muted === true;
    if (clipHasAudio[i] && !muted) {
      const vol = c.volume !== 1 ? `,volume=${gain(c.volume)}` : '';
      parts.push(
        `[${i}:a]atrim=start=${c.trimStart}:duration=${c.duration},asetpts=PTS-STARTPTS${vol},${A_NORM}[a${i}]`,
      );
    } else {
      parts.push(
        `anullsrc=r=48000:cl=stereo,atrim=duration=${c.duration},asetpts=PTS-STARTPTS,${A_NORM}[a${i}]`,
      );
    }
  });

  // ── video + audio chains: a pairwise left-fold so each gap is INDEPENDENTLY a
  //    hard cut (concat) or a transition (xfade/acrossfade). Mixed timelines work;
  //    the plan's per-gap `offset` already accounts for accumulated overlaps. ──
  let vLabel: string;
  let aLabel: string;
  if (n === 1) {
    vLabel = 'v0';
    aLabel = 'a0';
  } else {
    let vPrev = 'v0';
    let aPrev = 'a0';
    for (let i = 1; i < n; i++) {
      const t = plan.transitions[i - 1]!;
      const last = i === n - 1;
      const vOut = last ? 'vout' : `vx${i}`;
      const aOut = last ? 'aprog' : `ax${i}`;
      if (t.duration > 0) {
        const xf = resolveTransitionXfade(t.type);
        parts.push(`[${vPrev}][v${i}]xfade=transition=${xf}:duration=${t.duration}:offset=${t.offset}[${vOut}]`);
        parts.push(`[${aPrev}][a${i}]acrossfade=d=${t.duration}[${aOut}]`);
      } else {
        parts.push(`[${vPrev}][v${i}]concat=n=2:v=1:a=0[${vOut}]`);
        parts.push(`[${aPrev}][a${i}]concat=n=2:v=0:a=1[${aOut}]`);
      }
      vPrev = vOut;
      aPrev = aOut;
    }
    vLabel = 'vout';
    aLabel = 'aprog';
  }

  // ── music bed (optional) ──
  if (bed && bedIndex >= 0) {
    const loop = bed.loop ? 'aloop=loop=-1:size=2147483647,' : '';
    // A looping bed fills `loopDuration` (its "loop to fill" length); otherwise it
    // spans the whole program. Fades reference the bed's actual end either way.
    const bedDur = bed.loop && bed.loopDuration != null ? Math.max(0, bed.loopDuration) : plan.total;
    const vol = bed.gain !== undefined && bed.gain !== 1 ? `,volume=${gain(bed.gain)}` : '';
    const fade = [
      bed.fadeIn ? `afade=t=in:st=0:d=${bed.fadeIn}` : '',
      bed.fadeOut ? `afade=t=out:st=${Math.max(0, bedDur - bed.fadeOut)}:d=${bed.fadeOut}` : '',
    ]
      .filter(Boolean)
      .join(',');
    const fadePart = fade ? `,${fade}` : '';
    // `apad` before `atrim` guarantees the bed is EXACTLY `bedDur` long (pads a
    // short bed with silence); A_NORM matches the program format for the mix.
    parts.push(
      `[${bedIndex}:a]${loop}apad,atrim=duration=${bedDur},asetpts=PTS-STARTPTS${vol}${fadePart},${A_NORM}[bed]`,
    );

    if (bed.duck) {
      // Duck the bed UNDER the program audio (sidechaincompress, program = key).
      // amount (dB) is approximate — mapped to a compressor ratio.
      const th = 0.03;
      const ratio = Math.max(2, Math.min(20, Math.abs(bed.duck.amount) / 3 + 2));
      const atk = Math.round((bed.duck.attack ?? 0.02) * 1000); // ~20ms: catch speech onsets
      const rel = Math.round((bed.duck.release ?? 0.25) * 1000);
      parts.push(`[${aLabel}]asplit=2[prog1][progkey]`);
      parts.push(
        `[bed][progkey]sidechaincompress=threshold=${th}:ratio=${ratio}:attack=${atk}:release=${rel}[bedducked]`,
      );
      parts.push(`[prog1][bedducked]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    } else {
      parts.push(`[${aLabel}][bed]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    }
    aLabel = 'aout';
  }

  // ── overlays, composited in POSITIONAL order (track index, then clip index) ──
  // Image/video/shape overlays apply an `overlay` filter; text overlays burn their
  // own ASS. The positional order lets a text layer sit BEHIND a later subject clip
  // (no implicit z-by-kind). `collectOverlays` already emits them in that order.
  const layers = collectOverlays(spec);
  const textAssByOrder = new Map((textAssLayers ?? []).map((t) => [t.order, t.assPath]));
  const overlayHasAudioByOrder = new Map((overlayHasAudio ?? []).map((o) => [o.order, o.hasAudio]));
  const shapePngByOrder = new Map((shapePngLayers ?? []).map((s) => [s.order, s]));
  const boxStyleByOrder = new Map<number, BoxStyleLayer>((boxStylePngLayers ?? []).map((s) => [s.order, s]));
  let curV = vLabel;
  let ovK = 0; // shared input index for image + video overlays
  const overlayAudioLabels: string[] = []; // video-overlay audio legs to mix into the program

  for (const layer of layers) {
    const { clip, at, duration } = layer;
    const tf = clip.transform;
    if (layer.kind === 'effect') continue; // adjustment layers applied after compositing (below)
    if (layer.kind === 'image') {
      const media = clip.media as Extract<VisualClip['media'], { kind: 'image' }>;
      const k = ovK++;
      const idx = inputs.length;
      const ovPath = resolveToPath(media.source);
      inputs.push({ source: ovPath, ...(overlayInputOptions(ovPath) ? { options: overlayInputOptions(ovPath)! } : {}) });

      const blendMode = ffmpegBlendMode(media.blend);
      const boxGeom = overlayBoxGeom(tf?.frame, tf?.fit, W, H);
      // BoxStyle (rounded/border/shadow) is incompatible with the full-frame blend
      // VFX path; only style the alpha-overlay path.
      const bs = blendMode ? undefined : boxStyleByOrder.get(layer.order);
      const alphaChain = overlayAlphaChain(tf?.opacity, clip.enter, clip.exit, at, duration, resolveEntranceOptions(clip.motionTiming));
      const rotFilter = overlayRotateFilter(tf?.rotation);
      if (bs) {
        // Force the clip to EXACTLY the box px (cover-crop) so the box-sized mask/
        // border PNGs align, round/border it in upright space, THEN rotate/fade.
        const fb = boxToPx(tf?.frame, W, H);
        parts.push(`[${idx}:v]scale=${fb.w}:${fb.h}:force_original_aspect_ratio=increase,crop=${fb.w}:${fb.h},setsar=1[bsin${k}]`);
        const styled = applyBoxStyleChain(parts, inputs, `bsin${k}`, k, fb.w, fb.h, bs);
        parts.push(`[${styled}]setsar=1${rotFilter}${alphaChain}[ov${k}]`);
        curV = boxStyleShadowUnderlay(parts, inputs, curV, k, fb.x, fb.y, at, duration, bs);
      } else {
        // A blend-mode VFX layer fills the frame (no box/position); a boxless overlay
        // scales to full canvas; else size to its frame box.
        const sizeChain = blendMode ? `scale=${W}:${H}` : boxGeom ? boxGeom.size : `scale=${W}:${H}`;
        parts.push(`[${idx}:v]${sizeChain},setsar=1${blendMode ? ',format=yuv420p' : `${rotFilter}${alphaChain}`}[ov${k}]`);
      }

      const outL = `ovv${k}`;
      parts.push(overlayComposite(curV, `ov${k}`, outL, layer, blendMode, boxGeom, W, H));
      curV = outL;
    } else if (layer.kind === 'video') {
      // Picture-in-picture / b-roll on a layer above the base track (a clip whose
      // `transform.frame` is smaller than full-frame). No special overlay type.
      const media = clip.media as Extract<VisualClip['media'], { kind: 'video' }>;
      const k = ovK++;
      const idx = inputs.length;
      const ovPath = resolveToPath(media.source);
      inputs.push({ source: ovPath }); // a video clip plays its own frames — no -loop

      const blendMode = ffmpegBlendMode(media.blend);
      const boxGeom = overlayBoxGeom(tf?.frame, tf?.fit, W, H);
      const bs = blendMode ? undefined : boxStyleByOrder.get(layer.order);
      const trimStart = media.trimStart ?? 0;
      const alphaChain = overlayAlphaChain(tf?.opacity, clip.enter, clip.exit, at, duration, resolveEntranceOptions(clip.motionTiming));
      const rotFilter = overlayRotateFilter(tf?.rotation);
      // Trim the source window, then shift PTS so frame 0 lands at global t=at;
      // `enable` gates the composite to the [at, at+duration] window.
      if (bs) {
        // Box-exact (cover-crop) → round/border upright → rotate/fade; shadow underlay.
        const fb = boxToPx(tf?.frame, W, H);
        parts.push(
          `[${idx}:v]trim=start=${trimStart}:duration=${duration},setpts=PTS-STARTPTS+${gain(at)}/TB,` +
            `scale=${fb.w}:${fb.h}:force_original_aspect_ratio=increase,crop=${fb.w}:${fb.h},setsar=1[bsin${k}]`,
        );
        const styled = applyBoxStyleChain(parts, inputs, `bsin${k}`, k, fb.w, fb.h, bs);
        parts.push(`[${styled}]setsar=1${rotFilter}${alphaChain}[ov${k}]`);
        curV = boxStyleShadowUnderlay(parts, inputs, curV, k, fb.x, fb.y, at, duration, bs);
      } else {
        const sizeChain = blendMode ? `scale=${W}:${H}` : boxGeom ? boxGeom.size : `scale=${W}:${H}`;
        parts.push(
          `[${idx}:v]trim=start=${trimStart}:duration=${duration},setpts=PTS-STARTPTS+${gain(at)}/TB,` +
            `${sizeChain},setsar=1${blendMode ? ',format=yuv420p' : `${rotFilter}${alphaChain}`}[ov${k}]`,
        );
      }

      const outL = `ovv${k}`;
      parts.push(overlayComposite(curV, `ov${k}`, outL, layer, blendMode, boxGeom, W, H));
      curV = outL;

      // Mix the clip's source audio into the program (trim → gain → delay to `at`
      // → normalize). Skipped when muted / volume 0 / the source has no audio.
      const vol = clip.volume ?? 1;
      const hasAudio = overlayHasAudioByOrder.get(layer.order) ?? false;
      if (hasAudio && clip.muted !== true && vol > 0) {
        const aL = `ova${k}`;
        const atMs = Math.round(at * 1000);
        const volPart = vol !== 1 ? `,volume=${gain(vol)}` : '';
        const delayPart = atMs > 0 ? `,adelay=${atMs}|${atMs}` : '';
        parts.push(
          `[${idx}:a]atrim=start=${trimStart}:duration=${duration},asetpts=PTS-STARTPTS${volPart}${delayPart},${A_NORM}[${aL}]`,
        );
        overlayAudioLabels.push(aL);
      }
    } else if (layer.kind === 'shape') {
      // A vector shape, pre-rasterized to a PNG, composited like an image overlay:
      // static placement + fade, plus slide motion when the entrance is a slide
      // (pop degrades to the fade above).
      const png = shapePngByOrder.get(layer.order);
      if (png) {
        const k = ovK++;
        const idx = inputs.length;
        inputs.push({ source: png.path, options: ['-loop', '1'] });
        const alphaChain = overlayAlphaChain(tf?.opacity, clip.enter, clip.exit, at, duration, resolveEntranceOptions(clip.motionTiming));
        const rotFilter = overlayRotateFilter(tf?.rotation);
        parts.push(`[${idx}:v]setsar=1${rotFilter}${alphaChain}[ov${k}]`);

        // Frosted glass: blur the content BEHIND the card (cropped to its frame),
        // mask it to the rounded silhouette, and underlay it before the card. The
        // backdrop sits at the resting frame (a moving blur can't track a slide),
        // so it reads correctly once the card has settled.
        if (png.backdrop) {
          const bd = png.backdrop;
          const mIdx = inputs.length;
          inputs.push({ source: bd.maskPath, options: ['-loop', '1'] });
          const br = Math.max(1, Math.min(Math.round(bd.blur / 2), Math.floor(Math.min(bd.w, bd.h) / 2) - 1));
          const bg = `bsb${k}`, src = `bss${k}`, blr = `bsl${k}`, msk = `bsm${k}`, frost = `bsf${k}`, comp = `bsc${k}`;
          parts.push(`[${curV}]split[${bg}][${src}]`);
          // `format=yuva420p` gives the blurred crop an alpha plane for alphamerge
          // to write into; the gray mask supplies the rounded silhouette as alpha.
          parts.push(`[${src}]crop=${bd.w}:${bd.h}:${bd.x}:${bd.y},boxblur=${br}:1,format=yuva420p[${blr}]`);
          parts.push(`[${mIdx}:v]format=gray[${msk}]`);
          parts.push(`[${blr}][${msk}]alphamerge[${frost}]`);
          parts.push(
            `[${bg}][${frost}]overlay=${bd.x}:${bd.y}:enable='between(t,${at},${at + duration})'[${comp}]`,
          );
          curV = comp;
        }

        const outL = `ovv${k}`;
        const base: OverlayXY = { x: `${png.xPx}`, y: `${png.yPx}`, quote: false };
        const xy = formatOverlayXY(
          overlayEntranceSlide(base, clip.enter, clip.exit, at, duration, W, H, resolveEntranceOptions(clip.motionTiming)),
        );
        parts.push(
          `[${curV}][ov${k}]overlay=${xy}:enable='between(t,${at},${at + duration})'[${outL}]`,
        );
        curV = outL;
      }
    } else {
      // text → burn its own ASS at this z-position. With a `fontsDir`, libass
      // resolves custom `style.fontFile` fonts by family name from that directory.
      const assPath = textAssByOrder.get(layer.order);
      if (assPath) {
        const escaped = escapeSubtitlePath(assPath).replace(/'/g, "'\\''");
        const outL = `vtxt${layer.order}`;
        const fontsArg = fontsDir ? `:fontsdir='${escapeSubtitlePath(fontsDir).replace(/'/g, "'\\''")}'` : '';
        const assArg = fontsDir ? `filename='${escaped}'${fontsArg}` : `'${escaped}'`;
        parts.push(`[${curV}]ass=${assArg}[${outL}]`);
        curV = outL;
      }
    }
  }

  // ── adjustment-effect layers: filter the COMPOSITE during each effect's window ──
  // (CapCut effect track / OpenShot top-level effects). Each applies its filter to
  // the running composite, time-gated to [at, at+duration] via ffmpeg `enable`.
  for (const layer of layers) {
    if (layer.kind !== 'effect') continue;
    const media = layer.clip.media as Extract<VisualClip['media'], { kind: 'effect' }>;
    const chain = buildEffectsFilter([media.effect], shaderPaths); // ',<filter…>' (single builtin/lut/shader) or ''
    if (!chain) continue;
    const body = chain.slice(1);
    const outL = `vfx${layer.order}`;
    const win = `between(t,${gain(layer.at)},${gain(layer.at + layer.duration)})`;
    if (body.includes(',')) {
      // MULTI-filter chain (e.g. a shader's hwupload→libplacebo→hwdownload): inline
      // `:enable` would gate only the LAST filter, so the rest runs all the time.
      // Gate the WHOLE chain by processing a split copy and overlaying it back ONLY
      // during the window — the canonical ffmpeg way to time-bound a filter chain.
      const b = `fxb${layer.order}`;
      const s = `fxs${layer.order}`;
      const p = `fxp${layer.order}`;
      parts.push(`[${curV}]split[${b}][${s}]`);
      parts.push(`[${s}]${body}[${p}]`);
      parts.push(`[${b}][${p}]overlay=enable='${win}':format=auto,format=yuv420p[${outL}]`);
    } else {
      // SINGLE filter (hue/eq/lut3d/…) — natively timeline-gatable, so inline `enable`
      // (cheaper: the filter itself no-ops outside the window). ffmpeg's FIRST option
      // separator after a filter name is `=`, not `:`, so a BARE filter (no args, e.g.
      // `vignette`/`negate`) needs `vignette=enable=…`; one that already has args uses
      // `:` to add another (`hue=s=0:enable=…`).
      const sep = body.includes('=') ? ':' : '=';
      parts.push(`[${curV}]${body}${sep}enable='${win}'[${outL}]`);
    }
    curV = outL;
  }

  // ── mix video-overlay (PiP) audio on top of the program ──
  // `normalize=0` keeps the program at full level; overlay audio adds over it.
  // `duration=first` binds the mix to the program (the base-track length =
  // composition length, which `aLabel` carries as the first input). This is
  // intentional, not a truncation bug: a PiP lives inside the composition, so its
  // adelayed leg already fits within program length; were a PiP authored to run
  // past the end, its video is clipped by `-shortest` too, so audio/video stay in
  // lockstep. Do NOT switch to `duration=longest` — that would let a stray overlay
  // extend the program past its visual end.
  if (overlayAudioLabels.length > 0) {
    const ins = [aLabel, ...overlayAudioLabels];
    parts.push(
      `${ins.map((l) => `[${l}]`).join('')}amix=inputs=${ins.length}:normalize=0:duration=first:dropout_transition=0[aovmix]`,
    );
    aLabel = 'aovmix';
  }

  return {
    inputs,
    filterComplex: parts.join(';'),
    videoLabel: `[${curV}]`,
    audioLabel: `[${aLabel}]`,
  };
}
