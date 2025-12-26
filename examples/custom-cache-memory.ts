/**
 * Example: Custom in-memory cache implementation
 * This demonstrates how to create a custom cache store with advanced features
 */

import { getDefaultCache, verifyEmail } from '../src';
import { DEFAULT_CACHE_OPTIONS } from '../src/cache';
import type { ICache, ICacheStore } from '../src/cache-interface';
import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from '../src/types';

/**
 * Custom in-memory cache with time-based expiration and statistics
 */
class CustomMemoryCache<T> implements ICacheStore<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private maxSize: number;
  private defaultTtl: number;
  private hits = 0;
  private misses = 0;
  private sets = 0;

  constructor(maxSize: number = 1000, defaultTtlMs: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtlMs;

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  private cleanup(): void {
    const now = Date.now();
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    });
  }

  private isExpired(entry: { expiresAt: number }): boolean {
    return Date.now() > entry.expiresAt;
  }

  private evictOldest(): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  async get(key: string): Promise<T | null> {
    this.cleanup();
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    this.cleanup();
    this.evictOldest();

    const ttl = ttlMs || this.defaultTtl;
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, { value, expiresAt });
    this.sets++;
  }

  async delete(key: string): Promise<boolean> {
    this.cleanup();
    return this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    this.cleanup();
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
  }

  size(): number {
    this.cleanup(); // Clean expired before returning size
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.size(),
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      hitRate: this.hits / (this.hits + this.misses) || 0,
    };
  }

  getAllKeys(): string[] {
    this.cleanup();
    return Array.from(this.cache.keys());
  }
}

function createCustomCache(): ICache {
  // Create custom cache instances with different configurations
  const customCache: ICache = {
    // SMTP cache: smaller size, shorter TTL
    smtp: new CustomMemoryCache<SmtpVerificationResult>(200, DEFAULT_CACHE_OPTIONS.ttl.smtp),
    // SMTP port cache: small size, longer TTL for port performance
    smtpPort: new CustomMemoryCache<number>(100, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
    // MX cache: medium size, medium TTL
    mx: new CustomMemoryCache<string[]>(300, DEFAULT_CACHE_OPTIONS.ttl.mx),
    // Disposable cache: larger size, longer TTL
    disposable: new CustomMemoryCache<DisposableEmailResult>(1500, DEFAULT_CACHE_OPTIONS.ttl.disposable),
    // Free cache: default size and TTL
    free: new CustomMemoryCache<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
    // Domain validation cache
    domainValid: new CustomMemoryCache<DomainValidResult>(
      DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
      DEFAULT_CACHE_OPTIONS.ttl.domainValid
    ),
    // Domain suggestion cache
    domainSuggestion: new CustomMemoryCache<{ suggested: string; confidence: number } | null>(
      DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
      DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
    ),
    // WHOIS cache
    whois: new CustomMemoryCache<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
  };

  return customCache;
}

async function demonstrateDefaultCache() {
  const testEmails = [
    'test@gmail.com',
    'user@yahoo.com',
    'test@gmail.com', // Duplicate to test cache hit
  ];

  console.log('\n📧 Testing email verification with default cache...\n');

  // Verify emails with default cache (no cache parameter needed)
  for (const email of testEmails) {
    try {
      console.log(`Verifying: ${email}`);
      const result = await verifyEmail({
        emailAddress: email,
        verifySmtp: false, // Skip SMTP for faster demo
        debug: true,
      });

      console.log(`  Valid format: ${result.validFormat}`);
      console.log(`  Valid MX: ${result.validMx}`);
      console.log(`  Is disposable: ${result.isDisposable}`);
      console.log(`  Is free: ${result.isFree}`);
      console.log('');
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
    }
  }

  // Show that default cache is a singleton
  const defaultCache1 = getDefaultCache();
  const defaultCache2 = getDefaultCache();
  console.log('Default cache is singleton:', defaultCache1 === defaultCache2);
}

async function demonstrateCustomCache() {
  const testEmails = ['admin@outlook.com', 'invalid@nonexistentdomain12345.com'];

  console.log('\n📧 Testing email verification with custom cache...\n');

  // Create custom cache
  const customCache = createCustomCache();

  // Verify emails with custom cache
  for (const email of testEmails) {
    try {
      console.log(`Verifying: ${email}`);
      const result = await verifyEmail({
        emailAddress: email,
        verifySmtp: false, // Skip SMTP for faster demo
        cache: customCache, // Pass cache directly
        debug: true,
      });

      console.log(`  Valid format: ${result.validFormat}`);
      console.log(`  Valid MX: ${result.validMx}`);
      console.log(`  Is disposable: ${result.isDisposable}`);
      console.log(`  Is free: ${result.isFree}`);
      console.log('');
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
    }
  }

  // Show cache statistics for each cache type
  console.log('\n📊 Cache Statistics:');
  const cacheStats = {
    smtp: (customCache.smtp as CustomMemoryCache<SmtpVerificationResult>).getStats(),
    mx: (customCache.mx as CustomMemoryCache<string[]>).getStats(),
    disposable: (customCache.disposable as CustomMemoryCache<DisposableEmailResult>).getStats(),
    free: (customCache.free as CustomMemoryCache<FreeEmailResult>).getStats(),
    domainValid: (customCache.domainValid as CustomMemoryCache<DomainValidResult>).getStats(),
  };

  for (const [type, stats] of Object.entries(cacheStats)) {
    console.log(`\n${type.toUpperCase()} Cache:`);
    console.log(`  Size: ${stats.size} entries`);
    console.log(`  Hits: ${stats.hits}`);
    console.log(`  Misses: ${stats.misses}`);
    console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
  }

  // Test cache clearing
  console.log('\n🔄 Testing cache clear...');
  await customCache.disposable.clear();
  console.log(
    'Disposable cache cleared. New size:',
    (customCache.disposable as CustomMemoryCache<DisposableEmailResult>).size()
  );
}

// Run the demonstrations
async function runAll() {
  await demonstrateDefaultCache();
  await demonstrateCustomCache();
}

runAll().catch(console.error);
