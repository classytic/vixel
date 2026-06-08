/**
 * fetchToFile — unit tests (no real network; injected fetch).
 *
 * Verifies the byte cap, HTTP-error handling, redirect re-validation (SSRF on
 * 302), and that a successful download lands the exact bytes on disk. Uses
 * public IP-literal URLs so the DNS-resolution guard is skipped (kept offline).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { fetchToFile } from '../src/ingest/fetch-remote.js';
import { isConfigError } from '../src/errors.js';

const PUBLIC = 'http://93.184.216.34/clip.mp4'; // IP literal → no DNS lookup

/** A fetch stub that returns scripted responses keyed by request URL. */
function scriptedFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    return route();
  }) as unknown as typeof fetch;
}

describe('fetchToFile', () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((p) => unlink(p).catch(() => {})));
  });

  it('downloads the body to a temp file and reports bytes + content-type', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const res = await fetchToFile(PUBLIC, {
      fetchImpl: scriptedFetch({
        [PUBLIC]: () => new Response(payload, { headers: { 'content-type': 'video/mp4' } }),
      }),
    });
    cleanup.push(res.path);

    expect(res.bytes).toBe(8);
    expect(res.contentType).toBe('video/mp4');
    expect(res.path).toMatch(/\.mp4$/);
    expect(new Uint8Array(await readFile(res.path))).toEqual(payload);
  });

  it('aborts + removes the file when the body exceeds maxBytes', async () => {
    const big = new Uint8Array(1000);
    await expect(
      fetchToFile(PUBLIC, {
        maxBytes: 100,
        fetchImpl: scriptedFetch({ [PUBLIC]: () => new Response(big) }),
      }),
    ).rejects.toSatisfy((e: unknown) => isConfigError(e) && (e as { code: string }).code === 'INVALID_INPUT');
  });

  it('rejects a non-2xx response as INGEST_FAILED', async () => {
    await expect(
      fetchToFile(PUBLIC, {
        fetchImpl: scriptedFetch({ [PUBLIC]: () => new Response(null, { status: 404 }) }),
      }),
    ).rejects.toSatisfy((e: unknown) => isConfigError(e) && (e as { code: string }).code === 'INGEST_FAILED');
  });

  it('follows a redirect to another public host', async () => {
    const next = 'http://8.8.8.8/final.mp4';
    const res = await fetchToFile(PUBLIC, {
      fetchImpl: scriptedFetch({
        [PUBLIC]: () => new Response(null, { status: 302, headers: { location: next } }),
        [next]: () => new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'video/mp4' } }),
      }),
    });
    cleanup.push(res.path);
    expect(res.bytes).toBe(2);
  });

  it('blocks a redirect that points at a private address (SSRF on 302)', async () => {
    await expect(
      fetchToFile(PUBLIC, {
        fetchImpl: scriptedFetch({
          [PUBLIC]: () =>
            new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/meta' } }),
        }),
      }),
    ).rejects.toSatisfy(isConfigError);
  });

  it('accepts a body exactly at the maxBytes boundary', async () => {
    const exact = new Uint8Array(100);
    const res = await fetchToFile(PUBLIC, {
      maxBytes: 100,
      fetchImpl: scriptedFetch({ [PUBLIC]: () => new Response(exact) }),
    });
    cleanup.push(res.path);
    expect(res.bytes).toBe(100);
  });

  it('follows a relative redirect (resolved against the base)', async () => {
    const abs = 'http://93.184.216.34/next.mp4';
    const res = await fetchToFile(PUBLIC, {
      fetchImpl: scriptedFetch({
        [PUBLIC]: () => new Response(null, { status: 302, headers: { location: '/next.mp4' } }),
        [abs]: () => new Response(new Uint8Array([7]), { headers: { 'content-type': 'video/mp4' } }),
      }),
    });
    cleanup.push(res.path);
    expect(res.bytes).toBe(1);
  });

  it('rejects a redirect loop past the hop limit', async () => {
    const loop = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://8.8.8.8/again.mp4' },
      })) as unknown as typeof fetch;
    await expect(fetchToFile(PUBLIC, { fetchImpl: loop })).rejects.toSatisfy(
      (e: unknown) => isConfigError(e) && (e as { code: string }).code === 'INGEST_FAILED',
    );
  });

  it('refuses an unsafe URL before any fetch', async () => {
    let fetched = false;
    const spy = (async () => {
      fetched = true;
      return new Response(null);
    }) as unknown as typeof fetch;
    await expect(fetchToFile('http://127.0.0.1/x', { fetchImpl: spy })).rejects.toSatisfy(isConfigError);
    expect(fetched).toBe(false);
  });
});
