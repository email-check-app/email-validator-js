/**
 * Integration tests for cache functionality
 * Tests that caching works correctly with email validation functions
 */

import type { Cache, DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from '../src';
import { DEFAULT_CACHE_OPTIONS, isDisposableEmail, isFreeEmail, LRUAdapter } from '../src';
import { resolveMxRecords } from '../src/mx-resolver';

describe('0201 Cache Integration', () => {
  // No need to reset cache for parameter-based testing

  describe('Disposable Email Cache', () => {
    it('should cache disposable email results', async () => {
      // Create a tracking cache to monitor get/set calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<DisposableEmailResult>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<DisposableEmailResult | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: Cache = {
        disposable: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        free: new LRUAdapter<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<DomainValidResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.smtp,
          DEFAULT_CACHE_OPTIONS.ttl.smtp
        ),
        smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
          DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
        ),
        whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
      };

      // First call performs lookup and caches result
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call retrieves from cache (no new set)
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // Incremented by one more get
      expect(cacheSets).toBe(1); // Unchanged - no new set operations
    });

    it('should cache non-disposable email results', async () => {
      // Create a tracking cache to monitor get/set calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<DisposableEmailResult>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<DisposableEmailResult | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: Cache = {
        disposable: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        free: new LRUAdapter<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<DomainValidResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.smtp,
          DEFAULT_CACHE_OPTIONS.ttl.smtp
        ),
        smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
          DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
        ),
        whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
      };

      // First call performs lookup and caches result
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call retrieves from cache (no new set)
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // Incremented by one more get
      expect(cacheSets).toBe(1); // Unchanged - no new set operations
    });
  });

  describe('Free Email Cache', () => {
    it('should cache free email results', async () => {
      // Create a tracking cache to monitor get/set calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<FreeEmailResult>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<FreeEmailResult | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: Cache = {
        free: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        disposable: new LRUAdapter<DisposableEmailResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.disposable,
          DEFAULT_CACHE_OPTIONS.ttl.disposable
        ),
        domainValid: new LRUAdapter<DomainValidResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.smtp,
          DEFAULT_CACHE_OPTIONS.ttl.smtp
        ),
        smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
          DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
        ),
        whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
      };

      // First call performs lookup and caches result
      const result1 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call retrieves from cache (no new set)
      const result2 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // Incremented by one more get
      expect(cacheSets).toBe(1); // Unchanged - no new set operations
    });
  });

  describe('MX Records Cache', () => {
    it('should cache MX record lookups', async () => {
      // Create a tracking cache to monitor get/set calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<string[]>(100, 3600000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<string[] | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: Cache = {
        mx: trackingCache,
        disposable: new LRUAdapter<DisposableEmailResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.disposable,
          DEFAULT_CACHE_OPTIONS.ttl.disposable
        ),
        free: new LRUAdapter<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<DomainValidResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult>(
          DEFAULT_CACHE_OPTIONS.maxSize.smtp,
          DEFAULT_CACHE_OPTIONS.ttl.smtp
        ),
        smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
          DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
        ),
        whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
      };

      // Use a domain that should resolve successfully
      const testDomain = 'google.com';

      // First call performs DNS lookup and caches result
      const result1 = await resolveMxRecords({ domain: testDomain, cache: customCache });
      expect(Array.isArray(result1)).toBe(true);
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call retrieves from cache (no new set)
      const result2 = await resolveMxRecords({ domain: testDomain, cache: customCache });
      expect(result1).toEqual(result2);
      expect(cacheHits).toBe(2); // Incremented by one more get
    });
  });

  describe('Cache Isolation', () => {
    it('should isolate results between different cache instances', async () => {
      // Create two independent cache instances
      const cache1: Cache = {
        disposable: new LRUAdapter<DisposableEmailResult>(100, 86400000),
        mx: new LRUAdapter<string[]>(100, 3600000),
        free: new LRUAdapter<FreeEmailResult>(100, 86400000),
        domainValid: new LRUAdapter<DomainValidResult>(100, 86400000),
        smtp: new LRUAdapter<SmtpVerificationResult>(100, 1800000),
        smtpPort: new LRUAdapter<number>(100, 3600000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(100, 86400000),
        whois: new LRUAdapter<any>(100, 3600000),
      };

      const cache2: Cache = {
        disposable: new LRUAdapter<DisposableEmailResult>(100, 86400000),
        mx: new LRUAdapter<string[]>(100, 3600000),
        free: new LRUAdapter<FreeEmailResult>(100, 86400000),
        domainValid: new LRUAdapter<DomainValidResult>(100, 86400000),
        smtp: new LRUAdapter<SmtpVerificationResult>(100, 1800000),
        smtpPort: new LRUAdapter<number>(100, 3600000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(100, 86400000),
        whois: new LRUAdapter<any>(100, 3600000),
      };

      // Store conflicting values in each cache to test isolation
      await cache1.disposable.set('test.com', { isDisposable: true, checkedAt: Date.now() });
      await cache2.disposable.set('test.com', { isDisposable: false, checkedAt: Date.now() });

      // Verify caches maintain independent values
      expect((await cache1.disposable.get('test.com'))?.isDisposable).toBe(true);
      expect((await cache2.disposable.get('test.com'))?.isDisposable).toBe(false);

      // Test with actual functions - results should match but cache independently
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@tempmail.org', cache: cache1 });
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@tempmail.org', cache: cache2 });

      // Both return the same logical result, cached separately
      expect(result1).toBe(result2);
    });
  });

  describe('Default Cache Behavior', () => {
    it('should use default cache when no custom cache is provided', async () => {
      // Functions work without explicit cache parameter (uses default singleton)
      const result1 = await isDisposableEmail({ emailOrDomain: '10minutemail.com' });
      const result2 = await isDisposableEmail({ emailOrDomain: '10minutemail.com' });

      // Both return the same result
      expect(result1).toBe(result2);
      expect(result1).toBe(true); // 10minutemail.com is a known disposable domain
    });
  });

  describe('Cache Error Handling', () => {
    it('should handle cache errors gracefully', async () => {
      // Create a cache that throws errors on all operations
      const faultyCache: Cache = {
        mx: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        disposable: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        free: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        domainValid: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        smtp: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        smtpPort: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        domainSuggestion: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
        whois: {
          get: () => Promise.reject(new Error('Cache read error')),
          set: () => Promise.reject(new Error('Cache write error')),
          delete: () => Promise.reject(new Error('Cache delete error')),
          has: () => Promise.reject(new Error('Cache has error')),
          clear: () => Promise.reject(new Error('Cache clear error')),
        },
      };

      // Function should still work despite cache errors (falls back to direct lookup)
      const result = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: faultyCache });
      expect(result).toBe(false); // Gmail is not a disposable email provider
    });
  });
});
