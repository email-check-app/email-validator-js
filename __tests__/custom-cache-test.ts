import { LRUAdapter } from '../src/adapters/lru-adapter';
import { DEFAULT_CACHE_OPTIONS } from '../src/cache';
import type { ICache } from '../src/cache-interface';
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

  describe('Custom Cache Creation', () => {
    it('should create cache with LRU adapters', () => {
      const cache: ICache = {
        mx: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
        disposable: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.disposable, DEFAULT_CACHE_OPTIONS.ttl.disposable),
        free: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
        domainValid: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.domainValid, DEFAULT_CACHE_OPTIONS.ttl.domainValid),
        smtp: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.smtp, DEFAULT_CACHE_OPTIONS.ttl.smtp),
        domainSuggestion: new LRUAdapter(
          DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
          DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
        ),
        whois: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
      };

      expect(cache.mx).toBeInstanceOf(LRUAdapter);
      expect(cache.disposable).toBeInstanceOf(LRUAdapter);
      expect(cache.free).toBeInstanceOf(LRUAdapter);
      expect(cache.domainValid).toBeInstanceOf(LRUAdapter);
      expect(cache.smtp).toBeInstanceOf(LRUAdapter);
      expect(cache.domainSuggestion).toBeInstanceOf(LRUAdapter);
      expect(cache.whois).toBeInstanceOf(LRUAdapter);
    });

    it('should work with custom cache instances', async () => {
      const customCache: ICache = {
        mx: new LRUAdapter<string[]>(5, 60000), // 1 minute
        disposable: new LRUAdapter<boolean>(5, 60000),
        free: new LRUAdapter<boolean>(5, 60000),
        domainValid: new LRUAdapter<boolean>(5, 60000),
        smtp: new LRUAdapter<boolean | null>(5, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(5, 60000),
        whois: new LRUAdapter<any>(5, 60000),
      };

      // Test with custom cache
      const disposableResult = await isDisposableEmail({
        emailOrDomain: '10minutemail.com',
        cache: customCache,
      });
      expect(disposableResult).toBe(true);

      const freeResult = await isFreeEmail({
        emailOrDomain: 'gmail.com',
        cache: customCache,
      });
      expect(freeResult).toBe(true);

      // Verify data is in custom cache
      expect(await customCache.disposable.get('10minutemail.com')).toBe(true);
      expect(await customCache.free.get('gmail.com')).toBe(true);
    });
  });

  describe('Cache Isolation', () => {
    it('should isolate cache instances', async () => {
      const cache1: ICache = {
        mx: new LRUAdapter<string[]>(10, 60000),
        disposable: new LRUAdapter<boolean>(10, 60000),
        free: new LRUAdapter<boolean>(10, 60000),
        domainValid: new LRUAdapter<boolean>(10, 60000),
        smtp: new LRUAdapter<boolean | null>(10, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(10, 60000),
        whois: new LRUAdapter<any>(10, 60000),
      };

      const cache2: ICache = {
        mx: new LRUAdapter<string[]>(10, 60000),
        disposable: new LRUAdapter<boolean>(10, 60000),
        free: new LRUAdapter<boolean>(10, 60000),
        domainValid: new LRUAdapter<boolean>(10, 60000),
        smtp: new LRUAdapter<boolean | null>(10, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(10, 60000),
        whois: new LRUAdapter<any>(10, 60000),
      };

      // Store different values in each cache
      await cache1.disposable.set('test.com', true);
      await cache2.disposable.set('test.com', false);

      // Verify caches are isolated
      expect(await cache1.disposable.get('test.com')).toBe(true);
      expect(await cache2.disposable.get('test.com')).toBe(false);
    });
  });
});
