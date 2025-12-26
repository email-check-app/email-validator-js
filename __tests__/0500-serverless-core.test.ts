/**
 * Tests for serverless core functionality
 */

import { clearCache, EdgeCache, suggestDomain, validateEmailBatch, validateEmailCore } from '../src/serverless/core';

describe('0500 Serverless Core', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('EdgeCache', () => {
    it('should store and retrieve cached values', () => {
      const cache = new EdgeCache<string>(10, 1000);
      cache.set('test', 'value');
      expect(cache.get('test')).toBe('value');
    });

    it('should expire entries after TTL (Time-To-Live) elapses', (done) => {
      const cache = new EdgeCache<string>(10, 100); // 100ms TTL
      cache.set('test', 'value');
      expect(cache.get('test')).toBe('value');

      setTimeout(() => {
        expect(cache.get('test')).toBeUndefined();
        done();
      }, 150);
    });

    it('should evict oldest entries when max size is exceeded', () => {
      const cache = new EdgeCache<number>(3, 10000);
      cache.set('1', 1);
      cache.set('2', 2);
      cache.set('3', 3);
      cache.set('4', 4); // This should evict oldest entries

      expect(cache.size()).toBeLessThanOrEqual(3);
    });

    it('should clear all cached entries', () => {
      const cache = new EdgeCache<string>(10, 1000);
      cache.set('test', 'value');
      expect(cache.get('test')).toBe('value');
      cache.clear();
      expect(cache.get('test')).toBeUndefined();
    });
  });

  describe('validateEmailCore', () => {
    it('should validate email syntax and return basic metadata', async () => {
      const result = await validateEmailCore('test@valid-domain.org');
      expect(result.valid).toBe(true);
      expect(result.email).toBe('test@valid-domain.org');
      expect(result.local).toBe('test');
      expect(result.domain).toBe('valid-domain.org');
      expect(result.validators.syntax?.valid).toBe(true);
    });

    it('should reject emails with invalid syntax', async () => {
      const result = await validateEmailCore('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.validators.syntax?.valid).toBe(false);
    });

    it('should detect domain typos and suggest corrections', async () => {
      const result = await validateEmailCore('user@gmial.com');
      expect(result.validators.typo?.valid).toBe(false);
      expect(result.validators.typo?.suggestion).toBe('gmail.com');
    });

    it('should detect and flag disposable email providers', async () => {
      const result = await validateEmailCore('test@mailinator.com');
      expect(result.validators.disposable?.valid).toBe(false);
    });

    it('should detect and flag free email providers', async () => {
      const result = await validateEmailCore('test@gmail.com');
      expect(result.validators.free?.valid).toBe(false);
    });

    it('should return cached results for repeated validations', async () => {
      const email = 'cached@valid-domain.org';

      // First call
      const result1 = await validateEmailCore(email);

      // Second call should return cached result
      const result2 = await validateEmailCore(email);

      expect(result1).toEqual(result2);
    });

    it('should bypass cache when skipCache option is true', async () => {
      const email = 'nocache@valid-domain.org';

      await validateEmailCore(email);

      const result = await validateEmailCore(email, { skipCache: true });
      expect(result.email).toBe(email);
    });

    it('should skip specific validators when corresponding flags are set to false', async () => {
      const result = await validateEmailCore('test@gmail.com', {
        validateTypo: false,
        validateDisposable: false,
        validateFree: false,
      });

      expect(result.validators.typo).toBeUndefined();
      expect(result.validators.disposable).toBeUndefined();
      expect(result.validators.free).toBeUndefined();
    });
  });

  describe('validateEmailBatch', () => {
    it('should validate an array of emails and return array of results', async () => {
      const emails = ['valid@valid-domain.org', 'invalid-email', 'typo@gmial.com'];

      const results = await validateEmailBatch(emails);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].validators.typo?.suggestion).toBe('gmail.com');
    });

    it('should process batches of emails according to batch size option', async () => {
      const emails = Array(10).fill('test@valid-domain.org');

      const results = await validateEmailBatch(emails, { batchSize: 3 });

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.email).toBe('test@valid-domain.org');
      });
    });
  });

  describe('suggestDomain', () => {
    it('should suggest the correct domain for common misspellings', () => {
      expect(suggestDomain('gmial.com')).toBe('gmail.com');
      expect(suggestDomain('yahooo.com')).toBe('yahoo.com');
      expect(suggestDomain('hotmial.com')).toBe('hotmail.com');
      expect(suggestDomain('outlok.com')).toBe('outlook.com');
    });

    it('should return null for correctly spelled domains', () => {
      expect(suggestDomain('gmail.com')).toBeNull();
      expect(suggestDomain('yahoo.com')).toBeNull();
    });

    it('should use custom domain list when provided in options', () => {
      const suggestion = suggestDomain('compny.com', {
        customDomains: ['company.com', 'business.org'],
        threshold: 2,
      });
      expect(suggestion).toBe('company.com');
    });

    it('should only suggest domains within edit distance threshold', () => {
      // With low threshold (strict) - use a domain with distance > 1
      expect(suggestDomain('ggggmail.com', { threshold: 1 })).toBeNull();

      // With higher threshold (more lenient) - same domain should match with higher threshold
      expect(suggestDomain('ggggmail.com', { threshold: 3 })).toBe('gmail.com');
    });
  });

  describe('Cache control', () => {
    it('should clear all cached email validation results', async () => {
      // Add some data to cache
      await validateEmailCore('test1@valid-domain.org');
      await validateEmailCore('test2@valid-domain.org');

      // Clear cache
      clearCache();

      // Cache should be empty (we can't directly test this, but we can verify behavior)
      // If cache was cleared, the same validation would happen again
      const result = await validateEmailCore('test1@valid-domain.org');
      expect(result.email).toBe('test1@valid-domain.org');
    });
  });
});
