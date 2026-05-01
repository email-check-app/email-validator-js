/**
 * Cache test suite — uses fake-net (no sinon).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Cache } from '../../src';
import { isDisposableEmail, isFreeEmail, isValidEmailDomain, LRUAdapter } from '../../src';
import { clearDefaultCache, DEFAULT_CACHE_OPTIONS, getDefaultCache } from '../../src/cache';
import { resolveMxRecords } from '../../src/mx-resolver';
import type {
  DisposableEmailResult,
  DomainValidResult,
  FreeEmailResult,
  SmtpVerificationResult,
} from '../../src/types';
import { fakeNet } from '../helpers/fake-net';

describe('0200 Cache', () => {
  let testCache: Cache;

  beforeEach(() => {
    fakeNet.reset();
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
      whois: new LRUAdapter(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
    };
    clearDefaultCache();
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  describe('MX Records Cache', () => {
    it('should cache MX records lookup', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx1.example.com', priority: 10 }]);

      const result1 = await resolveMxRecords({ domain: 'example.com', cache: testCache });
      expect(fakeNet.mxCalls.filter((d) => d === 'example.com').length).toBe(1);
      expect(result1).toEqual(['mx1.example.com']);

      const result2 = await resolveMxRecords({ domain: 'example.com', cache: testCache });
      expect(fakeNet.mxCalls.filter((d) => d === 'example.com').length).toBe(1); // still 1, cache hit
      expect(result2).toEqual(['mx1.example.com']);
    });

    it('should cache failed MX lookups as empty array', async () => {
      fakeNet.setMxErrorForDomain('invalid.com', new Error('DNS failed'));

      try {
        await resolveMxRecords({ domain: 'invalid.com', cache: testCache });
        expect(true).toBe(false);
      } catch {
        expect(fakeNet.mxCalls.filter((d) => d === 'invalid.com').length).toBe(1);
      }

      const result = await resolveMxRecords({ domain: 'invalid.com', cache: testCache });
      expect(fakeNet.mxCalls.filter((d) => d === 'invalid.com').length).toBe(1); // cached failure
      expect(result).toEqual([]);
    });
  });

  describe('Disposable Email Cache', () => {
    it('should cache disposable email checks', async () => {
      const result1 = await isDisposableEmail({ emailOrDomain: '10minutemail.com', cache: testCache });
      expect(result1).toBe(true);

      const result2 = await isDisposableEmail({ emailOrDomain: '10minutemail.com', cache: testCache });
      expect(result2).toBe(true);
    });

    it('should cache non-disposable email checks', async () => {
      const result1 = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result1).toBe(false);

      const result2 = await isDisposableEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result2).toBe(false);
    });
  });

  describe('Free Email Cache', () => {
    it('should cache free email checks', async () => {
      const result1 = await isFreeEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result1).toBe(true);

      const result2 = await isFreeEmail({ emailOrDomain: 'gmail.com', cache: testCache });
      expect(result2).toBe(true);
    });

    it('should cache non-free email checks', async () => {
      const result1 = await isFreeEmail({ emailOrDomain: 'custom-business.com', cache: testCache });
      expect(result1).toBe(false);

      const result2 = await isFreeEmail({ emailOrDomain: 'custom-business.com', cache: testCache });
      expect(result2).toBe(false);
    });
  });

  describe('Domain Validation Cache', () => {
    it('should cache domain validation checks', async () => {
      const result1 = await isValidEmailDomain('example.com', testCache);
      expect(result1).toBe(true);

      const result2 = await isValidEmailDomain('example.com', testCache);
      expect(result2).toBe(true);
    });

    it('should cache invalid domain checks', async () => {
      const result1 = await isValidEmailDomain('invalid..domain', testCache);
      expect(result1).toBe(false);

      const result2 = await isValidEmailDomain('invalid..domain', testCache);
      expect(result2).toBe(false);
    });
  });

  describe('Default Cache', () => {
    it('should return the same cache instance (singleton)', () => {
      const cache1 = getDefaultCache();
      const cache2 = getDefaultCache();
      expect(cache1).toBe(cache2);
    });

    it('should clear all cache stores', () => {
      const defaultCache = getDefaultCache();

      defaultCache.mx.set('test.com', ['mx1.test.com']);
      defaultCache.disposable.set('test.com', { isDisposable: true, checkedAt: Date.now() });
      defaultCache.free.set('test.com', { isFree: false, checkedAt: Date.now() });

      expect(defaultCache.mx.get('test.com')).toEqual(['mx1.test.com']);
      const disposableResult = defaultCache.disposable.get('test.com');
      expect(disposableResult && 'isDisposable' in disposableResult && disposableResult.isDisposable).toBe(true);
      const freeResult = defaultCache.free.get('test.com');
      expect(freeResult && 'isFree' in freeResult && freeResult.isFree).toBe(false);

      clearDefaultCache();

      expect(defaultCache.mx.get('test.com')).toBeNull();
      expect(defaultCache.disposable.get('test.com')).toBeNull();
      expect(defaultCache.free.get('test.com')).toBeNull();
    });
  });

  describe('Cache Without Explicit Parameter', () => {
    it('should use default cache when no cache is provided', async () => {
      fakeNet.setMxRecords('default-cache-test.com', [{ exchange: 'mx1.example.com', priority: 10 }]);

      const result1 = await resolveMxRecords({ domain: 'default-cache-test.com' });
      expect(fakeNet.mxCalls.filter((d) => d === 'default-cache-test.com').length).toBe(1);
      expect(result1).toEqual(['mx1.example.com']);

      const result2 = await resolveMxRecords({ domain: 'default-cache-test.com' });
      expect(fakeNet.mxCalls.filter((d) => d === 'default-cache-test.com').length).toBe(1); // cached
      expect(result2).toEqual(['mx1.example.com']);
    });
  });
});
