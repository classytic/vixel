/**
 * Effect / transition PACKS — the BYO (bring-your-own) unit.
 * =========================================================
 * A pack is a MANIFEST: a list of effect + transition descriptors (pure DATA) whose
 * `source` / `asset` / `gl.shader` point at files on a CDN. {@link registerPack}
 * merges them into the catalogs the renderers + editor read — so a community dev
 * ships a pack (a JSON manifest + GLSL/`.cube`/asset files) with **zero engine
 * code**. This is the gl-transitions / DaVinci-DCTL / CapCut-pack model: the
 * renderers implement ONE generic executor per {@link EffectKind} (filter / lut /
 * overlay / shader), and everything else is data.
 *
 * The static {@link BUILTIN_EFFECTS}/{@link BUILTIN_TRANSITIONS} arrays remain the
 * core catalog the per-renderer coverage tests pin; packs are dynamic additions
 * resolved by the generic kind-executors (no per-id resolver needed).
 */
import { BUILTIN_EFFECTS, type EffectDescriptor } from './effects/index.js';
import { BUILTIN_TRANSITIONS, type TransitionDescriptor } from './transitions.js';
import type { TransitionRef } from './transitions.js';
import { validateShaderDescriptor } from './shader-wrap.js';
import { transitionGap } from './visual.js';
import { listTemplates } from './templates.js';
import { listThemes } from './theme.js';
import type { VixelSpec } from './spec.js';

/** A registrable bundle of effects + transitions. `baseUrl` is the pack's CDN root. */
export interface EffectPack {
  id: string;
  name: string;
  version?: string;
  author?: string;
  /** Prepended to each descriptor's RELATIVE `source`/`asset` (absolute URLs pass through). */
  baseUrl?: string;
  effects?: EffectDescriptor[];
  transitions?: TransitionDescriptor[];
}

const EFFECTS = new Map<string, EffectDescriptor>(BUILTIN_EFFECTS.map((e) => [e.id, e]));
const TRANSITIONS = new Map<string, TransitionDescriptor>(BUILTIN_TRANSITIONS.map((t) => [t.id, t]));
const PACKS = new Map<string, EffectPack>();

/** Resolve a descriptor `source` against the pack base (absolute/`data:`/root-relative pass through). */
function resolveSource(baseUrl: string | undefined, src: string | undefined): string | undefined {
  if (!src || !baseUrl || /^(?:[a-z]+:|\/\/|\/)/i.test(src)) return src;
  return `${baseUrl.replace(/\/$/, '')}/${src.replace(/^\.?\//, '')}`;
}

/**
 * Register a BYO pack — MERGES its descriptors into the catalogs, resolving each
 * `source`/`asset`/`overlay`/`sound` URL against `baseUrl`. Re-registering the same
 * pack id replaces it. A descriptor id collision MERGES field-by-field (pack fields
 * win), so a partial entry can augment a built-in — e.g. `{ id: 'zoom-punch', sound }`
 * attaches a sound to the stock transition without redefining its gl/ffmpeg/etc.
 */
export function registerPack(pack: EffectPack): void {
  PACKS.set(pack.id, pack);
  for (const e of pack.effects ?? []) {
    const source = resolveSource(pack.baseUrl, e.source ?? e.asset);
    const merged = { ...EFFECTS.get(e.id), ...e, ...(source ? { source } : {}) };
    // BYO shaders: surface authoring mistakes loudly (non-fatal) so a bad pack entry
    // doesn't just silently fail to render later.
    for (const err of validateShaderDescriptor(merged)) console.warn(`[vixel pack:${pack.id}] ${err}`);
    EFFECTS.set(e.id, merged);
  }
  for (const t of pack.transitions ?? []) {
    const overlay = t.overlay ? { ...t.overlay, source: resolveSource(pack.baseUrl, t.overlay.source) ?? t.overlay.source } : undefined;
    const sound = t.sound ? { ...t.sound, source: resolveSource(pack.baseUrl, t.sound.source) ?? t.sound.source } : undefined;
    TRANSITIONS.set(t.id, { ...TRANSITIONS.get(t.id), ...t, ...(overlay ? { overlay } : {}), ...(sound ? { sound } : {}) });
  }
}

// BYO overlay textures forwarded by id — overlays render IN-BROWSER, so the headless
// export page needs them injected where the descriptor isn't registered; hence a
// register fn (registry wins over descriptor). Sounds need NO such fn: they're muxed
// in the host process from the descriptor (carried on the pack), so a merge-pack
// (see registerPack) is the whole story.
const OVERLAY_SOURCES = new Map<string, string>();

/** Register (or override) a transition's overlay-texture URL by transition id. */
export function registerTransitionOverlay(id: string, source: string): void {
  OVERLAY_SOURCES.set(id, source);
}

/** Resolve a transition's overlay-texture URL: registered → descriptor. */
export function getTransitionOverlay(id: string): string | undefined {
  return OVERLAY_SOURCES.get(id) ?? getTransition(id)?.overlay?.source;
}

/** A transition SFX placed on the OUTPUT timeline (deduped from the spec). */
export interface TransitionSoundCue {
  /** Audio URL (whoosh/impact). */
  source: string;
  /** Gain in dB (default 0). */
  gain?: number;
  /** Absolute time on the output timeline where the cut lands. */
  at: number;
}

/**
 * Every transition SFX a spec triggers, timed to the CUT on the output timeline.
 * Walks each sequential lane accumulating clip output-starts (durations minus
 * prior overlaps); a transition between i,i+1 cuts at clip i+1's start. ONE shared
 * resolver so the live preview (vidra AudioEngine), the headless-Pixi export, and
 * the ffmpeg engine all place the sound identically. The sound is carried on the
 * transition descriptor ({@link getTransition}, pack-supplied + baseUrl-resolved).
 */
export function collectTransitionSounds(spec: VixelSpec): TransitionSoundCue[] {
  const out: TransitionSoundCue[] = [];
  for (const track of spec.tracks ?? []) {
    if (track.type !== 'visual') continue;
    const clips = track.clips ?? [];
    // Key transitions by their resolved GAP index (handles id- or index-based `between`).
    const ov = new Map<number, TransitionRef>();
    for (const t of track.transitions ?? []) {
      const gap = transitionGap(track, t);
      if (gap !== undefined) ov.set(gap, t.transition);
    }
    let start = 0;
    for (let i = 0; i < clips.length; i++) {
      if (i > 0) start += (clips[i - 1].duration ?? 0) - (ov.get(i - 1)?.duration ?? 0);
      const tr = ov.get(i);
      if (!tr) continue;
      const snd = getTransition(tr.id)?.sound;
      if (!snd?.source) continue;
      const at = start + (clips[i].duration ?? 0) - (tr.duration ?? 0); // = clip i+1 output start
      out.push({ source: snd.source, gain: snd.gain, at: Math.max(0, at) });
    }
  }
  return out;
}

/**
 * Register a spec's SELF-CONTAINED packs ({@link VixelSpec.packs}) — call on load,
 * before rendering, so inline custom shaders/transitions a project (or an agent)
 * carries resolve like any registered pack. Idempotent per pack id.
 */
export function registerSpecPacks(spec: VixelSpec): void {
  for (const pack of spec.packs ?? []) registerPack(pack);
}

/** Look up an effect descriptor (built-in or pack) by id. */
export function getEffect(id: string): EffectDescriptor | undefined {
  return EFFECTS.get(id);
}

/** Every effect descriptor — built-ins + registered packs (the editor's browse list). */
export function listEffects(): EffectDescriptor[] {
  return [...EFFECTS.values()];
}

/**
 * The two browser surfaces, INCLUDING registered packs (a host's BYO pixi-filters /
 * LUT pack appears here once registered) — unlike the static {@link BUILTIN_FILTERS}
 * arrays. `surface !== 'effect'` ⇒ a colour-grade Filter. Call these from the editor
 * panels so opt-in packs show up.
 */
export function listFilters(): EffectDescriptor[] {
  return [...EFFECTS.values()].filter((e) => e.surface !== 'effect');
}
/** FX/stylize layer catalog — built-ins + registered packs (the "Effects" panel). */
export function listVisualEffects(): EffectDescriptor[] {
  return [...EFFECTS.values()].filter((e) => e.surface === 'effect');
}

/** Look up a transition descriptor (built-in or pack) by id. */
export function getTransition(id: string): TransitionDescriptor | undefined {
  return TRANSITIONS.get(id);
}

/** Every transition descriptor — built-ins + registered packs. */
export function listTransitions(): TransitionDescriptor[] {
  return [...TRANSITIONS.values()];
}

/** Registered packs (for an editor's "installed packs" view). */
export function listPacks(): EffectPack[] {
  return [...PACKS.values()];
}

const line = (id: string, name: string, group: string | undefined, description: string | undefined): string =>
  `- \`${id}\` — ${name}${group ? ` (${group})` : ''}${description ? `: ${description}` : ''}`;

/**
 * A compact Markdown catalog of the live vocabulary — filters, effects, and
 * transitions (built-ins + registered packs) — for an LLM's context. The agent then
 * picks by MEANING (the {@link EffectDescriptor.description description} fields) from
 * the EXACT set of valid ids, instead of inferring from ids/families and emitting an
 * unknown id that the engine silently skips ({@link parseSpec} would otherwise have
 * to reject). Pair with `@classytic/vixel-schema/validate`'s `parseSpec` for a
 * generate→validate→retry loop. Grouped by surface/family; reflects packs live.
 *
 * @example
 * ```ts
 * const prompt = `Choose from these transitions:\n${describeCatalog().transitions}`;
 * ```
 */
export function describeCatalog(): {
  filters: string;
  effects: string;
  transitions: string;
  templates: string;
  themes: string;
  full: string;
} {
  const filters = listFilters()
    .map((e) => line(e.id, e.name, e.category, e.description))
    .join('\n');
  const effects = listVisualEffects()
    .map((e) => line(e.id, e.name, e.category, e.description))
    .join('\n');
  const transitions = listTransitions()
    .map((t) => line(t.id, t.name, t.family, t.description))
    .join('\n');
  const templates = listTemplates()
    .map((t) => line(t.id, t.name, t.category ?? t.aspect, t.description))
    .join('\n');
  const themes = listThemes()
    .map((t) => line(t.id, t.name, undefined, t.description))
    .join('\n');
  const full =
    `## Filters (color grades — one per clip)\n${filters}\n\n` +
    `## Effects (stackable FX layers)\n${effects}\n\n` +
    `## Transitions (between adjacent clips)\n${transitions}\n\n` +
    `## Templates (one-shot scene layouts — fill the slots after)\n${templates}\n\n` +
    `## Themes (palette + type — pass the id as \`theme\`)\n${themes}`;
  return { filters, effects, transitions, templates, themes, full };
}
