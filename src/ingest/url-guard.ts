/**
 * SSRF protection for remote ingest.
 * =================================
 * Fetching a user/agent-supplied URL is a classic SSRF vector: a request to
 * `http://169.254.169.254/…` (cloud metadata) or `http://10.0.0.5/…` (internal
 * service) can exfiltrate credentials or hit private infrastructure. These
 * guards ensure a remote {@link Source} can only reach **public** http(s)
 * addresses.
 *
 * Two layers, because a hostname can lie:
 *  1. {@link assertSafeUrl} — synchronous: protocol allow-list + reject
 *     IP-literal hosts in private/reserved ranges. Runs before any network I/O.
 *  2. {@link assertHostResolvesPublic} — async: resolve a *domain* host and
 *     reject if ANY resolved address is private (defeats `evil.com → 10.0.0.5`).
 *
 * Both run again on every redirect hop, since a 302 can point anywhere.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { ConfigError, ErrorCode } from '../errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** DNS lookup surface (injectable for tests). Mirrors `dns/promises.lookup`. */
export type LookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

/** True if `host` is an IPv4/IPv6 literal rather than a domain name. */
export function isIpLiteral(host: string): boolean {
  const h = stripBrackets(host);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
}

function stripBrackets(host: string): string {
  return host.replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * Extract the embedded IPv4 from an IPv6 form that carries one — IPv4-mapped
 * (`::ffff:a.b.c.d` / `::ffff:0a00:0005` hex) and the deprecated IPv4-compatible
 * (`::a.b.c.d`). Returns null when there is no embedded IPv4. Hex groups are
 * decoded so the dotted-vs-hex spelling can't bypass the classifier.
 */
function embeddedIpv4(addr: string): string | null {
  // Dotted-quad tail on a `::`-prefixed address: ::ffff:1.2.3.4 or ::1.2.3.4
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (dotted) return dotted[1]!;
  // Hex form: ::ffff:HHHH:HHHH (mapped) or ::HHHH:HHHH (compatible)
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

/**
 * True if an IP literal falls in a private, loopback, link-local, CGNAT,
 * reserved, test, or IPv6-transition range — i.e. NOT safe to fetch from.
 * Malformed input is treated as unsafe (fail closed).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const addr = stripBrackets(ip).toLowerCase().replace(/%.+$/, ''); // drop zone id

  // ---- IPv6 ----
  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true; // loopback / unspecified
    if (addr.startsWith('fe80')) return true; // link-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local fc00::/7
    if (addr.startsWith('64:ff9b')) return true; // NAT64 translation prefix — never a direct target
    if (addr.startsWith('2002:')) return true; // 6to4 — embeds an un-vetted IPv4; reject wholesale
    const v4 = embeddedIpv4(addr); // IPv4-mapped / -compatible → classify the embedded v4
    if (v4) return isPrivateOrReservedIp(v4);
    return false; // other global-unicast v6 → public
  }

  // ---- IPv4 ----
  const octets = addr.split('.').map((s) => Number(s));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → unsafe
  }
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240/4 reserved + 255.255.255.255 broadcast
  return false;
}

/**
 * Synchronously validate a URL is safe to fetch: http(s) only and not an
 * IP-literal pointing at a private/reserved address. Returns the parsed `URL`.
 *
 * @throws ConfigError `INVALID_INPUT` / `UNSUPPORTED` on any violation.
 */
export function assertSafeUrl(urlStr: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new ConfigError(`Invalid URL: ${urlStr}`, {
      code: ErrorCode.INVALID_INPUT,
      hint: 'Provide an absolute http(s) URL.',
    });
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new ConfigError(`Unsupported URL protocol: ${url.protocol}`, {
      code: ErrorCode.UNSUPPORTED,
      context: { protocol: url.protocol },
      hint: 'Only http: and https: sources are allowed.',
    });
  }

  const host = stripBrackets(url.hostname).toLowerCase();
  if (host === 'localhost') {
    throw new ConfigError('Refusing to fetch from localhost', {
      code: ErrorCode.INVALID_INPUT,
      context: { host },
      hint: 'Remote sources must be public (SSRF protection).',
    });
  }
  if (isIpLiteral(url.hostname) && isPrivateOrReservedIp(host)) {
    throw new ConfigError(`Refusing to fetch from a private/reserved address: ${host}`, {
      code: ErrorCode.INVALID_INPUT,
      context: { host },
      hint: 'Remote sources must resolve to a public address (SSRF protection).',
    });
  }

  return url;
}

/**
 * For a DOMAIN host, resolve it and reject if any address is private/reserved
 * (defeats a public name that points at internal infrastructure). No-op for
 * IP-literal hosts — those are already validated by {@link assertSafeUrl}.
 *
 * @throws ConfigError `INVALID_INPUT` when a resolved address is private.
 */
export async function assertHostResolvesPublic(
  url: URL,
  lookupFn: LookupFn = dnsLookup as unknown as LookupFn,
): Promise<void> {
  if (isIpLiteral(url.hostname)) return;
  const host = url.hostname;
  let records: Array<{ address: string }>;
  try {
    records = await lookupFn(host, { all: true });
  } catch (cause) {
    throw new ConfigError(`Could not resolve host: ${host}`, {
      code: ErrorCode.INGEST_FAILED,
      cause,
      context: { host },
    });
  }
  for (const { address } of records) {
    if (isPrivateOrReservedIp(address)) {
      throw new ConfigError(`Host ${host} resolves to a private address: ${address}`, {
        code: ErrorCode.INVALID_INPUT,
        context: { host, address },
        hint: 'Remote sources must resolve to a public address (SSRF protection).',
      });
    }
  }
}
