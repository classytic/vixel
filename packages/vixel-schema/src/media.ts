/**
 * Media references — decouple the EDIT from the ASSET (OTIO-style).
 * A `source` is a string shorthand (file/URL) or a typed {@link MediaReference}.
 */

/** Synthetic sources the engine can generate (lavfi-backed). */
export type GeneratorKind = 'color' | 'testsrc' | 'smptebars';

export interface ExternalReference {
  kind: 'external';
  url: string;
}
export interface GeneratorReference {
  kind: 'generator';
  generator: GeneratorKind;
  /** e.g. `{ color: '#101820' }` for the `color` generator. */
  params?: { color?: string };
}
export interface MissingReference {
  kind: 'missing';
  hint?: string;
}
export type MediaReference = ExternalReference | GeneratorReference | MissingReference;

/** A `source` accepts a string shorthand (external file/URL) or a typed reference. */
export type SourceRef = string | MediaReference;

/** Type guard: is this source a typed {@link MediaReference} (vs a string)? */
export function isMediaReference(x: unknown): x is MediaReference {
  return typeof x === 'object' && x !== null && 'kind' in x;
}
