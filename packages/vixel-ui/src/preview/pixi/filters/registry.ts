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
import { buildShaderFilter, isInlineGlsl, getShaderSource, isAnimatedShaderEffect, getBakeTime } from './shader.js';
import { composeNodeFilters, disposeEffectFilters } from '../node.js';

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
      const src = d.source && isInlineGlsl(d.source) ? d.source : getShaderSource(e.id);
      if (src) {
        try {
          out.push(buildShaderFilter(PIXI, src, e.params));
        } catch {
          /* a malformed BYO shader must not crash the preview — skip it */
        }
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

/** Rebuild Pixi filters only when the effect list changed. Destroys the outgoing
 *  per-node filters (the leak the audit flagged: reassigning `.filters` never frees
 *  them) before building the new set, then recomposes with the BoxStyle shadow. */
export function updateFilters(PIXI: Pixi, node: RetainedNode, effects: readonly EffectRef[] | undefined): void {
  const sig = effectsSig(effects);
  if (node.effectsSig === sig) return;
  node.effectsSig = sig;
  disposeEffectFilters(node); // free the outgoing effect filters (skip shared LUT)
  node.effectFilters = buildPixiFilters(PIXI, effects) ?? undefined;
  composeNodeFilters(node);
}
