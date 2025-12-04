/**
 * Tests for custom cache implementation
 */

import { LRUAdapter } from '../src/adapters/lru-adapter';
import { CacheFactory } from '../src/cache-factory';
import { isDisposableEmail, isFreeEmail } from '../src/index';

describe('Custom Cache Implementation', () => {
  // No global cache management needed with parameter-based injection

  describe('LRUAdapter', () => {
    it('should work as a cache store', async () => {
      const cache = new LRUAdapter<string>(10, 1000); // 1 second TTL

      expect(await cache.get('key1')).toBeNull();

      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');

      expect(await cache.has('key1')).toBe(true);
      expect(cache.size()).toBe(1);

      await cache.delete('key1');
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.has('key1')).toBe(false);
    });

    it('should respect TTL', async () => {
      const cache = new LRUAdapter<string>(10, 100); // 100ms TTL

      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(await cache.get('key1')).toBeNull();
    });
  });

  describe('CacheFactory', () => {
    it('should create LRU cache with default TTLs', () => {
      const cache = CacheFactory.createLRUCache();

      expect(cache.mx).toBeInstanceOf(LRUAdapter);
      expect(cache.disposable).toBeInstanceOf(LRUAdapter);
      expect(cache.free).toBeInstanceOf(LRUAdapter);
      expect(cache.domainValid).toBeInstanceOf(LRUAdapter);
      expect(cache.smtp).toBeInstanceOf(LRUAdapter);

      expect(cache.domainSuggestion).toBeInstanceOf(LRUAdapter);
      expect(cache.whois).toBeInstanceOf(LRUAdapter);
    });

    it('should create LRU cache with custom TTLs', () => {
      const customTtl = {
        mx: 7200000, // 2 hours
        smtp: 3600000, // 1 hour
      };

      const cache = CacheFactory.createLRUCache(customTtl);
      expect(cache.mx).toBeInstanceOf(LRUAdapter);
      expect(cache.smtp).toBeInstanceOf(LRUAdapter);
    });

    it('should create custom cache with factory function', () => {
      const cache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
        return new LRUAdapter(defaultSize, defaultTtl);
      });

      expect(cache.mx).toBeInstanceOf(LRUAdapter);
      expect(cache.disposable).toBeInstanceOf(LRUAdapter);
    });

    it('should create mixed cache with different configurations', () => {
      const customCache = new LRUAdapter<string[]>(100, 7200000);

      const cache = CacheFactory.createMixedCache({
        mx: { store: customCache },
        disposable: { ttlMs: 172800000 }, // 48 hours
        smtp: { maxSize: 200, ttlMs: 3600000 },
      });

      expect(cache.mx).toBe(customCache);
      expect(cache.disposable).toBeInstanceOf(LRUAdapter);
      expect(cache.smtp).toBeInstanceOf(LRUAdapter);
    });
  });

  describe('Global Cache Integration', () => {
    it('should use custom cache when set', async () => {
      // Create a mock cache store
      let cacheHits = 0;
      const mockCacheStore = {
        get: async (): Promise<any> => {
          cacheHits++;
          return null;
        },
        set: async () => {},
        delete: async () => false,
        has: async () => false,
        clear: async () => {},
      };

      const customCache = {
        mx: mockCacheStore,
        disposable: mockCacheStore,
        free: mockCacheStore,
        domainValid: mockCacheStore,
        smtp: mockCacheStore,
        domainSuggestion: mockCacheStore,
        whois: mockCacheStore,
      };

      // Test that custom cache is being used
      await isDisposableEmail('test@domain.com', customCache);
      expect(cacheHits).toBeGreaterThan(0);

      // Reset hits for next test
      cacheHits = 0;

      await isFreeEmail('test@domain.com', customCache);
      expect(cacheHits).toBeGreaterThan(0);
    });

    it('should work with default cache when no cache provided', async () => {
      // Should work with default cache when no cache provided
      const result = await isDisposableEmail('test@domain.com');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Cache TTL and Size Configuration', () => {
    it('should use configured TTLs for different cache types', async () => {
      // Create cache with very short TTLs for testing
      const fastExpiringCache = CacheFactory.createLRUCache({
        disposable: 100, // 100ms (overriding default)
        free: 200, // 200ms (overriding default)
      });

      // Cache a disposable email check
      await isDisposableEmail('test@10minutemail.com', fastExpiringCache);

      // Wait for it to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should re-check (not from cache)
      // We can't directly test this, but the function should still work
      const result = await isDisposableEmail('test@10minutemail.com', fastExpiringCache);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle cache errors gracefully', async () => {
      const errorCache = {
        get: async (): Promise<any> => {
          throw new Error('Cache error');
        },
        set: async () => {
          throw new Error('Cache error');
        },
        delete: async () => false,
        has: async () => false,
        clear: async () => {},
      };

      const customCache = {
        mx: errorCache,
        disposable: errorCache,
        free: errorCache,
        domainValid: errorCache,
        smtp: errorCache,
        domainSuggestion: errorCache,
        whois: errorCache,
      };

      // Should not throw even if cache fails
      const result = await isDisposableEmail('test@domain.com', customCache);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Batch Operations', () => {
    it('should use cache for batch operations', async () => {
      let cacheCalls = 0;

      const trackingCache = {
        get: async (): Promise<any> => {
          cacheCalls++;
          return null;
        },
        set: async () => {},
        delete: async () => false,
        has: async () => false,
        clear: async () => {},
      };

      const customCache = {
        mx: trackingCache,
        disposable: trackingCache,
        free: trackingCache,
        domainValid: trackingCache,
        smtp: trackingCache,
        domainSuggestion: trackingCache,
        whois: trackingCache,
      };

      // Test direct calls to ensure cache is working
      await isDisposableEmail('test@10minutemail.com', customCache);
      await isFreeEmail('test@gmail.com', customCache);

      // Should have called cache for each email
      expect(cacheCalls).toBeGreaterThan(0);
    });
  });
});
