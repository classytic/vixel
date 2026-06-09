/**
 * Schema versioning — durable, forward-compatible specs.
 * ======================================================
 * A `VixelSpec` is an interchange document: an editor saves it, an agent emits
 * it, and it must survive across vixel versions. OTIO earns its longevity with
 * per-schema versions + registered upgrade functions; vixel versions the whole
 * document (it's one doc, not independently-interchanged objects) and migrates
 * an older spec forward before rendering.
 *
 * See DESIGN.md, "Schema discipline".
 */

/** The schema version this build of vixel emits and renders. */
export const CURRENT_SPEC_VERSION = 1;

/** An upgrade from version `N` to `N+1` — a pure transform on the raw object. */
export type SpecUpgrade = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered upgrades, keyed by the version they upgrade FROM. Empty at v1 — the
 * machinery exists so that when v2 lands, `{ 1: (s) => …raise to 2… }` is the
 * only addition and every old document keeps loading.
 */
export const SPEC_UPGRADES: Readonly<Record<number, SpecUpgrade>> = {};

/**
 * Bring a raw spec object up to {@link CURRENT_SPEC_VERSION} by applying upgrades
 * in sequence. Throws on a missing/invalid version or one newer than this build
 * understands. Pass `upgrades` to test the chain in isolation.
 */
export function migrateSpec(
  raw: Record<string, unknown>,
  upgrades: Readonly<Record<number, SpecUpgrade>> = SPEC_UPGRADES,
): Record<string, unknown> {
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`spec is missing a valid integer "version" (got ${JSON.stringify(version)})`);
  }
  if (version > CURRENT_SPEC_VERSION) {
    throw new Error(
      `spec version ${version} is newer than this vixel build understands (${CURRENT_SPEC_VERSION}) — upgrade @classytic/vixel`,
    );
  }

  let doc = raw;
  for (let v = version; v < CURRENT_SPEC_VERSION; v++) {
    const up = upgrades[v];
    if (!up) throw new Error(`no upgrade registered from spec version ${v}`);
    doc = { ...up(doc), version: v + 1 };
  }
  return doc;
}
