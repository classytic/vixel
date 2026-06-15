/**
 * Colour validation — keep user colours out of the filtergraph grammar.
 * =====================================================================
 * Colours flow into ffmpeg filter strings (`color=c=…`, `pad=…:color=…`). A
 * value containing `:` `,` `'` `[` `]` `\` could inject filter options or chain
 * filters. We accept only a hex form or a plain named colour (optionally with an
 * `@alpha` suffix) and reject anything else — never silently swap.
 */

import { ConfigError } from '../errors.js';

// #RRGGBB / 0xRRGGBB / RRGGBB (optional 8-digit alpha) OR a named colour
// (letters only, 1–24 chars) with an optional `@0.5` alpha.
const SAFE_COLOR = /^(?:(?:#|0x)?[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|[a-zA-Z]{1,24}(?:@[0-9.]+)?)$/;

/** Return the colour unchanged if filtergraph-safe, else throw a ConfigError. */
export function assertSafeColor(value: string, field = 'color'): string {
  if (!SAFE_COLOR.test(value)) {
    throw new ConfigError(
      `unsafe ${field} value ${JSON.stringify(value)} — expected hex (#RRGGBB) or a named colour`,
      { context: { field, value } },
    );
  }
  return value;
}
