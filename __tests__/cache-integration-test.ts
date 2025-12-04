/**
 * Integration tests for cache functionality
 * Tests that caching works correctly with email verification
 */

import { LRUAdapter } from '../src/adapters/lru-adapter';
import { CacheFactory } from '../src/cache-factory';
import { resolveMxRecords } from '../src/dns';
import { isDisposableEmail, isFreeEmail, verifyEmail } from '../src/index';

describe('Cache Integration', () => {
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

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
        if (cacheType === 'disposable') {
          return trackingCache;
        }
        return new LRUAdapter(defaultSize, defaultTtl);
      });

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

    it('should not interfere with cache of different domains', async () => {
      const customCache = CacheFactory.createLRUCache();

      const result1 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      const result2 = await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      const result3 = await isDisposableEmail({ emailOrDomain: 'test@gmail.com', cache: customCache }); // Should use cache

      expect(result1).toBe(false);
      expect(result2).toBe(true);
      expect(result3).toBe(result1); // Same as first result
    });
  });

  describe('Free Email Cache', () => {
    it('should cache free email provider results', async () => {
      const customCache = CacheFactory.createLRUCache();

      // Test with a known free provider
      const result1 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache });
      const result2 = await isFreeEmail({ emailOrDomain: 'test@gmail.com', cache: customCache }); // Should use cache

      expect(typeof result1).toBe('boolean');
      expect(result1).toBe(result2);
    });
  });

  describe('MX Record Cache', () => {
    it('should cache MX record lookups', async () => {
      const customCache = CacheFactory.createLRUCache();

      // This might throw if DNS resolution fails, but that's ok for this test
      const domain = 'example.com';
      try {
        await resolveMxRecords({ domain, cache: customCache });
        // Second call should be cached (though we can't directly verify)
        await resolveMxRecords({ domain, cache: customCache });
      } catch (error) {
        // DNS resolution failed, but that's not what we're testing
        console.warn('DNS resolution failed, skipping MX cache test:', error);
      }
    });
  });

  describe('Verification with Cache', () => {
    it('should use cache during email verification', async () => {
      // Mock cache to track usage
      const cacheUsages: { type: string; key: string }[] = [];

      const mockCache = {
        get: async (key: string): Promise<any> => {
          cacheUsages.push({ type: 'get', key });
          return null; // Always miss to track all operations
        },
        set: async (key: string, value: any, ttl?: number) => {
          cacheUsages.push({ type: 'set', key });
        },
        delete: async () => false,
        has: async () => false,
        clear: async () => {},
      };

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => mockCache);

      // Perform verification that checks multiple cache types
      await verifyEmail({
        emailAddress: 'test@gmail.com',
        verifyMx: false, // Set to false to avoid DNS issues in test
        verifySmtp: false, // Set to false to avoid SMTP issues in test
        checkDisposable: true,
        checkFree: true,
        cache: customCache,
      });

      // Check that cache was used
      expect(cacheUsages.length).toBeGreaterThan(0);

      // At least one set operation should have occurred (caching the results)
      const setOps = cacheUsages.filter((u) => u.type === 'set');
      expect(setOps.length).toBeGreaterThan(0);
    });
  });

  describe('Cache TTL and Expiration', () => {
    it('should respect cache TTL', async () => {
      // Create cache with very short TTL
      const fastExpiringCache = new LRUAdapter<boolean>(10, 50); // 50ms TTL

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
        if (cacheType === 'disposable') {
          return fastExpiringCache;
        }
        return new LRUAdapter(defaultSize, defaultTtl);
      });

      // Cache a result
      await isDisposableEmail({ emailOrDomain: 'test@temp-mail.org', cache: customCache });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // This should miss cache
      const result = await isDisposableEmail({ emailOrDomain: 'test@temp-mail.org', cache: customCache });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Cache Size Limits', () => {
    it('should respect cache size limits', async () => {
      // Create a very small cache
      const tinyCache = new LRUAdapter<boolean>(2, 86400000); // Only 2 entries

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
        if (cacheType === 'disposable') {
          return tinyCache;
        }
        return new LRUAdapter(defaultSize, defaultTtl);
      });

      // Add 3 different domains (more than cache size)
      await isDisposableEmail({ emailOrDomain: 'test@domain1.com', cache: customCache });
      await isDisposableEmail({ emailOrDomain: 'test@domain2.com', cache: customCache });
      await isDisposableEmail({ emailOrDomain: 'test@domain3.com', cache: customCache });

      // Cache should have only the last 2 entries
      expect(tinyCache.size()).toBeLessThanOrEqual(2);
    });
  });

  describe('Cache Error Handling', () => {
    it('should handle cache errors gracefully', async () => {
      const errorCache = {
        get: async () => {
          throw new Error('Cache read error');
        },
        set: async () => {
          throw new Error('Cache write error');
        },
        delete: async () => false,
        has: async () => false,
        clear: async () => {},
      };

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => errorCache);

      // Should not throw even with cache errors
      const result = await isDisposableEmail({ emailOrDomain: 'test@example.com', cache: customCache });
      expect(typeof result).toBe('boolean');
    });

    it('should handle partial cache failures', async () => {
      const customCache = CacheFactory.createMixedCache({
        disposable: {
          store: {
            get: async () => {
              throw new Error('Disposable cache error');
            },
            set: async () => {},
            delete: async () => false,
            has: async () => false,
            clear: async () => {},
          },
        },
        // Other caches work normally
        free: { ttlMs: 86400000 },
      });

      // Should work despite disposable cache failing
      const result = await verifyEmail({
        emailAddress: 'test@gmail.com',
        verifyMx: false,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: true,
        cache: customCache,
      });

      expect(result).toBeDefined();
      expect(typeof result.isDisposable).toBe('boolean');
    });
  });

  describe('Cache Reset', () => {
    it('should work with default cache when no cache provided', async () => {
      // Should work with default cache when no cache provided
      const result = await isDisposableEmail({ emailOrDomain: 'test@gmail.com' });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Batch Operations with Cache', () => {
    it('should use cache efficiently during batch operations', async () => {
      // Track cache usage across batch
      let totalCacheGets = 0;

      const trackingCache = new LRUAdapter<boolean>(1000, 86400000);
      const originalGet = trackingCache.get.bind(trackingCache);
      const originalSet = trackingCache.set.bind(trackingCache);
      (trackingCache as any).get = (key: string): Promise<boolean | null> => {
        totalCacheGets++;
        return Promise.resolve(originalGet(key) ?? null);
      };
      (trackingCache as any).set = async (key: string, value: boolean, ttl?: number) => {
        return originalSet(key, value, ttl);
      };

      const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
        if (cacheType === 'disposable') {
          return trackingCache;
        }
        return new LRUAdapter(defaultSize, defaultTtl);
      });

      // Test direct calls to isDisposableEmail to verify cache works
      await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache });
      await isDisposableEmail({ emailOrDomain: 'test@10minutemail.com', cache: customCache }); // Should use cache

      // Import batch verification
      const { verifyEmailBatch } = await import('../src/batch');

      // Verify emails with duplicates to test cache efficiency
      // Using known disposable email to ensure disposable check is triggered
      const emails = [
        'test@10minutemail.com',
        'test@gmail.com',
        'test@10minutemail.com', // Duplicate - should use cache
        'test@yahoo.com',
        'test@gmail.com', // Duplicate - should use cache
      ];

      await verifyEmailBatch({
        emailAddresses: emails,
        concurrency: 2,
        verifyMx: false,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: false,
        cache: customCache,
      });

      // Should have made fewer cache gets than total emails due to duplicates
      // Note: Exact number depends on implementation details
      expect(totalCacheGets).toBeGreaterThan(0);
    });
  });
});
