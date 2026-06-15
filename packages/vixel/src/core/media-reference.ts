/**
 * Media references — decouple the edit from the asset.
 * ====================================================
 * The reference *types* (`MediaReference`, `SourceRef`, …) and the `isMediaReference`
 * guard live in the shared contract `@classytic/vixel-schema`; this module
 * re-exports them and keeps the ffmpeg-side resolution helpers. A clip's `source`
 * may be a plain path/URL string or an explicit reference: `external`,
 * `generator` (synthetic lavfi source), or `missing` (offline asset).
 */

import { ConfigError } from '../errors.js';
import { assertSafeColor } from './color.js';
import type {
  GeneratorReference,
  MediaReference,
  SourceRef,
} from '@classytic/vixel-schema';
import { isMediaReference } from '@classytic/vixel-schema';

// Re-export the contract types + guard so existing `./media-reference.js`
// imports keep working unchanged.
export type {
  GeneratorKind,
  ExternalReference,
  GeneratorReference,
  MissingReference,
  MediaReference,
  SourceRef,
} from '@classytic/vixel-schema';
export { isMediaReference } from '@classytic/vixel-schema';

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
      return `color=c=${assertSafeColor(ref.params?.color ?? 'black')}:s=${s}:d=${d}`;
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
