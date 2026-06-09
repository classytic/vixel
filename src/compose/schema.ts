/**
 * Composition schema — the declarative, AI-emittable spec.
 * =======================================================
 * One JSON document an agent (or MCP tool) emits to describe a video: a
 * multi-track timeline of clips (with transitions), globally-timed overlays
 * (text/image with enter/exit animation), and audio (with ducking). The
 * renderer (forthcoming `compose()`) compiles it to a single ffmpeg
 * `filter_complex` graph.
 *
 * Design (grounded in editly's edit-spec + Remotion's TransitionSeries):
 *  - **Times are in seconds** at the surface (agents reason in seconds);
 *    compiled to frames internally.
 *  - **Presets, not raw curves** — transitions/animations/easings are closed
 *    enums an agent can reliably emit; vixel owns the math. Each maps to a
 *    native ffmpeg filter (`xfade`, `zoompan`, `overlay`, `ass`,
 *    `adelay`/`amix`/`sidechaincompress`).
 *  - **One auto-sequencing `video` track** (transitions overlap neighbors:
 *    `total = Σ clipDur − Σ transition`), plus independent globally-timed
 *    `overlay` and `audio` tracks.
 *
 * This module is the **schema only** (the MCP surface). The renderer lands in a
 * dedicated slice; keeping the contract stable lets agents target it now.
 */

import type { CaptionCue, TextStyle } from '../captions/types.js';
import type { KeyframeEasing } from '../core/keyframe.js';
import type { SourceRef } from '../core/media-reference.js';

export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutExpo'
  | 'easeOutBounce';

/**
 * Canonical transitions. Most map 1:1 to an ffmpeg `xfade` name
 * (fade, dissolve, the wipe/slide directions); `zoomin` compiles via `zoompan`
 * and `none` is a hard cut (plain concat, no `xfade`).
 */
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
  // CapCut-flavored presets — friendly aliases resolved via TRANSITION_PRESETS
  // (see ./transitions.ts). Intent-level; the xfade mapping stays internal.
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
  /** Media: a path/URL string, or a typed {@link SourceRef} (external/generator/missing). */
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
  /** Carried through untouched — vendor/agent/editor extension data (ignored by render). */
  metadata?: Record<string, unknown>;
}

export interface OverlayBase {
  /** Global start time (seconds). */
  at: number;
  /** Seconds on screen. */
  duration: number;
  /**
   * Placement — RESOLUTION-INDEPENDENT so an agent never needs pixels:
   * a named {@link Anchor} (`'bottom-center'`, `'top-right'`, …) or a normalized
   * `{x,y}` in 0..1 (the overlay's CENTER; `{0.5,0.5}` = dead center). Default
   * `'center'`. vixel resolves it to pixels against `output.width/height`.
   */
  position?: Anchor | { x: number; y: number };
  /** Size multiplier (default 1). */
  scale?: number;
  opacity?: number;
  in?: OverlayEnter;
  out?: OverlayExit;
  /** Carried through untouched — vendor/agent/editor extension data (ignored by render). */
  metadata?: Record<string, unknown>;
}

export interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  /** Optional BYO style (font, color, stroke, …). */
  style?: TextStyle;
  /** Optional word-level cues → animated/karaoke captions for this overlay. */
  cues?: CaptionCue[];
}

/**
 * A position keyframe for an animated overlay (moving sticker / lower-third).
 * `x`/`y` are normalized 0..1 (the overlay's CENTER); `t` is seconds relative to
 * the overlay's `at`. Compiles to an ffmpeg `overlay=x/y` time-expression — the
 * one motion attribute ffmpeg animates per-frame (see DESIGN.md, move #3).
 */
export interface PositionKeyframe {
  t: number;
  x: number;
  y: number;
  easing?: KeyframeEasing;
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image';
  /** Image, animated GIF/WebP, or video to composite (string or {@link SourceRef}). */
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
  /** Audio media: a path/URL string, or a typed {@link SourceRef}. */
  source: SourceRef;
  at?: number;
  in?: number;
  out?: number;
  gain?: number;
  loop?: boolean;
  role?: AudioRole;
  /** Duck other tracks (e.g. a voice item ducks music). */
  duck?: DuckSpec;
  fadeIn?: number;
  fadeOut?: number;
  /** Carried through untouched — vendor/agent/editor extension data (ignored by render). */
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
  /** Carried through untouched — vendor/agent/editor extension data (ignored by render). */
  metadata?: Record<string, unknown>;
}

/** Identity helper for authoring a spec with full type-checking. */
export function defineComposition(spec: VixelSpec): VixelSpec {
  return spec;
}
