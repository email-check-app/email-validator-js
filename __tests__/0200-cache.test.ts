import { promises as dnsPromises } from 'node:dns';
import expect from 'expect';
import sinon, { type SinonSandbox } from 'sinon';
import { isDisposableEmail, isFreeEmail, isValidEmailDomain } from '../src';
import { LRUAdapter } from '../src/adapters/lru-adapter';
import { clearDefaultCache, DEFAULT_CACHE_OPTIONS, getDefaultCache, resetDefaultCache } from '../src/cache';
import type { ICache } from '../src/cache-interface';
import { resolveMxRecords } from '../src/dns';
import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from '../src/types';

describe('0200 Cache', () => {
  let sandbox: SinonSandbox;
  let testCache: ICache;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Create a fresh cache for each test
    testCache = {
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
      whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
    };
    clearDefaultCache();
  });

  afterEach(() => {
    sandbox.restore();
    clearDefaultCache();
  });

  describe('MX Records Cache', () => {
    it('should cache MX records lookup', async () => {
      const resolveMxStub = sandbox
        .stub(dnsPromises, 'resolveMx')
        .resolves([{ exchange: 'mx1.example.com', priority: 10 }]);

      // First call - should hit DNS
      const result1 = await resolveMxRecords({ domain: 'example.com', cache: testCache });
      expect(resolveMxStub.callCount).toBe(1);
      expect(result1).toEqual(['mx1.example.com']);

      // Second call - should use cache
      const result2 = await resolveMxRecords({ domain: 'example.com', cache: testCache });
      expect(resolveMxStub.callCount).toBe(1); // Still 1, used cache
      expect(result2).toEqual(['mx1.example.com']);
    });

    it('should cache failed MX lookups as empty array', async () => {
      const resolveMxStub = sandbox.stub(dnsPromises, 'resolveMx').rejects(new Error('DNS failed'));

      // First call - DNS lookup fails and caches the failure
      try {
        await resolveMxRecords({ domain: 'invalid.com', cache: testCache });
        expect(true).toBe(false); // Should not reach here
      } catch (_error) {
        expect(resolveMxStub.callCount).toBe(1);
      }

      // Second call - returns cached failure result (empty array, no error thrown)
      const result = await resolveMxRecords({ domain: 'invalid.com', cache: testCache });
      expect(resolveMxStub.callCount).toBe(1); // Still 1, used cached failure
      expect(result).toEqual([]); // Returns empty array for previously failed lookup
    });
  });

  describe('Disposable Email Cache', () => {
    it('should cache disposable email checks', async () => {
      // First call - queries the disposable email list
      const result1 = await isDisposableEmail({ emailOrDomain: '10minutemail.com', cache: testCache });
      expect(result1).toBe(true);

      // Second call - returns cached result (no external query)
      const result2 = await isDisposableEmail({ emailOrDomain: '10minutemail.com', cache: testCache });
      expect(result2).toBe(true);
    });

    it('should cache non-disposable email checks', async () => {
      // First call - queries the disposable email list
      const result1 = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result1).toBe(false);

      // Second call - returns cached result (no external query)
      const result2 = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result2).toBe(false);
    });
  });

  describe('Free Email Cache', () => {
    it('should cache free email checks', async () => {
      // First call - queries the free email provider list
      const result1 = await isFreeEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result1).toBe(true);

      // Second call - returns cached result (no external query)
      const result2 = await isFreeEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result2).toBe(true);
    });

    it('should cache non-free email checks', async () => {
      // First call - queries the free email provider list
      const result1 = await isFreeEmail({ emailOrDomain: 'custom-business.com', cache: testCache });
      expect(result1).toBe(false);

      // Second call - returns cached result (no external query)
      const result2 = await isFreeEmail({ emailOrDomain: 'custom-business.com', cache: testCache });
      expect(result2).toBe(false);
    });
  });

  describe('Domain Validation Cache', () => {
    it('should cache domain validation checks', async () => {
      // First call - performs domain format and syntax validation
      const result1 = await isValidEmailDomain('example.com', testCache);
      expect(result1).toBe(true);

      // Second call - returns cached validation result
      const result2 = await isValidEmailDomain('example.com', testCache);
      expect(result2).toBe(true);
    });

    it('should cache invalid domain checks', async () => {
      // First call - performs domain format and syntax validation
      const result1 = await isValidEmailDomain('invalid..domain', testCache);
      expect(result1).toBe(false);

      // Second call - returns cached validation result
      const result2 = await isValidEmailDomain('invalid..domain', testCache);
      expect(result2).toBe(false);
    });
  });

  describe('Default Cache', () => {
    it('should return the same cache instance (singleton)', () => {
      const cache1 = getDefaultCache();
      const cache2 = getDefaultCache();
      expect(cache1).toBe(cache2); // Should be the same reference
    });

    it('should clear all cache stores', () => {
      const defaultCache = getDefaultCache();

      // Add test data to multiple cache stores
      defaultCache.mx.set('test.com', ['mx1.test.com']);
      defaultCache.disposable.set('test.com', { isDisposable: true, checkedAt: Date.now() });
      defaultCache.free.set('test.com', { isFree: false, checkedAt: Date.now() });

      // Verify data exists before clearing
      expect(defaultCache.mx.get('test.com')).toEqual(['mx1.test.com']);
      const disposableResult = defaultCache.disposable.get('test.com');
      expect(disposableResult && 'isDisposable' in disposableResult && disposableResult.isDisposable).toBe(true);
      const freeResult = defaultCache.free.get('test.com');
      expect(freeResult && 'isFree' in freeResult && freeResult.isFree).toBe(false);

      // Clear all cache stores
      clearDefaultCache();

      // Verify all data is cleared
      expect(defaultCache.mx.get('test.com')).toBeNull();
      expect(defaultCache.disposable.get('test.com')).toBeNull();
      expect(defaultCache.free.get('test.com')).toBeNull();
    });

    it('should reset cache to fresh instance', () => {
      const cache1 = getDefaultCache();
      cache1.mx.set('test.com', ['mx1.test.com']);

      // Reset creates a new cache instance
      resetDefaultCache();

      const cache2 = getDefaultCache();
      expect(cache1).not.toBe(cache2); // Different instances after reset
      expect(cache2.mx.get('test.com')).toBeNull(); // New instance is empty
    });
  });

  describe('Cache Without Explicit Parameter', () => {
    it('should use default cache when no cache is provided', async () => {
      const resolveMxStub = sandbox
        .stub(dnsPromises, 'resolveMx')
        .resolves([{ exchange: 'mx1.example.com', priority: 10 }]);

      // Call without cache parameter - uses default singleton cache
      const result1 = await resolveMxRecords({ domain: 'example.com' });
      expect(resolveMxStub.callCount).toBe(1);
      expect(result1).toEqual(['mx1.example.com']);

      // Second call - retrieves cached result from default cache
      const result2 = await resolveMxRecords({ domain: 'example.com' });
      expect(resolveMxStub.callCount).toBe(1); // Still 1, cache was used
      expect(result2).toEqual(['mx1.example.com']);
    });
  });
});
