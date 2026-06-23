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
import type { ClipMotionTiming } from './motion-feel.js';
import type { TextLoop } from './text-animation.js';
import type { TextMotion } from './text-motion.js';
import type { EffectRef } from './effects/contract.js';
import type { CaptionCue, TextStyle } from './captions.js';
import type { ShapeKind, ShapeStyle } from './shape.js';
import type { TransitionRef } from './transitions.js';
import type { ClipMask } from './mask.js';
import type { Marker } from './marker.js';

/** Compositing blend for a visual clip against what's beneath it.
 *  Mirrors the common NLE set (CapCut: Normal/Overlay/Screen/Darken/Brighten —
 *  `darken`/`lighten` are the Darken/Brighten equivalents). */
export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'darken' | 'lighten';

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
  /** Link-group id — couples this clip to its partner audio/video so edits carry
   *  the whole group in sync (J/L cuts, detached audio). See `./link`. */
  linkId?: string;
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
  /** Entrance/exit TIMING — named feel (Snappy/Bouncy/…) + optional ramp overrides.
   *  Shapes the `enter`/`exit` motion above; absent ⇒ engine defaults. See `motion-feel`. */
  motionTiming?: ClipMotionTiming;
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
  /** Clip-relative time anchors (seconds from the clip's start) — follow the clip
   *  when it moves. See `./marker`. */
  markers?: Marker[];
  /**
   * TEMPLATE SLOT marker — flags this clip as a user-fillable slot in a template
   * ({@link Template}). A media slot is typically an empty-source placeholder the
   * editor's fill flow (or an agent) populates; a text slot is editable copy. The
   * surrounding (non-slot) clips are the locked design. Drives the "fill these N
   * slots" UI and lets an agent pick a template + fill it. Geometry/animation come
   * from the clip itself, so a slot keeps the template's designed look.
   */
  slot?: {
    /** Unique-within-template id. */
    id: string;
    /** Human label for the fill UI ("Background", "Webcam", "Title"). */
    label?: string;
    /** Fill kind — what the user supplies. Defaults to the clip's media kind. */
    kind?: 'media' | 'text';
    /** Optional ordering/semantic hint. */
    role?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * A transition between two ADJACENT clips on a visual lane. `between` references
 * the clip pair as either stable clip IDS `[idA, idB]` (canonical) or, as an
 * authoring shorthand, clip INDICES `[i, i+1]` — `normalizeSpec` resolves indices
 * to ids (like {@link SourceRef}'s string/object duality), so consumers read one
 * id-based form via {@link transitionGap}. Overlaps clip A into clip B.
 */
export interface SequenceTransition {
  between: [string, string] | [number, number];
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
  /** Stable lane id (minted by `normalizeSpec` via `mintIds`). Lets selections,
   *  edits, and transitions reference a lane by identity, not array position. */
  id?: string;
  clips: VisualClip[];
  /** Cross-dissolves between adjacent clips on THIS lane (main-track style). */
  transitions?: SequenceTransition[];
  /** Clips lie end-to-end (a main track). Editor snap/ripple/insert hint. */
  sequential?: boolean;
}

/* ── transition helpers ───────────────────────────────────────────────────── */

/**
 * Resolve a {@link SequenceTransition} to the GAP index it occupies on `track` —
 * i.e. the index of the FIRST clip of the adjacent pair (`gap`/`gap+1`). Handles
 * both `between` forms (ids or indices) and returns undefined when the pair is not
 * two adjacent clips (e.g. a clip was inserted between them — the transition is
 * stale and should be ignored). The single resolver every renderer/editor uses so
 * none re-implement the (id|index)→position logic. Pure.
 */
export function transitionGap(track: VisualTrack, t: SequenceTransition): number | undefined {
  const [a, b] = t.between;
  if (typeof a === 'number' && typeof b === 'number') {
    return b === a + 1 && a >= 0 && a + 1 < track.clips.length ? a : undefined;
  }
  const ia = track.clips.findIndex((c) => c.id === a);
  return ia >= 0 && track.clips[ia + 1]?.id === b ? ia : undefined;
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
