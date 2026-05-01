/**
 * WHOIS unit tests with mocked sockets via fake-net.
 *
 * The integration suite (0302-whois.test.ts) hits the real network. This suite
 * covers the same behaviors deterministically:
 *   - TLD-specific server lookup (whoisServers map)
 *   - IANA referral fallback for unknown TLDs
 *   - cleanDomain stripping (URLs / email-style input)
 *   - psl invalid-domain rejection
 *   - cache hit / miss / write-on-success / no-write-on-failure
 *   - getDomainAge math + missing creation date handling
 *   - getDomainRegistrationStatus available / registered / locked / pendingDelete / expired
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { LRUAdapter } from '../../src';
import { DEFAULT_CACHE_OPTIONS } from '../../src/cache';
import type { Cache } from '../../src/cache-interface';
import type {
  DisposableEmailResult,
  DomainValidResult,
  FreeEmailResult,
  SmtpVerificationResult,
} from '../../src/types';
import { getDomainAge, getDomainRegistrationStatus } from '../../src/whois';
import type { ParsedWhoisResult } from '../../src/whois-parser';
import { fakeNet } from '../helpers/fake-net';

function makeCache(): Cache {
  return {
    mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
    disposable: new LRUAdapter<DisposableEmailResult>(
      DEFAULT_CACHE_OPTIONS.maxSize.disposable,
      DEFAULT_CACHE_OPTIONS.ttl.disposable
    ),
    free: new LRUAdapter<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
    domainValid: new LRUAdapter<DomainValidResult>(
      DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
      DEFAULT_CACHE_OPTIONS.ttl.domainValid
    ),
    smtp: new LRUAdapter<SmtpVerificationResult>(DEFAULT_CACHE_OPTIONS.maxSize.smtp, DEFAULT_CACHE_OPTIONS.ttl.smtp),
    smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
    domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
      DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
      DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
    ),
    whois: new LRUAdapter<ParsedWhoisResult>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
  };
}

/** Synthetic Verisign-style WHOIS response. Covers the regex paths .com/.net use. */
function comResponse(
  domain: string,
  opts: { creation?: string; expiration?: string; updated?: string; registrar?: string; status?: string[] } = {}
): string {
  const status = (opts.status ?? ['clientTransferProhibited https://icann.org/epp#clientTransferProhibited'])
    .map((s) => `Domain Status: ${s}`)
    .join('\n');
  return [
    `Domain Name: ${domain.toUpperCase()}`,
    `Registrar: ${opts.registrar ?? 'Test Registrar, Inc.'}`,
    `Updated Date: ${opts.updated ?? '2023-06-15T12:00:00Z'}`,
    `Creation Date: ${opts.creation ?? '2010-01-01T00:00:00Z'}`,
    `Registry Expiry Date: ${opts.expiration ?? '2030-01-01T00:00:00Z'}`,
    status,
    'Name Server: NS1.EXAMPLE.COM',
    'Name Server: NS2.EXAMPLE.COM',
    'DNSSEC: unsigned',
    '>>> Last update of WHOIS database: 2024-01-01T00:00:00Z <<<',
  ].join('\n');
}

const NOT_FOUND_COM = 'No match for "DOES-NOT-EXIST.COM".\n>>> Last update <<<\n';

describe('0303 whois — getDomainAge', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('queries the .com TLD server and parses creation date', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com', { creation: '2005-06-15T00:00:00Z' })]);

    const info = await getDomainAge('example.com', 5000, false, makeCache());
    expect(info).not.toBeNull();
    expect(info?.domain).toBe('example.com');
    expect(info?.creationDate).toBeInstanceOf(Date);
    expect(info?.creationDate.getFullYear()).toBe(2005);
    // Connect went to the right server.
    expect(fakeNet.connects.some((c) => c.host === 'whois.verisign-grs.com' && c.port === 43)).toBe(true);
  });

  it('writes the queried domain to the socket', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com')]);
    await getDomainAge('example.com', 5000, false, makeCache());
    const writes = fakeNet.writes.filter((w) => w.host === 'whois.verisign-grs.com');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].data).toContain('example.com');
  });

  it('routes .org to whois.pir.org', async () => {
    fakeNet.scriptByHost('whois.pir.org', [comResponse('foundation.org')]);
    await getDomainAge('foundation.org', 5000, false, makeCache());
    expect(fakeNet.connects.some((c) => c.host === 'whois.pir.org')).toBe(true);
  });

  it('strips https:// and trailing path before lookup', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com')]);
    const info = await getDomainAge('https://example.com/some/path?q=1', 5000, false, makeCache());
    expect(info?.domain).toBe('example.com');
  });

  it('strips email-style "user@example.com" prefix before lookup', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com')]);
    const info = await getDomainAge('alice@example.com', 5000, false, makeCache());
    expect(info?.domain).toBe('example.com');
  });

  it('returns null for invalid domain shapes (psl rejects)', async () => {
    const info = await getDomainAge('not a real domain', 5000, false, makeCache());
    expect(info).toBeNull();
  });

  it('returns null when WHOIS has no creation date', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', ['Domain Name: example.com\nRegistrar: Test\n']);
    const info = await getDomainAge('example.com', 5000, false, makeCache());
    expect(info).toBeNull();
  });

  it('returns null on connection error', async () => {
    fakeNet.setConnectError('ECONNREFUSED');
    const info = await getDomainAge('example.com', 5000, false, makeCache());
    expect(info).toBeNull();
  });

  it('uses cache on second call (no second connection)', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com', { creation: '2005-06-15T00:00:00Z' })]);
    const cache = makeCache();

    await getDomainAge('example.com', 5000, false, cache);
    const connectsAfter1st = fakeNet.connects.length;

    await getDomainAge('example.com', 5000, false, cache);
    expect(fakeNet.connects.length).toBe(connectsAfter1st);
  });

  it('does NOT cache failed lookups (so a transient blip retries)', async () => {
    fakeNet.setConnectError('ECONNREFUSED');
    const cache = makeCache();

    await getDomainAge('example.com', 5000, false, cache);
    fakeNet.setConnectError(null);
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com')]);

    const info = await getDomainAge('example.com', 5000, false, cache);
    expect(info).not.toBeNull();
  });

  it('computes age in days using today as reference', async () => {
    // Set creation to ~365 days ago.
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com', { creation: yearAgo })]);

    const info = await getDomainAge('example.com', 5000, false, makeCache());
    expect(info?.ageInDays).toBeGreaterThanOrEqual(364);
    expect(info?.ageInDays).toBeLessThanOrEqual(366);
    expect(info?.ageInYears).toBeCloseTo(1, 0);
  });

  it('preserves expirationDate and updatedDate when present', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      comResponse('example.com', {
        creation: '2010-01-01T00:00:00Z',
        expiration: '2030-01-01T00:00:00Z',
        updated: '2024-06-15T00:00:00Z',
      }),
    ]);
    const info = await getDomainAge('example.com', 5000, false, makeCache());
    expect(info?.expirationDate?.getFullYear()).toBe(2030);
    expect(info?.updatedDate?.getFullYear()).toBe(2024);
  });
});

describe('0303 whois — getDomainRegistrationStatus', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('reports a registered .com domain with registrar + status', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      comResponse('example.com', {
        registrar: 'Acme Registrar',
        status: ['clientTransferProhibited https://icann.org/epp#clientTransferProhibited'],
      }),
    ]);

    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    expect(info?.isRegistered).toBe(true);
    expect(info?.isAvailable).toBe(false);
    expect(info?.registrar).toBe('Acme Registrar');
    expect(info?.status).toContain('clientTransferProhibited');
  });

  it('detects locked status', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      comResponse('example.com', {
        status: ['clientTransferProhibited https://icann.org/epp#clientTransferProhibited'],
      }),
    ]);
    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    expect(info?.isLocked).toBe(true);
  });

  it('detects pendingDelete status', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      comResponse('example.com', {
        status: ['pendingDelete', 'redemptionPeriod'],
      }),
    ]);
    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    expect(info?.isPendingDelete).toBe(true);
  });

  it('reports days until expiration when not yet expired', async () => {
    const futureDate = new Date(Date.now() + 60 * 86_400_000).toISOString();
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com', { expiration: futureDate })]);
    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    expect(info?.isExpired).toBe(false);
    expect(info?.daysUntilExpiration).toBeGreaterThan(58);
    expect(info?.daysUntilExpiration).toBeLessThan(62);
  });

  it('flags expired domains', async () => {
    const pastDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    fakeNet.scriptByHost('whois.verisign-grs.com', [comResponse('example.com', { expiration: pastDate })]);
    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    expect(info?.isExpired).toBe(true);
    expect(info?.daysUntilExpiration).toBeNull();
  });

  it('returns the available shape when the domain is not found', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [NOT_FOUND_COM]);
    const info = await getDomainRegistrationStatus('does-not-exist.com', 5000, false, makeCache());
    expect(info?.isRegistered).toBe(false);
    expect(info?.isAvailable).toBe(true);
    expect(info?.registrar).toBeNull();
    expect(info?.status).toEqual([]);
    expect(info?.nameServers).toEqual([]);
  });

  it('returns null when input is malformed', async () => {
    expect(await getDomainRegistrationStatus('not a domain', 5000, false, makeCache())).toBeNull();
  });

  it('returns null when WHOIS connection errors', async () => {
    fakeNet.setConnectError('ECONNREFUSED');
    expect(await getDomainRegistrationStatus('example.com', 5000, false, makeCache())).toBeNull();
  });

  it('strips status URL suffix, keeping just the code', async () => {
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      comResponse('example.com', {
        status: ['clientTransferProhibited https://icann.org/epp#clientTransferProhibited'],
      }),
    ]);
    const info = await getDomainRegistrationStatus('example.com', 5000, false, makeCache());
    // The implementation splits by ' ' and keeps the first token — verify it's bare.
    expect(info?.status[0]).toBe('clientTransferProhibited');
  });
});

describe('0303 whois — IANA fallback for unknown TLDs', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('falls back to whois.iana.org for an unknown TLD', async () => {
    // .xyz is NOT in the whoisServers table — adapter must call IANA first.
    const ianaResponse = `refer:        whois.nic.xyz\n`;
    fakeNet.scriptByHost('whois.iana.org', [ianaResponse]);
    fakeNet.scriptByHost('whois.nic.xyz', [comResponse('example.xyz')]);

    const info = await getDomainAge('example.xyz', 5000, false, makeCache());
    expect(fakeNet.connects.some((c) => c.host === 'whois.iana.org')).toBe(true);
    expect(fakeNet.connects.some((c) => c.host === 'whois.nic.xyz')).toBe(true);
    expect(info).not.toBeNull();
  });

  it('parses IANA response directly when no refer: line', async () => {
    fakeNet.scriptByHost('whois.iana.org', [comResponse('lonely.xyz')]);
    const info = await getDomainAge('lonely.xyz', 5000, false, makeCache());
    expect(fakeNet.connects.some((c) => c.host === 'whois.iana.org')).toBe(true);
    expect(fakeNet.connects.some((c) => c.host === 'whois.nic.xyz')).toBe(false);
    expect(info).not.toBeNull();
  });
});
