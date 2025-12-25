// 0021: Cache Integration Tests
//
// Integration tests for cache functionality
// Tests that caching works correctly with email verification

import { LRUAdapter } from '../src/adapters/lru-adapter';
import { DEFAULT_CACHE_OPTIONS } from '../src/cache';
import type { ICache } from '../src/cache-interface';
import { resolveMxRecords } from '../src/dns';
import { isDisposableEmail, isFreeEmail } from '../src/index';
import type { SmtpVerificationResult } from '../src/types';

describe('0021: Cache Integration', () => {
  // No need to reset cache for parameter-based testing

  describe('Disposable Email Cache', () => {
    it('should cache disposable email results', async () => {
      // Create a custom cache to track calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<boolean>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<boolean | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: ICache = {
        disposable: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        free: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(
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

      // First call should miss cache
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call should hit cache
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // One more get call
      expect(cacheSets).toBe(1); // No new set calls
    });

    it('should cache non-disposable email results', async () => {
      // Create a custom cache to track calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<boolean>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<boolean | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: ICache = {
        disposable: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        free: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(
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

      // First call should miss cache
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call should hit cache
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // One more get call
      expect(cacheSets).toBe(1); // No new set calls
    });
  });

  describe('Free Email Cache', () => {
    it('should cache free email results', async () => {
      // Create a custom cache to track calls
      let cacheHits = 0;
      let cacheSets = 0;

      const trackingCache = new LRUAdapter<boolean>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);

      (trackingCache as any).get = (key: string): Promise<boolean | null> => {
        cacheHits++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      trackingCache.set = async (key, value, ttl) => {
        cacheSets++;
        return originalSet(key, value, ttl);
      };

      const customCache: ICache = {
        free: trackingCache,
        mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        disposable: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.disposable,
          DEFAULT_CACHE_OPTIONS.ttl.disposable
        ),
        domainValid: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(
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

      // First call should miss cache
      const result1 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call should hit cache
      const result2 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      expect(result1).toBe(result2);
      expect(cacheHits).toBe(2); // One more get call
      expect(cacheSets).toBe(1); // No new set calls
    });
  });

  describe('MX Records Cache', () => {
    it('should cache MX record lookups', async () => {
      // Create a custom cache to track calls
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

      const customCache: ICache = {
        mx: trackingCache,
        disposable: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.disposable,
          DEFAULT_CACHE_OPTIONS.ttl.disposable
        ),
        free: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter<boolean>(
          DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
          DEFAULT_CACHE_OPTIONS.ttl.domainValid
        ),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(
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

      // Use a mock domain that should resolve
      const testDomain = 'google.com';

      // First call should miss cache
      const result1 = await resolveMxRecords({ domain: testDomain, cache: customCache });
      expect(Array.isArray(result1)).toBe(true);
      expect(cacheHits).toBe(1);
      expect(cacheSets).toBe(1);

      // Second call should hit cache (if the first call had results)
      const result2 = await resolveMxRecords({ domain: testDomain, cache: customCache });
      expect(result1).toEqual(result2);
      expect(cacheHits).toBe(2); // One more get call
    });
  });

  describe('Cache Isolation', () => {
    it('should isolate results between different cache instances', async () => {
      // Create two separate caches
      const cache1: ICache = {
        disposable: new LRUAdapter<boolean>(100, 86400000),
        mx: new LRUAdapter<string[]>(100, 3600000),
        free: new LRUAdapter<boolean>(100, 86400000),
        domainValid: new LRUAdapter<boolean>(100, 86400000),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(100, 1800000),
        smtpPort: new LRUAdapter<number>(100, 3600000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(100, 86400000),
        whois: new LRUAdapter<any>(100, 3600000),
      };

      const cache2: ICache = {
        disposable: new LRUAdapter<boolean>(100, 86400000),
        mx: new LRUAdapter<string[]>(100, 3600000),
        free: new LRUAdapter<boolean>(100, 86400000),
        domainValid: new LRUAdapter<boolean>(100, 86400000),
        smtp: new LRUAdapter<SmtpVerificationResult | null>(100, 1800000),
        smtpPort: new LRUAdapter<number>(100, 3600000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(100, 86400000),
        whois: new LRUAdapter<any>(100, 3600000),
      };

      // Store different values in each cache
      await cache1.disposable.set('test.com', true);
      await cache2.disposable.set('test.com', false);

      // Verify caches are isolated
      expect(await cache1.disposable.get('test.com')).toBe(true);
      expect(await cache2.disposable.get('test.com')).toBe(false);

      // Test with actual functions
      const result1 = await isDisposableEmail({ emailOrDomain: 'test@tempmail.org', cache: cache1 });
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@tempmail.org', cache: cache2 });

      // Both should return the same logical result, but cached separately
      expect(result1).toBe(result2);
    });
  });

  describe('Default Cache Behavior', () => {
    it('should use default cache when no custom cache is provided', async () => {
      // Test that functions work without cache parameter
      const result1 = await isDisposableEmail({ emailOrDomain: '10minutemail.com' });
      const result2 = await isDisposableEmail({ emailOrDomain: '10minutemail.com' });

      // Both should return the same result
      expect(result1).toBe(result2);
      expect(result1).toBe(true); // 10minutemail.com is a disposable service
    });
  });

  describe('Cache Error Handling', () => {
    it('should handle cache errors gracefully', async () => {
      // Create a cache that throws errors
      const faultyCache: ICache = {
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

      // Function should still work even with faulty cache
      const result = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: faultyCache });
      expect(result).toBe(false); // Gmail is not disposable
    });
  });
});
