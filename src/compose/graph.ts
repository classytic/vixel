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
import { overlayXY, overlayWidthPx } from './layout.js';
import { resolveXfadeName } from './transitions.js';
import { compileScalarKeyframes } from '../core/keyframe.js';
import { resolveToPath } from '../core/media-reference.js';
import { assertSafeColor } from '../core/color.js';
import type { TimelinePlan } from './timeline.js';
import type { AudioItem, ClipAnimation, ImageOverlay, VixelSpec } from './schema.js';

/** Default fade duration (s) for overlay fadeIn/fadeOut. */
const OVERLAY_FADE_SEC = 0.4;

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
  /** Ordered inputs (clips, then the audio bed, then image overlays). */
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

function collectImageOverlays(spec: VixelSpec): ImageOverlay[] {
  const out: ImageOverlay[] = [];
  for (const t of spec.tracks) {
    if (t.type === 'overlay') for (const it of t.items) if (it.kind === 'image') out.push(it);
  }
  return out;
}

export interface ComposeGraphInput {
  readonly spec: VixelSpec;
  readonly plan: TimelinePlan;
  /** Whether each clip (by plan index) carries an audio stream. */
  readonly clipHasAudio: boolean[];
  /** Path to a generated ASS file burning the spec's text overlays (optional). */
  readonly captionsAssPath?: string;
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

/** First music/voice item across audio tracks (the bed). v1 = one bed. */
function firstAudioItem(spec: VixelSpec): AudioItem | undefined {
  for (const t of spec.tracks) if (t.type === 'audio' && t.items[0]) return t.items[0];
  return undefined;
}

export function buildComposeGraph({ spec, plan, clipHasAudio, captionsAssPath }: ComposeGraphInput): ComposeGraph {
  const W = spec.output.width;
  const H = spec.output.height;
  const F = fpsNumber(spec.output.fps);
  const bg = assertSafeColor(spec.output.background ?? '#000000', 'output.background').replace('#', '0x');
  const n = plan.clips.length;

  const allHard = plan.transitions.every((t) => t.duration === 0);
  const allSoft = plan.transitions.every((t) => t.duration > 0);
  if (n > 1 && !allHard && !allSoft) {
    throw new ConfigError(
      'compose v1: a track must use transitions on ALL gaps or NONE (no mixed hard-cut + crossfade yet)',
    );
  }

  const inputs: ComposeInput[] = plan.clips.map((c) => ({ source: c.source }));
  const bed = firstAudioItem(spec);
  const bedIndex = bed ? inputs.length : -1;
  if (bed) inputs.push({ source: resolveToPath(bed.source) });

  const parts: string[] = [];

  // Source clips (for per-clip animation, which the plan doesn't carry).
  const vTrack = spec.tracks.find((t) => t.type === 'video');
  const sourceClips = vTrack && vTrack.type === 'video' ? vTrack.clips : [];

  // ── per-clip video (scale/pad/fps, then an optional ken-burns/zoom/pan) ──
  plan.clips.forEach((c, i) => {
    const anim = sourceClips[i]?.animation;
    const animFilter = anim ? clipAnimationFilter(anim, W, H, F, c.duration) : '';
    parts.push(
      `[${i}:v]trim=start=${c.trimStart}:duration=${c.duration},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(${W}-iw)/2:(${H}-ih)/2:color=${bg},setsar=1,fps=${F}${animFilter},format=yuv420p[v${i}]`,
    );
  });

  // ── per-clip audio (synthesize silence where a clip has none), all forced to
  //    the canonical format so they can be combined ──
  plan.clips.forEach((c, i) => {
    if (clipHasAudio[i]) {
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

  // ── video chain ──
  let vLabel: string;
  if (n === 1) {
    vLabel = 'v0';
  } else if (allHard) {
    parts.push(`${plan.clips.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[vout]`);
    vLabel = 'vout';
  } else {
    let prev = 'v0';
    for (let i = 1; i < n; i++) {
      const t = plan.transitions[i - 1]!;
      const out = i === n - 1 ? 'vout' : `vx${i}`;
      const xf = resolveXfadeName(t.type);
      parts.push(`[${prev}][v${i}]xfade=transition=${xf}:duration=${t.duration}:offset=${t.offset}[${out}]`);
      prev = out;
    }
    vLabel = 'vout';
  }

  // ── audio chain (program) ──
  let aLabel: string;
  if (n === 1) {
    aLabel = 'a0';
  } else if (allHard) {
    parts.push(`${plan.clips.map((_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1[aprog]`);
    aLabel = 'aprog';
  } else {
    let prev = 'a0';
    for (let i = 1; i < n; i++) {
      const t = plan.transitions[i - 1]!;
      const out = i === n - 1 ? 'aprog' : `ax${i}`;
      parts.push(`[${prev}][a${i}]acrossfade=d=${t.duration}[${out}]`);
      prev = out;
    }
    aLabel = 'aprog';
  }

  // ── music bed (optional) ──
  if (bed && bedIndex >= 0) {
    const loop = bed.loop ? 'aloop=loop=-1:size=2147483647,' : '';
    const vol = bed.gain !== undefined && bed.gain !== 1 ? `,volume=${gain(bed.gain)}` : '';
    const fade = [
      bed.fadeIn ? `afade=t=in:st=0:d=${bed.fadeIn}` : '',
      bed.fadeOut ? `afade=t=out:st=${Math.max(0, plan.total - bed.fadeOut)}:d=${bed.fadeOut}` : '',
    ]
      .filter(Boolean)
      .join(',');
    const fadePart = fade ? `,${fade}` : '';
    // `apad` before `atrim` guarantees the bed is EXACTLY `total` long (pads a
    // short bed with silence); A_NORM matches the program format for the mix.
    parts.push(
      `[${bedIndex}:a]${loop}apad,atrim=duration=${plan.total},asetpts=PTS-STARTPTS${vol}${fadePart},${A_NORM}[bed]`,
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

  // ── image / GIF overlays (composited on top of the base video) ──
  const overlays = collectImageOverlays(spec);
  let curV = vLabel;
  overlays.forEach((ov, k) => {
    const idx = inputs.length;
    const ovPath = resolveToPath(ov.source);
    inputs.push({ source: ovPath, ...(overlayInputOptions(ovPath) ? { options: overlayInputOptions(ovPath)! } : {}) });

    const wpx = overlayWidthPx(W, ov.width, ov.scale);
    const hpx = ov.height !== undefined ? Math.round(ov.height * H) : -1;
    const op = ov.opacity ?? 1;
    // Alpha is needed for opacity OR a fade; emit `format=rgba` once, then the
    // opacity mix + fades keyed on absolute time so they land in the on-screen window.
    const fadeIn = ov.in === 'fadeIn' ? `,fade=t=in:st=${gain(ov.at)}:d=${OVERLAY_FADE_SEC}:alpha=1` : '';
    const fadeOut =
      ov.out === 'fadeOut'
        ? `,fade=t=out:st=${gain(Math.max(0, ov.at + ov.duration - OVERLAY_FADE_SEC))}:d=${OVERLAY_FADE_SEC}:alpha=1`
        : '';
    const needsAlpha = op !== 1 || fadeIn !== '' || fadeOut !== '';
    const alphaChain = needsAlpha
      ? `,format=rgba${op !== 1 ? `,colorchannelmixer=aa=${gain(op)}` : ''}${fadeIn}${fadeOut}`
      : '';
    parts.push(`[${idx}:v]scale=${wpx}:${hpx},setsar=1${alphaChain}[ov${k}]`);

    const outL = `ovv${k}`;
    let xy: string;
    if (ov.motion && ov.motion.length >= 2) {
      // Keyframed path: compile x/y to time-expressions (local time = t − at).
      // Quote because the expressions contain (escaped) commas.
      const localT = `(t-${ov.at})`;
      const xExpr = compileScalarKeyframes(ov.motion.map((k) => ({ t: k.t, value: k.x, ...(k.easing ? { easing: k.easing } : {}) })), localT);
      const yExpr = compileScalarKeyframes(ov.motion.map((k) => ({ t: k.t, value: k.y, ...(k.easing ? { easing: k.easing } : {}) })), localT);
      xy = `x='(W*(${xExpr}))-(w/2)':y='(H*(${yExpr}))-(h/2)'`;
    } else {
      const { x, y } = overlayXY(ov.position);
      xy = `x=${x}:y=${y}`;
    }
    parts.push(
      `[${curV}][ov${k}]overlay=${xy}:enable='between(t,${ov.at},${ov.at + ov.duration})'[${outL}]`,
    );
    curV = outL;
  });

  // ── text overlays / captions (burned via libass on top of everything) ──
  if (captionsAssPath) {
    const escaped = escapeSubtitlePath(captionsAssPath).replace(/'/g, "'\\''");
    parts.push(`[${curV}]ass='${escaped}'[vcap]`);
    curV = 'vcap';
  }

  return {
    inputs,
    filterComplex: parts.join(';'),
    videoLabel: `[${curV}]`,
    audioLabel: `[${aLabel}]`,
  };
}
