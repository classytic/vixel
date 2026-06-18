/**
 * Effects — public barrel. The CONTRACT (types + `defaultParams`) lives in
 * ./contract; the catalog is split by SURFACE into ./filters (colour grades) and
 * ./fx (stylize/FX layers), so the library scales by editing the right file — never
 * one giant array. `BUILTIN_EFFECTS` is the full vocabulary the engine resolves over.
 */
export * from './contract.js';
export { FILTER_EFFECTS } from './filters.js';
export { FX_EFFECTS } from './fx.js';

import type { EffectDescriptor } from './contract.js';
import { FILTER_EFFECTS } from './filters.js';
import { FX_EFFECTS } from './fx.js';

/**
 * Built-in effect catalog — the vocabulary an agent can emit. Resolvers for these
 * ids ship in the engine; effect ASSETS (`lut`/`overlay`/`shader` sources) are
 * external URLs, never bundled. Only effects the engine actually renders are listed.
 */
export const BUILTIN_EFFECTS: EffectDescriptor[] = [...FILTER_EFFECTS, ...FX_EFFECTS];

/**
 * The two PRIMITIVE catalogs, derived from {@link BUILTIN_EFFECTS} by {@link
 * EffectDescriptor.surface} (NOT by source file — `surface` is authoritative, so a
 * descriptor placed in the "wrong" file still lands in the right panel). The engine
 * keeps ONE resolver over `BUILTIN_EFFECTS`; these split the same descriptors into
 * the two browser surfaces clients render as distinct panels (CapCut "Filters" vs
 * "Effects"). A descriptor with no `surface` counts as a filter.
 */
export const BUILTIN_FILTERS: EffectDescriptor[] = BUILTIN_EFFECTS.filter((e) => e.surface !== 'effect');
/** FX/stylize layer catalog (vignette, blur, grain, …) — the "Effects" panel. */
export const BUILTIN_VISUAL_EFFECTS: EffectDescriptor[] = BUILTIN_EFFECTS.filter((e) => e.surface === 'effect');
