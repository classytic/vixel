/**
 * Remote fetch → local temp file.
 * ==============================
 * Downloads an http(s) URL to a temp file with three production safeguards the
 * naive `fetch().then(writeFile)` lacks:
 *  - **SSRF guard** on the URL and on every redirect hop ({@link assertSafeUrl}
 *    + DNS re-validation), so a 302 can't smuggle a request to an internal host.
 *  - **Byte cap** — streams the body and aborts the moment it exceeds `maxBytes`,
 *    so a hostile/huge source can't fill the disk.
 *  - **Timeout + cancellation** — an overall deadline plus the caller's signal.
 *
 * Returns the temp path; the caller owns its lifetime (delete when done). On any
 * failure the partial file is removed.
 */

import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ConfigError, ErrorCode, VixelError, isAbortError, toVixelError } from '../errors.js';
import { assertSafeUrl, assertHostResolvesPublic, type LookupFn } from './url-guard.js';

export interface FetchToFileOptions {
  /** Max bytes to download before aborting. Default 500 MB. */
  maxBytes?: number;
  /** Overall deadline in ms. Default 60_000. */
  timeoutMs?: number;
  /** Caller cancellation. */
  signal?: AbortSignal;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable DNS lookup (tests). */
  lookupFn?: LookupFn;
}

export interface FetchResult {
  /** Local temp file the bytes were written to. Caller owns cleanup. */
  path: string;
  /** Total bytes written. */
  bytes: number;
  /** Response `content-type` (may be empty). */
  contentType: string;
}

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const KNOWN_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi', 'mpg', 'mpeg', 'm4a', 'mp3', 'wav', 'aac']);

/** Pick a safe file extension — only from a known-media allow-list, else from
 *  content-type, else `.bin`. Never trusts an arbitrary path token (a `…/x.exe`
 *  path can't yield a `.exe` temp file). ffprobe sniffs content, not extension. */
function extFor(url: URL, contentType: string): string {
  const fromPath = /\.([a-z0-9]{1,5})(?:$|[?#])/i.exec(url.pathname)?.[1]?.toLowerCase();
  if (fromPath && KNOWN_EXTS.has(fromPath)) return `.${fromPath}`;
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('webm')) return '.webm';
  if (contentType.includes('quicktime')) return '.mov';
  return '.bin';
}

/** Remove any `user:pass@` credentials so a redirect can't forward them. */
function stripUserinfo(url: URL): URL {
  if (url.username || url.password) {
    url.username = '';
    url.password = '';
  }
  return url;
}

export async function fetchToFile(urlStr: string, opts: FetchToFileOptions = {}): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  // Combine the caller's signal with our timeout into one controller (avoids
  // relying on AbortSignal.any, which is newer than our Node floor).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort();
    else opts.signal.addEventListener('abort', () => ctl.abort(), { once: true });
  }

  try {
    // Resolve + follow redirects manually, re-validating each hop.
    let current = stripUserinfo(assertSafeUrl(urlStr));
    let response!: Response;
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECTS) {
        throw new ConfigError('Too many redirects', {
          code: ErrorCode.INGEST_FAILED,
          context: { url: urlStr, max: MAX_REDIRECTS },
        });
      }
      await assertHostResolvesPublic(current, opts.lookupFn);
      response = await fetchImpl(current, { redirect: 'manual', signal: ctl.signal });
      if (REDIRECT_CODES.has(response.status)) {
        const loc = response.headers.get('location');
        if (!loc) break;
        // Re-validate the redirect target (SSRF) and drop any forwarded creds.
        current = stripUserinfo(assertSafeUrl(new URL(loc, current).toString()));
        continue;
      }
      break;
    }

    if (!response.ok) {
      throw new ConfigError(`Fetch failed: HTTP ${response.status}`, {
        code: ErrorCode.INGEST_FAILED,
        context: { status: response.status, url: current.toString() },
      });
    }
    if (!response.body) {
      throw new ConfigError('Empty response body', {
        code: ErrorCode.INGEST_FAILED,
        context: { url: current.toString() },
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    const path = join(tmpdir(), `vixel-ingest-${randomBytes(8).toString('hex')}${extFor(current, contentType)}`);
    const file = createWriteStream(path);
    let bytes = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new ConfigError(`Remote file exceeds maxBytes (${maxBytes})`, {
            code: ErrorCode.INVALID_INPUT,
            context: { maxBytes, bytesSoFar: bytes, url: current.toString() },
            hint: 'Raise `maxBytes` or pick a smaller source.',
          });
        }
        if (!file.write(value)) await once(file, 'drain');
      }
      file.end();
      await once(file, 'finish');
    } catch (err) {
      file.destroy();
      await unlink(path).catch(() => {});
      throw err;
    }
    return { path, bytes, contentType };
  } catch (err) {
    // Normalise: our errors + aborts pass through; everything else (network
    // failures, DNS, TypeErrors from fetch) becomes a tidy INGEST_FAILED.
    if (err instanceof VixelError) throw err;
    const normalized = toVixelError(err);
    if (isAbortError(normalized)) throw normalized;
    throw new ConfigError(`Ingest failed for ${urlStr}`, {
      code: ErrorCode.INGEST_FAILED,
      cause: err,
      context: { url: urlStr },
    });
  } finally {
    clearTimeout(timer);
  }
}
