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
  Anchor,
  Fit,
  Clip,
  OverlayBase,
  TextOverlay,
  PositionKeyframe,
  ImageOverlay,
  Overlay,
  AudioRole,
  DuckSpec,
  AudioItem,
  VideoTrack,
  OverlayTrack,
  AudioTrack,
  Track,
  VixelSpec,
} from '@classytic/vixel-schema';

export { defineComposition } from '@classytic/vixel-schema';
