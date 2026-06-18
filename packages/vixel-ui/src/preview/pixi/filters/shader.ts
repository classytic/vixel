/**
 * Animated `shader`-kind effect support for the Pixi preview — the browser mirror
 * of the engine's libplacebo hook. Owns the live animated-shader filter set, the
 * URL-sourced GLSL cache, and the per-frame bake context (export inlines `uTime`
 * as a literal so a GPU-less server's SwiftShader accepts the program). The clip
 * reconcilers + the effect registry pull the build/tick helpers from here.
 */
import type * as PIXINS from 'pixi.js';
import type { VixelSpec, EffectRef } from '@classytic/vixel-schema';
import { getEffect, wrapEffectFragment, VIXEL_FILTER_VERT } from '@classytic/vixel-schema';
import { isVisualTrack } from '../../../shared/utils/spec.js';
import type { Pixi } from '../types.js';

// Active shader filters whose `uTime` is advanced each frame by renderScene — so
// animated BYO shaders (a pack uses `uTime`) move. Bounded; rebuilds re-add.
const animatedShaderFilters = new Set<PIXINS.Filter>();

// HOST-registered filters (e.g. a pixi-filters pack the app wires via
// registerPixiEffect) that animate off a property — `.time` / `.seed` etc. — keyed
// to the playhead. The builder opts a filter in via {@link trackAnimatedFilter}; the
// SAME per-frame tick that drives `uTime` calls its setter with the current time, so
// host filters animate deterministically (and in export) with zero core coupling to
// pixi-filters. Untracked when the filter is disposed (see {@link untrackShaderFilter}).
const animatedSetters = new Map<PIXINS.Filter, (timeSec: number) => void>();

/**
 * Drive a host filter's time-like property from the playhead. Returns the filter
 * (so a builder can `return trackAnimatedFilter(f, t => { f.time = t; })`). The
 * shared render tick calls `set(timeSec)` each frame; deterministic → exportable.
 */
export function trackAnimatedFilter(filter: PIXINS.Filter, set: (timeSec: number) => void): PIXINS.Filter {
  if (animatedSetters.size > 256) animatedSetters.clear();
  animatedSetters.set(filter, set);
  return filter;
}

// Per-frame bake context: when non-null (export on a GPU-less server), animated
// shaders inline `uTime` as a literal instead of a uniform (no interface block →
// SwiftShader-safe), at the cost of a per-frame filter rebuild. Set by renderScene.
let bakeTimeSec: number | null = null;

/** Set the per-frame bake context (null = live preview, uniform-mode). */
export function setBakeTime(sec: number | null): void {
  bakeTimeSec = sec;
}

/** Read the per-frame bake context (null = live preview). */
export function getBakeTime(): number | null {
  return bakeTimeSec;
}

// `shader`-kind effect id → its GLSL source, when the descriptor's `source` is a
// URL (fetched by {@link loadShaders}). Inline GLSL is used directly.
const shaderSourceCache = new Map<string, string>();
export const isInlineGlsl = (src: string): boolean => /\bvixelEffect\b/.test(src);

/** Lookup a preloaded (URL-sourced) shader GLSL by effect id. */
export function getShaderSource(id: string): string | undefined {
  return shaderSourceCache.get(id);
}

/** Every effect id referenced across the spec — per-clip `effects` + `effect`-clip media. */
export function collectEffectIds(spec: VixelSpec): Set<string> {
  const ids = new Set<string>();
  for (const t of spec.tracks) {
    if (!isVisualTrack(t)) continue;
    for (const clip of t.clips) {
      for (const e of clip.effects ?? []) ids.add(e.id);
      if (clip.media.kind === 'effect') ids.add(clip.media.effect.id);
    }
  }
  return ids;
}

/** Does this effect resolve to a shader that animates via `uTime`? (for cache busting) */
export function isAnimatedShaderEffect(e: EffectRef): boolean {
  const d = getEffect(e.id);
  if (d?.kind !== 'shader') return false;
  const src = d.source && isInlineGlsl(d.source) ? d.source : shaderSourceCache.get(e.id);
  return !!src && /\buTime\b/.test(src);
}

/** Stop ticking a filter (call before destroying it, so a freed filter isn't kept
 *  alive by the animated sets). Covers both `uTime` shaders and host setter-filters. */
export function untrackShaderFilter(f: PIXINS.Filter): void {
  animatedShaderFilters.delete(f);
  animatedSetters.delete(f);
}

/** Advance the playhead clock on every live animated filter: `uTime` on uniform-mode
 *  shaders + the host setter on registered filters (pixi-filters `.time`/`.seed`). */
export function tickShaderTime(timeSec: number): void {
  for (const f of animatedShaderFilters) {
    const u = (f.resources as Record<string, { uniforms?: Record<string, number> }>).vixelUniforms?.uniforms;
    if (u) u.uTime = timeSec;
  }
  for (const set of animatedSetters.values()) {
    try {
      set(timeSec);
    } catch {
      /* a host filter setter must never break the render loop */
    }
  }
}

/**
 * Build a Pixi {@link PIXINS.Filter} from a `shader`-kind effect written in the
 * CANONICAL vixel convention — a pack ships only `vec4 vixelEffect(vec2 uv)` that
 * reads pixels via `vixelSample(uv)`, with an optional animated `uTime`. We wrap it
 * into a Pixi fragment here and into an mpv hook on the engine (libplacebo) → ONE
 * shader, both renderers. Params bind via `{{name}}` token substitution.
 */
export function buildShaderFilter(PIXI: Pixi, source: string, params: Record<string, number | string | boolean> | undefined): PIXINS.Filter {
  const { fragment, usesTimeUniform } = wrapEffectFragment(source, {
    params,
    ...(bakeTimeSec !== null ? { bakeTime: bakeTimeSec } : {}),
  });
  const filter = new PIXI.Filter({
    glProgram: PIXI.GlProgram.from({ vertex: VIXEL_FILTER_VERT, fragment, name: 'vixel-shader' }),
    ...(usesTimeUniform ? { resources: { vixelUniforms: { uTime: { value: 0, type: 'f32' } } } } : {}),
  });
  if (usesTimeUniform) {
    if (animatedShaderFilters.size > 128) animatedShaderFilters.clear();
    animatedShaderFilters.add(filter);
  }
  return filter;
}

/** Preload URL-sourced `shader`-kind effects (fetch the GLSL once). Inline source is skipped. */
export async function loadShaders(spec: VixelSpec): Promise<void> {
  await Promise.all(
    [...collectEffectIds(spec)].map(async (id) => {
      if (shaderSourceCache.has(id)) return;
      const d = getEffect(id);
      if (d?.kind !== 'shader' || !d.source || isInlineGlsl(d.source)) return;
      try {
        shaderSourceCache.set(id, await (await fetch(d.source)).text());
      } catch {
        /* shader unavailable — effect just doesn't apply in the preview */
      }
    }),
  );
}
