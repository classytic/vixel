/**
 * Effects — the registry CONTRACT (types only; the catalogs live in sibling files).
 * ============================================================================
 * Descriptors are pure, introspectable DATA (drive auto-generated editor UI + agent
 * selection); the ffmpeg/compositing RESOLVER lives in the engine (`@classytic/vixel`),
 * keyed by `id`. A spec only ever carries an {@link EffectRef} ({id, params}).
 * Transitions follow the same pattern — see ../transitions.
 *
 * HOW THE LIBRARY SCALES (the answer to "are we blocked with simple effects?" — no):
 * every {@link EffectKind} has ONE generic executor per renderer, so the catalog
 * grows as DATA (a descriptor + a `source`), NOT code — the model CapCut / Resolve /
 * gl-transitions use to ship hundreds:
 *   - add a colour GRADE  → a `lut` descriptor pointing at a `.cube` (film looks).
 *   - add a stylise FX    → a `shader` descriptor with a GLSL fragment (glitch, CRT…).
 *   - add a texture look  → an `overlay` descriptor (light-leak / film-burn footage).
 *   - tune a built-in     → a `filter` descriptor (ColorMatrix / ffmpeg primitive).
 * Only `filter` needs renderer code; lut/shader/overlay are pure data through the
 * shared executors. BYO packs register at runtime via `registerEffect`/`registerPack`.
 */

/**
 * How an effect renders — its EXECUTION KIND. Each kind has ONE generic executor
 * per renderer (see the file header):
 *  - `filter`  — a parametric built-in (ffmpeg filter / Pixi ColorMatrix). No source.
 *  - `lut`     — a 3D color LUT; `source` = a `.cube` URL (ffmpeg `lut3d` / Pixi LUT).
 *  - `overlay` — a transparent/blend asset; `source` = a video/PNG URL (composited).
 *  - `shader`  — a GLSL fragment shader (gl-transitions/DCTL model); `source` = the
 *                shader URL (or inline GLSL). Runs in Pixi (WebGL) + ffmpeg.
 *  - `body`    — a subject-masked effect (reserved).
 */
export type EffectKind = 'filter' | 'lut' | 'overlay' | 'shader' | 'body';

/**
 * The two compositors a `filter`-kind effect can resolve on: the ffmpeg engine
 * (server export) and the Pixi preview (editor + in-browser export). Listed in an
 * {@link EffectDescriptor.unsupported} array when a renderer has no mapping yet —
 * the single source of truth a coverage test in each renderer enforces, so a new
 * effect can't silently render in one place but not the other.
 */
export type EffectRenderer = 'ffmpeg' | 'pixi';

export type EffectParamType = 'number' | 'color' | 'boolean' | 'enum';

/** A typed, introspectable parameter — drives auto-generated editor UI (effects + transitions). */
export interface EffectParam {
  name: string;
  type: EffectParamType;
  label?: string;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Allowed values for `enum` params. */
  options?: string[];
  unit?: string;
}

/**
 * A registrable effect's CONTRACT — pure data, introspectable by agents + the
 * editor. The resolver lives in the engine, keyed by `id`; the spec never carries
 * a resolver.
 */
export interface EffectDescriptor {
  id: string;
  name: string;
  kind: EffectKind;
  /**
   * One-line, agent-facing semantics: what the look DOES and when to reach for it
   * (e.g. "warm golden-hour grade for nostalgic / lifestyle footage"). Drives
   * {@link describeCatalog} so an LLM picks by MEANING, not by guessing from the id.
   * Optional + additive — pure data, no engine impact.
   */
  description?: string;
  params?: EffectParam[];
  /**
   * The kind's RESOURCE (external URL): a `.cube` for `lut`, a transparent video/PNG
   * for `overlay`, a GLSL file for `shader`. Relative to the pack's `baseUrl` when
   * registered via a pack. `filter` kinds have no source. Never bundled.
   */
  source?: string;
  /** @deprecated alias of {@link source} for `overlay`/`body` assets. */
  asset?: string;
  blend?: 'normal' | 'screen' | 'multiply' | 'overlay' | 'soft-light' | 'add';
  /**
   * Renderers that DON'T yet implement this `filter` effect (default: supported
   * everywhere). Each renderer's coverage test treats this as the allow-list of
   * gaps — so adding an effect without a resolver fails the build unless the gap
   * is declared here on purpose.
   */
  unsupported?: readonly EffectRenderer[];
  /**
   * Which PRIMITIVE this descriptor is presented as — its UX surface, independent
   * of {@link EffectKind} (how it executes). CapCut/Resolve split these into two
   * distinct panels and so do we:
   *  - `filter` — a color LOOK (grade): black-&-white, warm, vintage, a `.cube` LUT.
   *    Conceptually "one look per clip."
   *  - `effect` — a stylize/FX layer: vignette, blur, grain, glitch, light-leak
   *    overlays. Stackable, often animated.
   * Both still resolve through the SAME engine effect resolver (keyed by `id`) —
   * the split is taxonomy, not a second execution path. Defaults to `filter`.
   */
  surface?: 'filter' | 'effect';
  /**
   * Coarse grouping for the BROWSER within a surface (e.g. 'Basic' | 'Light' |
   * 'Color' | 'Stylize') — presentation metadata, mirroring {@link TransitionFamily}.
   */
  category?: string;
  /**
   * Editor preview hint for the gallery swatch. `css` is a CSS-`filter` string that
   * APPROXIMATES the effect on a sample frame (the engine still renders the real
   * effect; this only drives the thumbnail). `overlay` keys a non-filter look the
   * editor draws over the sample (vignette / warm / cool / grain).
   */
  preview?: { css?: string; overlay?: 'vignette' | 'warm' | 'cool' | 'grain' };
}

/** What a spec (and an agent) emits: a reference to an effect by id + param values. */
export interface EffectRef {
  id: string;
  params?: Record<string, number | string | boolean>;
}

/**
 * Collect a param list's `default`s into a ready-to-apply value map. ONE source of
 * truth for "what values does applying this effect/transition use" — so the editor
 * applies the descriptor's intended look (not an empty `{}` that leaves the renderer
 * on its own neutral fallback). Works for any {@link EffectParam}[] (effects AND
 * transitions). Params without a `default` are omitted.
 */
export function defaultParams(
  params: EffectParam[] | undefined,
): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of params ?? []) if (p.default !== undefined) out[p.name] = p.default;
  return out;
}
