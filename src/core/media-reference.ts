/**
 * Media references — decouple the edit from the asset.
 * ====================================================
 * A clip's `source` may be a plain path/URL string (the shorthand) or an
 * explicit {@link MediaReference}: `external` (relocatable / proxy-swappable),
 * `generator` (a synthetic source — solid colour, test pattern), or `missing`
 * (an offline / unresolved asset an editor can still save). OTIO's separation of
 * MediaReference from the clip is what makes a timeline portable; vixel mirrors
 * it, minimally. See DESIGN.md, "Schema discipline".
 */

import { ConfigError } from '../errors.js';

/** Synthetic sources vixel can generate (lavfi-backed). */
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

/** A `source` field accepts a string shorthand (external file/URL) or a typed reference. */
export type SourceRef = string | MediaReference;

export function isMediaReference(x: unknown): x is MediaReference {
  return typeof x === 'object' && x !== null && 'kind' in x;
}

/**
 * Resolve a source to a concrete file path/URL. Strings and `external` resolve
 * directly; `missing` and `generator` throw (a generator must be materialized
 * first via `generateSource` — compose does not inline generators).
 */
export function resolveToPath(source: SourceRef): string {
  if (typeof source === 'string') return source;
  switch (source.kind) {
    case 'external':
      return source.url;
    case 'missing':
      throw new ConfigError(`source is marked missing${source.hint ? `: ${source.hint}` : ''}`, {
        context: { kind: 'missing' },
      });
    case 'generator':
      throw new ConfigError(
        `generator source "${source.generator}" must be materialized first (generateSource) — compose does not inline generators`,
        { context: { generator: source.generator } },
      );
  }
}

/** Build the lavfi descriptor string for a generator at the given size/duration. */
export function lavfiDescriptor(
  ref: GeneratorReference,
  dims: { width: number; height: number; durationSec: number },
): string {
  const s = `${dims.width}x${dims.height}`;
  const d = Number(dims.durationSec.toFixed(3));
  switch (ref.generator) {
    case 'color':
      return `color=c=${ref.params?.color ?? 'black'}:s=${s}:d=${d}`;
    case 'testsrc':
      return `testsrc2=s=${s}:d=${d}`;
    case 'smptebars':
      return `smptebars=s=${s}:d=${d}`;
  }
}

/** ffmpeg input args for a source: a file `-i`, or a `-f lavfi -i <desc>` for a generator. */
export function mediaInputArgs(
  source: SourceRef,
  dims: { width: number; height: number; durationSec: number },
): { input: string; options: string[] } {
  if (isMediaReference(source) && source.kind === 'generator') {
    return { input: lavfiDescriptor(source, dims), options: ['-f', 'lavfi'] };
  }
  return { input: resolveToPath(source), options: [] };
}
