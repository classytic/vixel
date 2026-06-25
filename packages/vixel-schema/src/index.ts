/**
 * @classytic/vixel-schema — the VixelSpec composition contract.
 * ============================================================
 * The single, zero-dependency source of truth for the JSON an agent emits, an
 * editor (vixel-ui) edits, and the engine (vixel) renders. No ffmpeg, no React.
 * The engine and editor both depend on THIS, so the contract never drifts and the
 * frontend never pulls the engine.
 *
 * Organized into cohesive modules (this file is the public barrel — import names
 * stay stable). Core ideas: media-reference separation (OTIO), a UNIFIED
 * {@link VisualTransform} on every visual element, registry-backed
 * {@link EffectDescriptor effects} + {@link TransitionDescriptor transitions}
 * (data here, resolvers in the engine), and `normalizeSpec` as the one
 * legacy→unified upgrade path. See ARCHITECTURE.md.
 */

export * from './media.js';
export * from './captions.js';
export * from './caption-cues.js';
export * from './caption-styles.js';
export * from './text-presets.js';
export * from './keyframes.js';
export * from './keyframe-channels.js';
export * from './motion-feel.js';
export * from './random.js';
export * from './mask.js';
export * from './transform.js';
export * from './layout.js';
export * from './animation.js';
export * from './entrance.js';
export * from './text-animation.js';
export * from './motion.js';
export * from './text-motion.js';
export * from './text-design.js';
export * from './text-svg.js';
export * from './effects/index.js';
export * from './transitions.js';
export * from './transition-sources.js';
export * from './shader-wrap.js';
export * from './pack.js';
export * from './shape.js';
export * from './shape-presets.js';
export * from './theme.js';
export * from './visual.js';
export * from './audio.js';
export * from './audio-mix.js';
export * from './track.js';
export * from './spec.js';
export * from './ids.js';
export * from './link.js';
export * from './marker.js';
export * from './timeline.js';
export * from './ripple.js';
export * from './transcript.js';
export * from './edit.js';
export * from './commands.js';
export * from './normalize.js';
export * from './templates.js';
