/**
 * The visual model — the NLE track model (CapCut / OpenShot / editly).
 * ====================================================================
 * A timeline is **type-agnostic visual lanes** + separate **audio lanes**. A lane
 * ({@link VisualTrack}) is just an ordered list of {@link VisualClip}s. A clip
 * carries its own media kind ({@link MediaSource}) — image / video / text / shape
 * / effect — so "this is an image lane" is a category error: any lane holds any
 * visual media, mixed. There is NO special "base" track and NO "PiP" type:
 * picture-in-picture is simply a clip whose `transform.frame` is smaller than
 * full-frame.
 *
 * STACKING is purely positional: lanes composite in `tracks` order (later lane =
 * on top), and clips within a lane composite in array order. There is no z by
 * media kind — to put text over a subject, put it on a higher lane.
 *
 * Every clip is absolutely timed (`at` + `duration`), like every CapCut/Premiere
 * clip. Moving a clip between lanes changes only its lane + `at`; its
 * `media.kind` never changes.
 */
import type { SourceRef } from './media.js';
import type { VisualTransform } from './transform.js';
import type { Placement } from './layout.js';
import type { OverlayEnter, OverlayExit, ClipAnimation } from './animation.js';
import type { TextLoop } from './text-animation.js';
import type { TextMotion } from './text-motion.js';
import type { EffectRef } from './effects/contract.js';
import type { CaptionCue, TextStyle } from './captions.js';
import type { ShapeKind, ShapeStyle } from './shape.js';
import type { TransitionRef } from './transitions.js';
import type { ClipMask } from './mask.js';

/** Compositing blend for a visual clip against what's beneath it. */
export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay';

export interface VideoMedia {
  kind: 'video';
  source: SourceRef;
  /** Seconds into the SOURCE where playback starts (on-screen length = clip `duration`). */
  trimStart?: number;
  blend?: BlendMode;
}
export interface ImageMedia {
  kind: 'image';
  source: SourceRef;
  blend?: BlendMode;
}
export interface TextMedia {
  kind: 'text';
  text: string;
  style?: TextStyle;
  /** Word-level cues → animated/karaoke captions. */
  cues?: CaptionCue[];
  /** Per-token kinetic typography (staggered word/char/line punch-ins). Distinct
   *  from `clip.enter` (whole-block) and `cues` (speech-timed recolor). */
  motion?: TextMotion;
}
export interface ShapeMedia extends ShapeStyle {
  kind: 'shape';
  shape?: ShapeKind;
  /** A {@link BUILTIN_SHAPE_PRESETS} id (e.g. `'glass'`); inlined by `normalizeSpec`, then dropped. */
  style?: string;
}
export interface EffectMedia {
  kind: 'effect';
  /** Adjustment-layer effect applied to everything composited beneath, during the clip window. */
  effect: EffectRef;
}

/** The per-clip media payload — discriminated by `kind`. The clip's type lives HERE, not on its lane. */
export type MediaSource = VideoMedia | ImageMedia | TextMedia | ShapeMedia | EffectMedia;

export type MediaKind = MediaSource['kind'];

/**
 * One media segment on a visual lane — absolutely timed (`at` + `duration`).
 * Carries its media, spatial transform (incl. frame `style`: radius/border/shadow),
 * enter/exit animation, per-clip effect stack, and source-audio gain.
 */
export interface VisualClip {
  /** Stable id for editor selection/keying. */
  id?: string;
  media: MediaSource;
  /** Global start time (seconds). */
  at: number;
  /** Seconds on screen. */
  duration: number;
  transform?: VisualTransform;
  /** Crop to a shape (rect/ellipse PiP mask) — optionally animated. Independent of
   *  `transform.style.radius`; resolved per-frame via `resolveMaskAt`. */
  mask?: ClipMask;
  /** Semantic placement (region / 12×12 grid) — resolves to `transform.frame` by `normalizeSpec`. */
  place?: Placement;
  /** Entrance animation preset. */
  enter?: OverlayEnter;
  /** Exit animation preset. */
  exit?: OverlayExit;
  /** Continuous loop animation (text clips) — sampled every frame via `loopAt`. */
  loop?: TextLoop;
  /** High-level motion preset (kenBurns/zoom/pan) — expands to transform keyframes engine-side. */
  animation?: ClipAnimation;
  /** Per-clip effect stack (baked into THIS clip for its whole life). */
  effects?: EffectRef[];
  /** Source-audio gain 0..1 (video clips). Default 1. */
  volume?: number;
  /** Mute source audio — preserves `volume`; render treats as silent. */
  muted?: boolean;
  /** Hidden — skipped by renderer + preview (editor visibility toggle). */
  hidden?: boolean;
  group?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A transition placed BETWEEN two adjacent clips on a visual lane. `between` is
 * the pair of clip indices `[i, i+1]`; it overlaps clip `i` into clip `i+1`.
 */
export interface SequenceTransition {
  between: [number, number];
  transition: TransitionRef;
}

/**
 * A type-agnostic visual lane. `clips` composite over a transparent canvas; lane
 * order in {@link VixelSpec.tracks} is the stacking order. `sequential` marks a
 * lane whose clips lie end-to-end (a CapCut "main track") so the editor ripples
 * inserts and places transitions between adjacent clips — an editor hint only;
 * rendering treats every lane identically via each clip's absolute `at`.
 */
export interface VisualTrack {
  type: 'visual';
  clips: VisualClip[];
  /** Cross-dissolves between adjacent clips on THIS lane (main-track style). */
  transitions?: SequenceTransition[];
  /** Clips lie end-to-end (a main track). Editor snap/ripple/insert hint. */
  sequential?: boolean;
}

/* ── source helpers ───────────────────────────────────────────────────────── */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)(\?|#|$)/i;

/** Resolve a {@link SourceRef} to a URL/path string (or '' for generators/missing). */
export function sourceUrl(source: SourceRef): string {
  if (typeof source === 'string') return source;
  if (source.kind === 'external') return source.url;
  return '';
}

/** Heuristic: does this source point at a video (vs an image)? Extension-based. */
export function isVideoSource(source: SourceRef): boolean {
  return VIDEO_EXT.test(sourceUrl(source));
}
