/**
 * Pixi resolvers for the engine's `filter`-kind effects — the browser mirror of
 * the vixel engine's ffmpeg `REGISTRY`. Keyed by the SAME `BUILTIN_EFFECTS` id so
 * the two renderers can't drift: {@link PIXI_EFFECT_IDS} is the set this map
 * covers, and `effect-parity.test.ts` asserts it spans every catalog effect not
 * declared `unsupported: ['pixi']`. BYO effects register via {@link registerPixiEffect}.
 */
import type * as PIXINS from 'pixi.js';
import type { EffectRef } from '@classytic/vixel-schema';
import { getEffect } from '@classytic/vixel-schema';
import type { Pixi, RetainedNode } from '../types.js';
import { FILTER_VERT, lutFilterCache } from './lut.js';
import { buildShaderFilter, buildMultiPassFilter, isInlineGlsl, getShaderSource, isAnimatedShaderEffect, getBakeTime, getEffectTexture, type ShaderFilter } from './shader.js';
import { composeNodeFilters, disposeEffectFilters } from '../node.js';

// Last construction error per `shader`-kind effect id (cleared when it builds) — so
// an editor can surface "this BYO shader failed" instead of it silently not applying.
const shaderErrors = new Map<string, string>();
/** The last build error for a `shader`-kind effect id, if any (editor surfacing). */
export function getShaderError(id: string): string | undefined {
  return shaderErrors.get(id);
}

type PixiEffectBuilder = (PIXI: Pixi, params: Record<string, number | string | boolean> | undefined) => PIXINS.Filter;

const amt = (params: Record<string, number | string | boolean> | undefined, k: string, d: number): number => {
  const v = params?.[k];
  return typeof v === 'number' ? v : d;
};

const PIXI_EFFECT_BUILDERS = new Map<string, PixiEffectBuilder>([
  ['grayscale', (PIXI) => { const f = new PIXI.ColorMatrixFilter(); f.desaturate(); return f; }],
  ['sepia', (PIXI) => { const f = new PIXI.ColorMatrixFilter(); f.sepia(false); return f; }],
  ['invert', (PIXI) => { const f = new PIXI.ColorMatrixFilter(); f.negative(false); return f; }],
  ['brightness', (PIXI, p) => { const f = new PIXI.ColorMatrixFilter(); f.brightness(1 + amt(p, 'amount', 0), false); return f; }],
  ['contrast', (PIXI, p) => { const f = new PIXI.ColorMatrixFilter(); f.contrast(amt(p, 'amount', 1) - 1, false); return f; }],
  ['saturation', (PIXI, p) => { const f = new PIXI.ColorMatrixFilter(); f.saturate(amt(p, 'amount', 1) - 1, false); return f; }],
  ['blur', (PIXI, p) => new PIXI.BlurFilter({ strength: amt(p, 'amount', 8) })],
  // warm/cool: scale R/B channels via a direct color matrix (scale-only → offset
  // convention-independent), mirroring the engine's `colorbalance`.
  ['warm', (PIXI, p) => { const a = amt(p, 'amount', 0.5); const f = new PIXI.ColorMatrixFilter(); f.matrix = [1 + 0.18 * a, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 - 0.18 * a, 0, 0, 0, 0, 0, 1, 0]; return f; }],
  ['cool', (PIXI, p) => { const a = amt(p, 'amount', 0.5); const f = new PIXI.ColorMatrixFilter(); f.matrix = [1 - 0.18 * a, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 + 0.18 * a, 0, 0, 0, 0, 0, 1, 0]; return f; }],
  ['hue', (PIXI, p) => { const f = new PIXI.ColorMatrixFilter(); f.hue(amt(p, 'degrees', 30), false); return f; }],
  // vignette: a radial edge-darkening pass — the preview mirror of ffmpeg's
  // `vignette`. A tiny self-contained fragment (the same FILTER_VERT the shader-kind
  // path uses), so it needs no params and no neighbor sampling.
  ['vignette', (PIXI) => new PIXI.Filter({
    glProgram: PIXI.GlProgram.from({
      vertex: FILTER_VERT,
      fragment: `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  float d = distance(vTextureCoord, vec2(0.5));
  float vig = smoothstep(0.78, 0.28, d);
  finalColor = vec4(c.rgb * (0.32 + 0.68 * vig), c.a);
}`,
      name: 'vixel-vignette',
    }),
  })],
  // vintage: a faded, warm-shadowed cast — approximates ffmpeg's `curves` vintage
  // preset with one color matrix (warm lift + slight desaturation + reduced blue).
  // Not pixel-exact to the engine, but the same look (preview ≈ export).
  ['vintage', (PIXI) => {
    const f = new PIXI.ColorMatrixFilter();
    f.matrix = [
      0.90, 0.10, 0.08, 0, 0.02,
      0.05, 0.85, 0.05, 0, 0.01,
      0.05, 0.10, 0.70, 0, 0.00,
      0, 0, 0, 1, 0,
    ];
    return f;
  }],
]);

/** The effect ids the Pixi preview can render — checked against the catalog in tests. */
export const PIXI_EFFECT_IDS: readonly string[] = [...PIXI_EFFECT_BUILDERS.keys()];

/** Register a BYO Pixi effect resolver (mirrors the engine's `registerEffect`). */
export function registerPixiEffect(id: string, build: PixiEffectBuilder): void {
  PIXI_EFFECT_BUILDERS.set(id, build);
}

export function buildPixiFilters(PIXI: Pixi, effects: readonly EffectRef[] | undefined): PIXINS.Filter[] | null {
  if (!effects || effects.length === 0) return null;
  const out: PIXINS.Filter[] = [];
  for (const e of effects) {
    const build = PIXI_EFFECT_BUILDERS.get(e.id);
    if (build) {
      out.push(build(PIXI, e.params));
      continue;
    }
    // `lut`-kind PACK effect → its preloaded LUT filter (mirrors ffmpeg `lut3d`).
    const lut = lutFilterCache.get(e.id);
    if (lut && getEffect(e.id)?.kind === 'lut') {
      out.push(lut);
      continue;
    }
    // `shader`-kind PACK effect → a GLSL filter. Source is inline GLSL or a URL
    // pre-fetched by loadShaders.
    const d = getEffect(e.id);
    if (d?.kind === 'shader') {
      try {
        let f: ShaderFilter | undefined;
        if (d.passes?.length) {
          // MULTI-PASS — ping-ponged sub-filters (bloom/blur/glow). Inline pass sources.
          f = buildMultiPassFilter(PIXI, d.passes.map((p) => p.source), e.params, d.params);
        } else {
          // SINGLE-PASS — source is inline GLSL or a URL pre-fetched by loadShaders.
          const src = d.source && isInlineGlsl(d.source) ? d.source : getShaderSource(e.id);
          if (src) f = buildShaderFilter(PIXI, src, e.params, d.params);
        }
        if (f) {
          f.__vixelEffectId = e.id; // lets updateFilters match it back to the EffectRef
          out.push(f);
          shaderErrors.delete(e.id);
        }
      } catch (err) {
        // a malformed BYO shader must not crash the preview — skip it, but record why
        shaderErrors.set(e.id, err instanceof Error ? err.message : String(err));
      }
    }
  }
  return out.length ? out : null;
}

export function effectsSig(effects: readonly EffectRef[] | undefined): string {
  if (!effects || !effects.length) return '';
  let sig = JSON.stringify(effects.map((e) => [e.id, e.params]));
  const bakeTimeSec = getBakeTime();
  if (bakeTimeSec !== null && effects.some(isAnimatedShaderEffect)) sig += `|t${bakeTimeSec}`;
  return sig;
}

/**
 * The PROGRAM signature — what forces a GLSL RECOMPILE. For a `shader`-kind effect
 * in LIVE mode, the number/color/boolean params bind as uniforms, so they're EXCLUDED
 * here (only enum / `bind:'literal'` params change the program); everything else (and
 * all params in bake/export mode) is structural. Splitting this from {@link liveParamsSig}
 * is what lets a slider drag update a uniform instead of recompiling.
 */
function programSig(effects: readonly EffectRef[] | undefined): string {
  if (!effects || !effects.length) return '';
  const baking = getBakeTime() !== null;
  let sig = JSON.stringify(
    effects.map((e) => {
      const d = getEffect(e.id);
      if (!baking && d?.kind === 'shader') {
        const structural: Record<string, unknown> = {};
        for (const p of d.params ?? []) {
          // enum/literal change the GLSL → rebuild. number/color/boolean are live
          // uniforms (excluded). A texture-input keys on [url, loaded?] so the filter
          // rebuilds both when the URL swaps AND once the image finishes loading
          // (first build binds the white fallback; the load flips `loaded` → rebind).
          if (p.type === 'enum' || p.bind === 'literal') {
            structural[p.name] = e.params?.[p.name];
          } else if (p.type === 'texture') {
            const url = e.params?.[p.name] ?? p.default;
            structural[p.name] = [url, typeof url === 'string' ? !!getEffectTexture(url) : false];
          }
        }
        return [e.id, structural];
      }
      return [e.id, e.params];
    }),
  );
  const bakeTimeSec = getBakeTime();
  if (bakeTimeSec !== null && effects.some(isAnimatedShaderEffect)) sig += `|t${bakeTimeSec}`;
  return sig;
}

/** The LIVE-param signature — the number/color/boolean values of `shader` effects.
 *  Changes here update uniforms in place (no recompile). */
function liveParamsSig(effects: readonly EffectRef[] | undefined): string {
  if (!effects || !effects.length) return '';
  return JSON.stringify(
    effects.filter((e) => getEffect(e.id)?.kind === 'shader').map((e) => [e.id, e.params]),
  );
}

/** Push current param values into existing shader filters' live uniforms (no rebuild). */
function syncShaderParams(filters: PIXINS.Filter[] | undefined, effects: readonly EffectRef[] | undefined): void {
  if (!filters) return;
  for (const f of filters) {
    const set = (f as ShaderFilter).__vixelSetParams;
    if (!set) continue;
    const id = (f as ShaderFilter).__vixelEffectId;
    set(effects?.find((e) => e.id === id)?.params);
  }
}

/** Rebuild Pixi filters only when the PROGRAM changed (id/structure/enum/bake); a
 *  live param-value change (number/color/boolean on a shader) updates uniforms in
 *  place — no GLSL recompile. Destroys outgoing filters before rebuilding (the leak
 *  the audit flagged: reassigning `.filters` never frees them), recomposes shadow. */
export function updateFilters(PIXI: Pixi, node: RetainedNode, effects: readonly EffectRef[] | undefined): void {
  const sig = programSig(effects);
  if (node.effectsSig !== sig) {
    node.effectsSig = sig;
    disposeEffectFilters(node); // free the outgoing effect filters (skip shared LUT)
    node.effectFilters = buildPixiFilters(PIXI, effects) ?? undefined;
    composeNodeFilters(node);
    node.liveSig = liveParamsSig(effects); // built filters already hold current values
    return;
  }
  const live = liveParamsSig(effects);
  if (node.liveSig !== live) {
    node.liveSig = live;
    syncShaderParams(node.effectFilters, effects);
  }
}
