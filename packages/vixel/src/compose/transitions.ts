/**
 * Transition resolver registry — the ffmpeg side of the transition catalog.
 * =========================================================================
 * The catalog itself is DATA in the schema ({@link BUILTIN_TRANSITIONS} — id,
 * name, family, `ffmpeg.xfade`, `gl.shader`). This module owns only the
 * RESOLVER: id → concrete `xfade` name, seeded from the catalog, extensible via
 * {@link registerTransition} (BYO). A GL/shader tier is a later capability
 * (ARCHITECTURE.md P6). One source of truth — no parallel preset table.
 */
import { BUILTIN_TRANSITIONS } from '@classytic/vixel-schema';

/** Builds an `xfade` name (the fast/native tier) for a transition id + params. */
export type TransitionResolver = (params?: Record<string, number | string | boolean>) => string;

const REGISTRY = new Map<string, TransitionResolver>(
  BUILTIN_TRANSITIONS.filter((d) => d.ffmpeg?.xfade).map((d) => [d.id, () => d.ffmpeg!.xfade!] as const),
);

/** Register a BYO transition's ffmpeg `xfade` resolver, keyed by descriptor id. */
export function registerTransition(id: string, build: TransitionResolver): void {
  REGISTRY.set(id, build);
}

/**
 * Resolve a transition id → concrete `xfade` name. Registry (BUILTIN + BYO)
 * first, then a raw passthrough (so a literal `xfade` name still works); `none`
 * → benign `fade` (the overlap is already a hard cut at the plan level).
 */
export function resolveTransitionXfade(id: string, params?: Record<string, number | string | boolean>): string {
  if (id === 'none') return 'fade';
  const r = REGISTRY.get(id);
  return r ? r(params) : id;
}
