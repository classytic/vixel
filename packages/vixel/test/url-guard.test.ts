/**
 * SSRF URL-guard — unit tests (no network).
 *
 * The pure IP classifier and the synchronous URL validator are the security
 * boundary for remote ingest; this pins the private/reserved ranges and the
 * domain-resolves-to-private (DNS rebinding) defense.
 */

import { describe, it, expect } from 'vitest';
import {
  isPrivateOrReservedIp,
  isIpLiteral,
  assertSafeUrl,
  assertHostResolvesPublic,
  type LookupFn,
} from '../src/ingest/url-guard.js';
import { isConfigError } from '../src/errors.js';

describe('isPrivateOrReservedIp', () => {
  it('flags IPv4 private/reserved/loopback/metadata ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1', // multicast
    ]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '172.15.0.1']) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(false);
    }
  });

  it('flags IPv6 loopback/link-local/unique-local + mapped IPv4', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1%eth0')).toBe(true); // zone id stripped
    expect(isPrivateOrReservedIp('fd12:3456::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false); // public v6
  });

  it('flags hex-form IPv4-mapped IPv6 (the dotted-only bypass)', () => {
    expect(isPrivateOrReservedIp('::ffff:0a00:0005')).toBe(true); // == 10.0.0.5
    expect(isPrivateOrReservedIp('::ffff:a9fe:a9fe')).toBe(true); // == 169.254.169.254
    expect(isPrivateOrReservedIp('::ffff:0808:0808')).toBe(false); // == 8.8.8.8 public
  });

  it('flags IPv6 transition prefixes (NAT64, 6to4)', () => {
    expect(isPrivateOrReservedIp('64:ff9b::0a00:0005')).toBe(true); // NAT64
    expect(isPrivateOrReservedIp('2002:0a00:0005::1')).toBe(true); // 6to4 embedding 10.0.0.5
  });

  it('flags TEST-NET, benchmarking, and protocol-assignment IPv4 ranges', () => {
    for (const ip of ['192.0.0.1', '192.0.2.5', '198.18.0.1', '198.51.100.7', '203.0.113.9']) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it('fails closed on malformed input', () => {
    expect(isPrivateOrReservedIp('999.1.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
  });
});

describe('isIpLiteral', () => {
  it('distinguishes IP literals from domains', () => {
    expect(isIpLiteral('8.8.8.8')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('[fe80::1]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  it('accepts public http(s) URLs', () => {
    expect(assertSafeUrl('https://example.com/a.mp4').hostname).toBe('example.com');
    expect(assertSafeUrl('http://8.8.8.8/a.mp4').hostname).toBe('8.8.8.8');
  });

  const rejected: Array<[string, string]> = [
    ['ftp://example.com/x', 'protocol'],
    ['file:///etc/passwd', 'protocol'],
    ['data:text/plain;base64,AAAA', 'protocol'],
    ['http://localhost/x', 'localhost'],
    ['http://127.0.0.1/x', 'loopback IP'],
    ['http://169.254.169.254/latest/meta-data', 'metadata IP'],
    ['http://10.1.2.3/x', 'private IP'],
    ['http://[::1]/x', 'IPv6 loopback'],
    ['not a url', 'invalid'],
  ];
  it.each(rejected)('rejects %s (%s)', (url) => {
    let threw = false;
    try {
      assertSafeUrl(url);
    } catch (err) {
      threw = true;
      expect(isConfigError(err)).toBe(true);
    }
    expect(threw).toBe(true);
  });
});

describe('assertHostResolvesPublic', () => {
  const lookupTo = (address: string): LookupFn => async () => [{ address, family: 4 }];

  it('passes when a domain resolves to a public address', async () => {
    await expect(
      assertHostResolvesPublic(new URL('https://example.com/x'), lookupTo('93.184.216.34')),
    ).resolves.toBeUndefined();
  });

  it('rejects DNS rebinding (domain → private address)', async () => {
    await expect(
      assertHostResolvesPublic(new URL('https://evil.example/x'), lookupTo('10.0.0.5')),
    ).rejects.toSatisfy(isConfigError);
  });

  it('skips DNS for IP-literal hosts (already validated synchronously)', async () => {
    let called = false;
    const spy: LookupFn = async () => {
      called = true;
      return [{ address: '1.1.1.1', family: 4 }];
    };
    await assertHostResolvesPublic(new URL('http://8.8.8.8/x'), spy);
    expect(called).toBe(false);
  });
});
