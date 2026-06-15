/**
 * @classytic/vixel-schema — the VixelSpec composition contract.
 * =======================================================
 * The single, zero-dependency source of truth for the JSON an agent emits, an
 * editor (vixel-ui) edits, and the engine (vixel) renders. No ffmpeg, no React —
 * just the types (+ two pure helpers). The engine and editor both depend on
 * THIS, so the contract never drifts and the frontend never pulls the engine.
 *
 * Times are seconds at the surface; presets (transitions/animations/easings) are
 * closed enums an agent can reliably emit. Grounded in OTIO (media-reference
 * separation) + Remotion/editly edit-specs.
 */

// ── media references (decouple the edit from the asset) ──────────────────────

/** Synthetic sources the engine can generate (lavfi-backed). */
export type GeneratorKind = 'color' | 'testsrc' | 'smptebars';

export interface ExternalReference {
  kind: 'external';
  url: string;
}
export interface GeneratorReference {
  kind: 'generator';
  generator: GeneratorKind;
  /** e.g. `{ color: '#101820' }` for the `color` generator. */
  params?: { color?: string };
}
export interface MissingReference {
  kind: 'missing';
  hint?: string;
}
export type MediaReference = ExternalReference | GeneratorReference | MissingReference;

/** A `source` accepts a string shorthand (external file/URL) or a typed reference. */
export type SourceRef = string | MediaReference;

/** Type guard: is this source a typed {@link MediaReference} (vs a string)? */
export function isMediaReference(x: unknown): x is MediaReference {
  return typeof x === 'object' && x !== null && 'kind' in x;
}

// ── captions + text style ────────────────────────────────────────────────────

/** One word with its own timing — the unit of karaoke / pop animation. */
export interface CaptionWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** One on-screen caption line. Provide `words` for word-level animation. */
export interface CaptionCue {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly words?: readonly CaptionWord[];
}

/** Where the caption block sits vertically. */
export type CaptionAlignment = 'top' | 'center' | 'bottom';

/** How each word animates/activates as it's spoken (CapCut/TikTok-style). */
export type CaptionAnimation =
  | 'none'
  | 'fade'
  | 'karaoke'
  | 'pop'
  | 'word-by-word'
  | 'highlight'
  | 'highlight-box';

/** Bring-your-own text style. Every field is JSON-serializable. Colors `#RRGGBB`. */
export interface TextStyle {
  fontFamily?: string;
  fontFile?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  fillColor?: string;
  highlightColor?: string;
  stroke?: { width: number; color: string };
  shadow?: { depth: number; color: string; blur?: number };
  box?: { color: string };
  alignment?: CaptionAlignment;
  marginV?: number;
  letterSpacing?: number;
  animation?: CaptionAnimation;
}

/** Output canvas the captions are authored against. */
export interface CaptionCanvas {
  readonly width: number;
  readonly height: number;
}

// ── keyframes (scoped animation model) ───────────────────────────────────────

/** Easing INTO the next keyframe (movis/AE model), + `hold`. */
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

export interface Keyframe {
  /** Time in seconds (relative to the element's start). */
  t: number;
  value: number;
  /** Easing applied across the segment to the NEXT keyframe. Default `linear`. */
  easing?: KeyframeEasing;
}

// ── composition ──────────────────────────────────────────────────────────────

export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutExpo'
  | 'easeOutBounce';

/** Canonical transitions (most map 1:1 to an ffmpeg `xfade`; CapCut aliases resolved internally). */
export type TransitionType =
  | 'fade'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'zoomin'
  | 'none'
  | 'whip-pan'
  | 'zoom-blur'
  | 'blur'
  | 'glitch'
  | 'radial'
  | 'ripple'
  | 'squeeze'
  | 'iris';

export interface Transition {
  type: TransitionType;
  /** Overlap duration in seconds (shortens total length). */
  duration: number;
  easing?: Easing;
}

export type ClipAnimationPreset = 'kenBurns' | 'zoom' | 'pan';
export interface ClipAnimation {
  preset: ClipAnimationPreset;
  direction?: 'in' | 'out' | 'left' | 'right' | 'up' | 'down';
  /** e.g. ken-burns zoom amount. */
  amount?: number;
  easing?: Easing;
}

export type OverlayEnter = 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'popIn' | 'none';
export type OverlayExit = 'fadeOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'popOut' | 'none';
export type Anchor =
  | 'top' | 'top-left' | 'top-right'
  | 'center' | 'center-left' | 'center-right'
  | 'bottom' | 'bottom-left' | 'bottom-right';

export type Fit = 'contain' | 'cover' | 'stretch';

export interface Clip {
  /** Media: a path/URL string, or a typed {@link SourceRef}. */
  source: SourceRef;
  /** Seconds into the source to start (default 0). */
  in?: number;
  /** Seconds into the source to stop (default = end). */
  out?: number;
  /** Required for images; for video defaults to (out − in). */
  duration?: number;
  fit?: Fit;
  /** Transition INTO the next clip. */
  transition?: Transition;
  animation?: ClipAnimation;
  /** Source-audio gain 0..1 (default 1). */
  volume?: number;
  /** Carried through untouched — vendor/agent/editor extension data. */
  metadata?: Record<string, unknown>;
}

export interface OverlayBase {
  /** Global start time (seconds). */
  at: number;
  /** Seconds on screen. */
  duration: number;
  /** Named {@link Anchor} or normalized `{x,y}` 0..1 (the overlay's CENTER). Default `center`. */
  position?: Anchor | { x: number; y: number };
  /** Size multiplier (default 1). */
  scale?: number;
  opacity?: number;
  in?: OverlayEnter;
  out?: OverlayExit;
  metadata?: Record<string, unknown>;
}

export interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  style?: TextStyle;
  /** Optional word-level cues → animated/karaoke captions. */
  cues?: CaptionCue[];
}

/** A position keyframe for an animated overlay. `x`/`y` normalized 0..1 (CENTER); `t` seconds from `at`. */
export interface PositionKeyframe {
  t: number;
  x: number;
  y: number;
  easing?: KeyframeEasing;
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image';
  source: SourceRef;
  /** Width as a FRACTION of the canvas (0..1). Default 0.25. Height auto (aspect). */
  width?: number;
  /** Height as a fraction of the canvas (0..1). Omit to preserve aspect. */
  height?: number;
  /** Keyframed motion path — overrides `position` when present (≥2 keyframes). */
  motion?: PositionKeyframe[];
  blend?: 'normal' | 'screen' | 'multiply' | 'overlay';
}

export type Overlay = TextOverlay | ImageOverlay;

export type AudioRole = 'music' | 'voice' | 'sfx';
export interface DuckSpec {
  /** What to attenuate while this plays. Default `music`. */
  target?: 'music' | 'all';
  /** Gain reduction in dB (e.g. -12). */
  amount: number;
  attack?: number;
  release?: number;
}

export interface AudioItem {
  source: SourceRef;
  at?: number;
  in?: number;
  out?: number;
  gain?: number;
  loop?: boolean;
  role?: AudioRole;
  duck?: DuckSpec;
  fadeIn?: number;
  fadeOut?: number;
  metadata?: Record<string, unknown>;
}

export interface VideoTrack {
  type: 'video';
  clips: Clip[];
}
export interface OverlayTrack {
  type: 'overlay';
  items: Overlay[];
}
export interface AudioTrack {
  type: 'audio';
  items: AudioItem[];
}
export type Track = VideoTrack | OverlayTrack | AudioTrack;

export interface VixelSpec {
  version: 1;
  output: {
    width: number;
    height: number;
    /** Frames per second (rational allowed for NTSC, e.g. 30000/1001). */
    fps: number | { num: number; den: number };
    /** Background color `#RRGGBB`. Default `#000000`. */
    background?: string;
  };
  tracks: Track[];
  metadata?: Record<string, unknown>;
}

/** Identity helper for authoring a spec with full type-checking. */
export function defineComposition(spec: VixelSpec): VixelSpec {
  return spec;
}
