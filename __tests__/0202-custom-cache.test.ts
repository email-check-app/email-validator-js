import { LRUAdapter } from '../src/adapters/lru-adapter';
import { DEFAULT_CACHE_OPTIONS } from '../src/cache';
import type { ICache } from '../src/cache-interface';
import { isDisposableEmail, isFreeEmail } from '../src/index';
import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from '../src/types';

describe('0202 Custom Cache', () => {
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
        smtpPort: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
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
        disposable: new LRUAdapter<DisposableEmailResult>(5, 60000),
        free: new LRUAdapter<FreeEmailResult>(5, 60000),
        domainValid: new LRUAdapter<DomainValidResult>(5, 60000),
        smtp: new LRUAdapter<SmtpVerificationResult>(5, 60000),
        smtpPort: new LRUAdapter<number>(5, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(5, 60000),
        whois: new LRUAdapter<any>(5, 60000),
      };

      // Test with custom cache
      const isDisposable = await isDisposableEmail({
        emailOrDomain: '10minutemail.com',
        cache: customCache,
      });
      expect(isDisposable).toBe(true);

      const isFree = await isFreeEmail({
        emailOrDomain: 'gmail.com',
        cache: customCache,
      });
      expect(isFree).toBe(true);

      // Verify data is in custom cache (functions populate cache with rich result types)
      const cachedDisposable = await customCache.disposable.get('10minutemail.com');
      expect(cachedDisposable).toBeTruthy();
      expect(
        cachedDisposable && typeof cachedDisposable === 'object' && 'isDisposable' in cachedDisposable
          ? cachedDisposable.isDisposable
          : false
      ).toBe(true);
      const cachedFree = await customCache.free.get('gmail.com');
      expect(cachedFree).toBeTruthy();
      expect(cachedFree && typeof cachedFree === 'object' && 'isFree' in cachedFree ? cachedFree.isFree : false).toBe(
        true
      );
    });
  });

  describe('Cache Isolation', () => {
    it('should isolate cache instances', async () => {
      const cache1: ICache = {
        mx: new LRUAdapter<string[]>(10, 60000),
        disposable: new LRUAdapter<DisposableEmailResult>(10, 60000),
        free: new LRUAdapter<FreeEmailResult>(10, 60000),
        domainValid: new LRUAdapter<DomainValidResult>(10, 60000),
        smtp: new LRUAdapter<SmtpVerificationResult>(10, 60000),
        smtpPort: new LRUAdapter<number>(10, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(10, 60000),
        whois: new LRUAdapter<any>(10, 60000),
      };

      const cache2: ICache = {
        mx: new LRUAdapter<string[]>(10, 60000),
        disposable: new LRUAdapter<DisposableEmailResult>(10, 60000),
        free: new LRUAdapter<FreeEmailResult>(10, 60000),
        domainValid: new LRUAdapter<DomainValidResult>(10, 60000),
        smtp: new LRUAdapter<SmtpVerificationResult>(10, 60000),
        smtpPort: new LRUAdapter<number>(10, 60000),
        domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(10, 60000),
        whois: new LRUAdapter<any>(10, 60000),
      };

      // Store different values in each cache (must use rich result types)
      await cache1.disposable.set('test.com', { isDisposable: true, checkedAt: Date.now() });
      await cache2.disposable.set('test.com', { isDisposable: false, checkedAt: Date.now() });

      // Verify caches are isolated
      expect(await cache1.disposable.get('test.com')).toEqual({ isDisposable: true, checkedAt: expect.any(Number) });
      expect(await cache2.disposable.get('test.com')).toEqual({ isDisposable: false, checkedAt: expect.any(Number) });
    });
  });
});
