/**
 * Coverage for the TLD_REGEX dispatch in whois-parser.ts.
 *
 * The 0301 suite tests parsing against full real-world fixtures (.io, .ai,
 * .com, .org, .uk, .ca, .mt). The TLD_REGEX map covers ~30 TLDs — this suite
 * fires synthetic minimal samples through the dispatch to confirm each regex
 * variant produces the right shape:
 *   - the TLD picks the right registry-specific regex
 *   - the registrar/domainName/dates parse correctly per TLD format
 *   - notFound markers map to isAvailable=true
 *   - rate-limit markers throw
 *   - the `defaultRegex` fallback fires for unknown TLDs
 */
import { describe, expect, it } from 'bun:test';
import { parseWhoisData } from '../../src/whois-parser';

describe('0306 whois-parser — TLD dispatch coverage', () => {
  describe('default registry (Verisign-style)', () => {
    it('parses a .com response with creation/expiration', () => {
      // Trailing newline is required — the default `Status:` regex matches
      // up to `\s*\n`, so the last status line must end with a newline.
      const raw = [
        'Domain Name: example.com',
        'Registrar: Acme',
        'Creation Date: 2010-01-01T00:00:00Z',
        'Registry Expiry Date: 2030-01-01T00:00:00Z',
        'Updated Date: 2020-01-01T00:00:00Z',
        'Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited',
        '',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      expect(result.domainName).toBe('example.com');
      expect(result.registrar).toBe('Acme');
      expect(result.creationDate).toBeDefined();
      expect(result.expirationDate).toBeDefined();
      expect(result.status?.[0]).toContain('clientTransferProhibited');
      expect(result.isAvailable).toBe(false);
    });

    it('detects "No match for" as not-found', () => {
      const raw = 'No match for "DOES-NOT-EXIST.COM".\n';
      const result = parseWhoisData({ rawData: raw, domain: 'does-not-exist.com' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('.org registry', () => {
    it('detects "NOT FOUND" not-found marker', () => {
      const raw = 'NOT FOUND\nWHOIS server reports no match\n';
      const result = parseWhoisData({ rawData: raw, domain: 'missing.org' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('.ru registry', () => {
    it('parses lowercase domain/registrar/paid-till fields', () => {
      const raw = [
        'domain: example.ru',
        'registrar: RU-CENTER-RU',
        'paid-till: 2025-01-01T00:00:00Z',
        'state: REGISTERED',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.ru' });
      expect(result.domainName).toBe('example.ru');
      expect(result.registrar).toBe('RU-CENTER-RU');
      expect(result.expirationDate).toBeDefined();
      expect(result.status).toContain('REGISTERED');
    });

    it('detects "No entries found" as available', () => {
      const result = parseWhoisData({ rawData: 'No entries found.\n', domain: 'missing.ru' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('.uk registry — dd-MMM-yyyy date format', () => {
    it('parses "14-Sep-2023" style dates', () => {
      const raw = [
        'Domain name:',
        '    example.co.uk',
        '    Registrant:',
        'Registrar: Test Registrar UK',
        '    Relevant dates:',
        '        Registered on: 14-Sep-2010',
        'Creation Date: 14-Sep-2010',
        'Expiration Date: 14-Sep-2030',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.co.uk' });
      expect(result.creationDate).toBeDefined();
      expect(new Date(result.creationDate as string).getFullYear()).toBe(2010);
    });
  });

  describe('.au registry — rate-limit detection', () => {
    it('throws when "WHOIS LIMIT EXCEEDED" appears', () => {
      const raw = 'WHOIS LIMIT EXCEEDED - try again later';
      expect(() => parseWhoisData({ rawData: raw, domain: 'example.com.au' })).toThrow(/Rate Limited/);
    });

    it('uses "Last Modified" instead of "Updated Date"', () => {
      const raw = [
        'Domain Name: example.com.au',
        'Last Modified: 2023-06-01T00:00:00Z',
        'Registrar Name: Test AU Registrar',
        'Creation Date: 2010-01-01T00:00:00Z',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.com.au' });
      expect(result.updatedDate).toBeDefined();
      expect(result.registrar).toBe('Test AU Registrar');
    });
  });

  describe('.us registry', () => {
    it('uses "Domain Status:" and "Registrar Registration Expiration Date:"', () => {
      const raw = [
        'Domain Name: example.us',
        'Registrar: Test US Registrar',
        'Creation Date: 2010-01-01T00:00:00Z',
        'Registrar Registration Expiration Date: 2030-01-01T00:00:00Z',
        'Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.us' });
      expect(result.expirationDate).toBeDefined();
      expect(result.status?.[0]).toContain('clientTransferProhibited');
    });

    it('detects "No Data Found" as available', () => {
      const result = parseWhoisData({ rawData: 'No Data Found\n', domain: 'missing.us' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('.de registry', () => {
    it('parses lowercase Domain: and detects free Status', () => {
      const free = parseWhoisData({ rawData: 'Domain: missing.de\nStatus: free\n', domain: 'missing.de' });
      expect(free.isAvailable).toBe(true);
    });

    it('parses registered .de domains', () => {
      const raw = ['Domain: example.de', 'Status: connect', 'Updated Date: 2023-01-01T00:00:00Z'].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.de' });
      expect(result.domainName).toBe('example.de');
      expect(result.isAvailable).toBe(false);
    });
  });

  describe('.fr registry', () => {
    it('parses lowercase domain and last-update', () => {
      const raw = ['domain: example.fr', 'last-update: 2023-06-01', 'Creation Date: 2010-01-01'].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.fr' });
      expect(result.domainName).toBe('example.fr');
      expect(result.updatedDate).toBeDefined();
    });

    it('detects "%% NOT FOUND" not-found marker', () => {
      const result = parseWhoisData({ rawData: '%% NOT FOUND', domain: 'missing.fr' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('.nl registry', () => {
    it('detects ".nl is free" not-found marker', () => {
      const result = parseWhoisData({ rawData: 'missing.nl is free\n', domain: 'missing.nl' });
      expect(result.isAvailable).toBe(true);
    });

    it('throws on rate limit', () => {
      const raw = 'maximum number of requests per second exceeded';
      expect(() => parseWhoisData({ rawData: raw, domain: 'example.nl' })).toThrow(/Rate Limited/);
    });
  });

  describe('.eu registry', () => {
    it('parses Domain: line + multi-line Registrar:', () => {
      const raw = [
        'Domain: example.eu',
        'Registrar: ',
        '  Name: EU Registrar Ltd',
        'Creation Date: 2010-01-01T00:00:00Z',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.eu' });
      expect(result.domainName).toBe('example.eu');
      expect(result.registrar).toBe('EU Registrar Ltd');
    });

    it('detects "Status: AVAILABLE" not-found', () => {
      const result = parseWhoisData({ rawData: 'Status: AVAILABLE\n', domain: 'missing.eu' });
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('default fallback for unknown TLD', () => {
    it('uses defaultRegex for an unknown TLD like .xyz', () => {
      const raw = [
        'Domain Name: example.xyz',
        'Registrar: XYZ Reg',
        'Creation Date: 2020-01-01T00:00:00Z',
        'Status: ok',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.xyz' });
      expect(result.domainName).toBe('example.xyz');
      expect(result.registrar).toBe('XYZ Reg');
    });
  });

  describe('common-field patterns (always-on)', () => {
    it('extracts multiple Name Server entries as nameServers[]', () => {
      const raw = [
        'Domain Name: example.com',
        'Name Server: NS1.EXAMPLE.COM',
        'Name Server: NS2.EXAMPLE.COM',
        'Creation Date: 2010-01-01T00:00:00Z',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      expect(result.nameServers).toEqual(['NS1.EXAMPLE.COM', 'NS2.EXAMPLE.COM']);
    });

    it('extracts DNSSEC, Registrar URL, and abuse contact', () => {
      const raw = [
        'Domain Name: example.com',
        'Registrar: Test',
        'Creation Date: 2010-01-01T00:00:00Z',
        'Registrar URL: https://registrar.example',
        'DNSSEC: signedDelegation',
        'Registrar Abuse Contact Email: abuse@registrar.example',
        'Registrar Abuse Contact Phone: +1.5555555555',
      ].join('\n');
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      expect(result.registrarUrl).toBe('https://registrar.example');
      expect(result.dnssec).toBe('signedDelegation');
      expect(result.registrarAbuseContactEmail).toBe('abuse@registrar.example');
      expect(result.registrarAbuseContactPhone).toBe('+1.5555555555');
    });
  });

  describe('edge cases / false positives', () => {
    it('returns isAvailable=true for empty rawData', () => {
      const result = parseWhoisData({ rawData: '', domain: 'anything.com' });
      expect(result.isAvailable).toBe(true);
      expect(result.domainName).toBe('anything.com');
    });

    it('default-defaults isAvailable to false when no notFound marker matches', () => {
      const raw = 'Domain Name: example.com\nRegistrar: Acme\n';
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      expect(result.isAvailable).toBe(false);
    });

    it('lowercases the parsed domainName regardless of WHOIS case', () => {
      const raw = 'Domain Name: EXAMPLE.COM\nCreation Date: 2010-01-01T00:00:00Z\n';
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      expect(result.domainName).toBe('example.com');
    });

    it('stores raw date string when parsing fails (no false positive on bogus dates)', () => {
      const raw = 'Domain Name: example.com\nCreation Date: not-a-real-date\n';
      const result = parseWhoisData({ rawData: raw, domain: 'example.com' });
      // The implementation falls back to the raw string when parseDate returns null.
      expect(result.creationDate).toBe('not-a-real-date');
    });
  });
});
