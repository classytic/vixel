/**
 * Composition schema — the declarative, AI-emittable spec.
 * =======================================================
 * The spec types now live in the shared contract `@classytic/vixel-schema` — the
 * single source of truth for the engine, the editor (vixel-ui), and agents. This
 * module re-exports them so existing `./compose/schema.js` imports keep working
 * and the engine's public API is unchanged. The renderer (`compose()`) compiles
 * a {@link VixelSpec} to a single ffmpeg `filter_complex` graph.
 */
export type {
  Easing,
  TransitionType,
  Transition,
  ClipAnimationPreset,
  ClipAnimation,
  OverlayEnter,
  OverlayExit,
  TextLoop,
  TextAnimationPhase,
  TextAnimationDescriptor,
  Anchor,
  Fit,
  // Unified visual model
  BlendMode,
  MediaKind,
  MediaSource,
  VideoMedia,
  ImageMedia,
  TextMedia,
  ShapeMedia,
  EffectMedia,
  VisualClip,
  VisualTrack,
  AudioRole,
  DuckSpec,
  AudioItem,
  AudioTrack,
  Track,
  VixelSpec,
  EffectKind,
  EffectParamType,
  EffectParam,
  EffectDescriptor,
  EffectRef,
  Rect,
  BoxStyle,
  VisualTransform,
  TransformKeyframes,
  Keyframe,
  KeyframeEasing,
  TransitionFamily,
  TransitionDescriptor,
  TransitionRef,
  SequenceTransition,
  SourceRef,
} from '@classytic/vixel-schema';

export {
  defineComposition,
  BUILTIN_EFFECTS,
  BUILTIN_TRANSITIONS,
  normalizeSpec,
  frameToPx,
  visualTrackEndSec,
  totalDurationSec,
  sourceUrl,
  isVideoSource,
  ENTRANCE_DEFAULTS,
  entranceMotionVec,
  isSlide,
  loopAt,
  TEXT_LOOP_PERIOD,
  BUILTIN_TEXT_ANIMATIONS,
  textDesignToFlatStyle,
} from '@classytic/vixel-schema';
