/**
 * Remote ingest — fetch an http(s) URL to a local temp file, safely.
 *
 * SSRF-guarded, byte-capped, timeout-bounded. Consumed by `Source.fromUrl`.
 */

export {
  fetchToFile,
  type FetchToFileOptions,
  type FetchResult,
} from './fetch-remote.js';
export {
  assertSafeUrl,
  assertHostResolvesPublic,
  isPrivateOrReservedIp,
  isIpLiteral,
  type LookupFn,
} from './url-guard.js';
