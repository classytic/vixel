/**
 * Animated `shader`-kind effect support for the Pixi preview — the browser mirror
 * of the engine's libplacebo hook. Owns the live animated-shader filter set, the
 * URL-sourced GLSL cache, and the per-frame bake context (export inlines `uTime`
 * as a literal so a GPU-less server's SwiftShader accepts the program). The clip
 * reconcilers + the effect registry pull the build/tick helpers from here.
 */
import type * as PIXINS from 'pixi.js';
import type { VixelSpec, EffectRef, EffectParam } from '@classytic/vixel-schema';
import { getEffect, wrapEffectFragment, VIXEL_FILTER_VERT, isHexColor, hexToRgb01 } from '@classytic/vixel-schema';
import { isVisualTrack } from '../../../shared/utils/spec.js';
import type { Pixi } from '../types.js';

/** A shader filter carrying a live-param updater, so the registry can poke its
 *  uniforms on a value change WITHOUT recompiling the GLSL program. */
export interface ShaderFilter extends PIXINS.Filter {
  /** Update the live (number/color/boolean) param uniforms in place. No-op in bake mode. */
  __vixelSetParams?: (params: Record<string, number | string | boolean> | undefined) => void;
  /** The effect id this filter was built for (so the registry matches it to an EffectRef). */
  __vixelEffectId?: string;
}

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
  if (d.passes?.length) return d.passes.some((p) => /\buTime\b/.test(p.source));
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

/** A built pass filter + the metadata the caller needs (animation / original-input). */
interface BuiltPass {
  filter: ShaderFilter;
  usesTime: boolean;
  usesOriginal: boolean;
}

/**
 * Build ONE pass filter (pure — no global registration) from a `vixelEffect` source.
 * Binds live param uniforms + texture inputs + (when referenced) a `uOriginal`
 * placeholder the multi-pass wrapper rebinds to the clip's original input each frame.
 * Shared by the single-pass {@link buildShaderFilter} and {@link buildMultiPassFilter}.
 */
function buildPassFilter(
  PIXI: Pixi,
  source: string,
  params: Record<string, number | string | boolean> | undefined,
  paramDefs: readonly EffectParam[] | undefined,
): BuiltPass {
  // Export (GPU-less SwiftShader) bakes everything to literals; live preview binds
  // number/color/boolean params as typed uniforms so slider drags don't recompile.
  const baking = bakeTimeSec !== null;
  const { fragment, usesTimeUniform, uniforms, textures, usesOriginal } = wrapEffectFragment(source, {
    params,
    paramDefs,
    bakeParams: baking,
    ...(baking ? { bakeTime: bakeTimeSec! } : {}),
  });
  const resources: Record<string, unknown> = {};
  if (usesTimeUniform) resources.vixelUniforms = { uTime: { value: 0, type: 'f32' } };
  if (uniforms.length) {
    const grp: Record<string, { value: unknown; type: string }> = {};
    for (const u of uniforms) {
      grp[u.name] = { value: u.type === 'vec3<f32>' ? new Float32Array(u.value as number[]) : (u.value as number), type: u.type };
    }
    resources.vixelParams = grp;
  }
  // BYO texture INPUTS: bind each declared sampler to its loaded source (white 1×1
  // fallback so an unloaded/missing input still leaves a valid, compilable program).
  for (const t of textures) {
    const tex = t.url ? getEffectTexture(t.url) : undefined;
    resources[t.name] = (tex ?? PIXI.Texture.WHITE).source;
  }
  // Multi-pass composite passes read the ORIGINAL clip via `vixelOriginal` — bind a
  // placeholder now; the wrapper overwrites `uOriginal` with the real input per frame.
  if (usesOriginal) resources.uOriginal = PIXI.Texture.WHITE.source;
  const filter = new PIXI.Filter({
    glProgram: PIXI.GlProgram.from({ vertex: VIXEL_FILTER_VERT, fragment, name: 'vixel-shader' }),
    ...(Object.keys(resources).length ? { resources } : {}),
  }) as ShaderFilter;
  if (uniforms.length) {
    // Live updater: convert + write each param uniform in place (reassign so Pixi's
    // UniformGroup flags itself dirty). Unknown/absent values keep the current value.
    filter.__vixelSetParams = (p) => {
      const u = (filter.resources as Record<string, { uniforms?: Record<string, unknown> }>).vixelParams?.uniforms;
      if (!u) return;
      for (const spec of uniforms) {
        const v = p?.[spec.name];
        if (spec.type === 'f32') {
          if (typeof v === 'number') u[spec.name] = v;
          else if (typeof v === 'boolean') u[spec.name] = v ? 1 : 0;
        } else if (spec.type === 'vec3<f32>' && isHexColor(v)) {
          u[spec.name] = new Float32Array(hexToRgb01(v));
        }
      }
    };
  }
  return { filter, usesTime: usesTimeUniform, usesOriginal };
}

/**
 * Build a Pixi {@link PIXINS.Filter} from a single-pass `shader`-kind effect written
 * in the CANONICAL vixel convention — `vec4 vixelEffect(vec2 uv)` reading pixels via
 * `vixelSample(uv)`, optional `uTime`. We wrap it here and into an mpv hook on the
 * engine (libplacebo) → ONE shader, both renderers.
 */
export function buildShaderFilter(
  PIXI: Pixi,
  source: string,
  params: Record<string, number | string | boolean> | undefined,
  paramDefs?: readonly EffectParam[],
): ShaderFilter {
  const { filter, usesTime } = buildPassFilter(PIXI, source, params, paramDefs);
  if (usesTime) {
    if (animatedShaderFilters.size > 128) animatedShaderFilters.clear();
    animatedShaderFilters.add(filter);
  }
  return filter;
}

/**
 * Build a MULTI-PASS `shader` filter — each pass ping-pongs through a render target
 * (the BlurFilter pattern: nested `.apply` + a TexturePool temp). Pass 0 reads the
 * clip input; later passes read the previous pass via `vixelSample` and the original
 * via `vixelOriginal`; the final pass writes the output. uTime + live params fan out
 * to every sub-pass; the wrapper owns sub-filter disposal.
 */
export function buildMultiPassFilter(
  PIXI: Pixi,
  passSources: readonly string[],
  params: Record<string, number | string | boolean> | undefined,
  paramDefs?: readonly EffectParam[],
): ShaderFilter {
  const subs = passSources.map((src) => buildPassFilter(PIXI, src, params, paramDefs));
  const TexturePool = PIXI.TexturePool;
  const PASSTHROUGH = `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main() { finalColor = texture(uTexture, vTextureCoord); }`;

  class VixelMultiPass extends PIXI.Filter {
    apply(filterManager: PIXINS.FilterSystem, input: PIXINS.Texture, output: PIXINS.RenderSurface, clearMode: boolean): void {
      let src = input;
      for (let i = 0; i < subs.length; i++) {
        const isLast = i === subs.length - 1;
        // composite passes sample the ORIGINAL clip (not the previous pass)
        if (subs[i].usesOriginal) (subs[i].filter.resources as Record<string, unknown>).uOriginal = input.source;
        const dest = isLast ? output : TexturePool.getSameSizeTexture(input);
        subs[i].filter.apply(filterManager, src, dest, isLast ? clearMode : true);
        if (i > 0) TexturePool.returnTexture(src as PIXINS.Texture); // src was a temp (never the original input)
        src = dest as PIXINS.Texture;
      }
    }
    destroy(): void {
      for (const s of subs) {
        untrackShaderFilter(s.filter);
        s.filter.destroy();
      }
      super.destroy();
    }
  }

  const wrapper = new VixelMultiPass({
    glProgram: PIXI.GlProgram.from({ vertex: VIXEL_FILTER_VERT, fragment: PASSTHROUGH, name: 'vixel-multipass' }),
    resources: {},
  }) as ShaderFilter;
  wrapper.__vixelSetParams = (p) => {
    for (const s of subs) s.filter.__vixelSetParams?.(p);
  };
  if (subs.some((s) => s.usesTime)) {
    trackAnimatedFilter(wrapper, (t) => {
      for (const s of subs) {
        const u = (s.filter.resources as Record<string, { uniforms?: Record<string, number> }>).vixelUniforms?.uniforms;
        if (u) u.uTime = t;
      }
    });
  }
  return wrapper;
}

// `texture`-param INPUT url → loaded Pixi Texture (displacement/gradient/image maps
// a BYO shader samples). Preloaded by {@link loadEffectTextures} so buildShaderFilter
// can bind synchronously during reconcile.
const effectTextureCache = new Map<string, PIXINS.Texture>();

/** A preloaded effect-input texture by URL (see {@link loadEffectTextures}). */
export function getEffectTexture(url: string): PIXINS.Texture | undefined {
  return effectTextureCache.get(url);
}

/** Walk a spec's `shader` effects, resolving every `texture`-param URL (ref value →
 *  param default). ONE place so the preloader, the executor, AND the preview's asset
 *  key agree on what to load (so applying a texture effect re-triggers the preload). */
export function collectEffectTextureUrls(spec: VixelSpec): Set<string> {
  const urls = new Set<string>();
  const addRef = (e: EffectRef) => {
    const d = getEffect(e.id);
    if (d?.kind !== 'shader') return;
    for (const p of d.params ?? []) {
      if (p.type !== 'texture') continue;
      const v = e.params?.[p.name] ?? p.default;
      if (typeof v === 'string' && v) urls.add(v);
    }
  };
  for (const t of spec.tracks) {
    if (!isVisualTrack(t)) continue;
    for (const clip of t.clips) {
      for (const e of clip.effects ?? []) addRef(e);
      if (clip.media.kind === 'effect') addRef(clip.media.effect);
    }
  }
  return urls;
}

/** Load an image element with CORS enabled — robust for extension-less / query-string
 *  URLs where `Assets.load` mis-detects the loader (the media cache uses the same trick). */
function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Preload every `texture`-param input image a spec's shaders need (once each). Call
 *  alongside {@link loadShaders} before rendering so the samplers bind synchronously. */
export async function loadEffectTextures(PIXI: Pixi, spec: VixelSpec): Promise<void> {
  await Promise.all(
    [...collectEffectTextureUrls(spec)].map(async (url) => {
      if (effectTextureCache.has(url)) return;
      try {
        effectTextureCache.set(url, PIXI.Texture.from(await loadImageEl(url)));
      } catch {
        /* texture unavailable — the executor falls back to a white 1×1 (effect still compiles) */
      }
    }),
  );
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
