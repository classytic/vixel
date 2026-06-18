/**
 * Effect resolution — the engine side of the effects catalog.
 * ==========================================================
 * The spec carries only an {@link EffectRef} (`{ id, params }`); this module owns
 * the RESOLVERS that turn `filter`-kind effects into ffmpeg filter strings.
 * Built-ins mirror the `BUILTIN_EFFECTS` catalog in `@classytic/vixel-schema`.
 * `overlay`/`body` kinds are composited elsewhere (they are not plain filter
 * strings) and are skipped here. BYO effects register a resolver via
 * {@link registerEffect} — the descriptor (contract) lives with the catalog;
 * the resolver (ffmpeg) lives here.
 */
import { getEffect, type EffectRef } from '@classytic/vixel-schema';
import { libplaceboShaderFilter } from '../compose/shader-adapter.js';

/** A filter-kind resolver: params → an ffmpeg filter string (no leading comma). */
export type EffectResolver = (params: Record<string, number | string | boolean>) => string;

const num = (
  params: Record<string, number | string | boolean> | undefined,
  key: string,
  fallback: number,
): number => {
  const v = params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

const REGISTRY = new Map<string, EffectResolver>([
  ['grayscale', () => 'hue=s=0'],
  ['sepia', () => 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'],
  ['invert', () => 'negate'],
  ['blur', (p) => `gblur=sigma=${num(p, 'amount', 8)}`],
  ['brightness', (p) => `eq=brightness=${num(p, 'amount', 0)}`],
  ['contrast', (p) => `eq=contrast=${num(p, 'amount', 1)}`],
  ['saturation', (p) => `eq=saturation=${num(p, 'amount', 1)}`],
  ['vignette', () => 'vignette'],
  // warm/cool: push red up & blue down (or vice-versa), scaled by `amount` 0..1.
  ['warm', (p) => { const a = num(p, 'amount', 0.5); return `colorbalance=rs=${(0.3 * a).toFixed(3)}:rm=${(0.15 * a).toFixed(3)}:bs=${(-0.3 * a).toFixed(3)}:bm=${(-0.15 * a).toFixed(3)}`; }],
  ['cool', (p) => { const a = num(p, 'amount', 0.5); return `colorbalance=rs=${(-0.3 * a).toFixed(3)}:rm=${(-0.15 * a).toFixed(3)}:bs=${(0.3 * a).toFixed(3)}:bm=${(0.15 * a).toFixed(3)}`; }],
  ['hue', (p) => `hue=h=${num(p, 'degrees', 30)}`],
  ['grain', (p) => `noise=alls=${Math.round(num(p, 'amount', 16))}:allf=t`],
  ['sharpen', (p) => `unsharp=5:5:${num(p, 'amount', 1)}:5:5:0`],
  ['vintage', () => 'curves=preset=vintage'],
]);

/** Register a BYO filter-kind effect resolver (keyed by descriptor id). */
export function registerEffect(id: string, build: EffectResolver): void {
  REGISTRY.set(id, build);
}

/** Is there a filter-kind resolver for this effect id? */
export function hasEffect(id: string): boolean {
  return REGISTRY.has(id);
}

/**
 * Build the comma-PREFIXED ffmpeg filter chain for a clip/overlay's filter-kind
 * effects, applied in order. Unknown ids (or overlay/body-kind effects without a
 * filter resolver) are skipped. Returns '' when there is nothing to apply, so it
 * can be spliced directly into an existing filter chain.
 */
export function buildEffectsFilter(
  effects: readonly EffectRef[] | undefined,
  shaderPaths?: ReadonlyMap<string, string>,
): string {
  if (!effects || effects.length === 0) return '';
  const parts: string[] = [];
  for (const e of effects) {
    const resolver = REGISTRY.get(e.id);
    if (resolver) {
      parts.push(resolver(e.params ?? {}));
      continue;
    }
    // Generic KIND executors for pack effects (descriptor-driven, no per-id
    // resolver) — this is how a dropped-in pack renders with zero engine code:
    //  - `lut`    → ffmpeg `lut3d` over the descriptor's `.cube` source.
    //  - `shader` → libplacebo over a pre-written hook file (path via `shaderPaths`).
    // (`overlay` composites as a separate blended input, not a filter-chain string.)
    const d = getEffect(e.id);
    // lut3d file path: forward slashes + DOUBLE-escape the `:` (the Windows
    // drive-letter colon survives ffmpeg's two-level filtergraph parse only as
    // `\\:` — a single `\:` or quotes both fail to parse).
    if (d?.kind === 'lut' && d.source) {
      parts.push(`lut3d=file=${d.source.replace(/\\/g, '/').replace(/:/g, '\\\\:')}`);
    } else if (d?.kind === 'shader') {
      const hookPath = shaderPaths?.get(e.id);
      if (hookPath) parts.push(libplaceboShaderFilter(hookPath));
    }
  }
  return parts.length ? `,${parts.join(',')}` : '';
}
