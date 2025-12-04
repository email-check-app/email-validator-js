/**
 * Example: Custom in-memory cache implementation
 * This demonstrates how to create a custom cache store with advanced features
 */

import { verifyEmail } from '../src';
import { setCustomCache } from '../src/cache';
import { LRUAdapter } from '../src/adapters/lru-adapter';
import type { ICache, ICacheStore } from '../src/cache-interface';
import { DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL } from '../src/cache-interface';

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
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
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

  get(key: string): T | null {
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

    // Move to end (LRU behavior)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.evictOldest();

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtl),
    });

    this.sets++;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  clear(): void {
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

async function setupCustomCache() {
  // Create custom cache instances with different configurations
  const customCache: ICache = {
    // SMTP cache: smaller size, shorter TTL
    smtp: new CustomMemoryCache(200, 1800000), // 30 minutes
    // MX cache: medium size, medium TTL
    mx: new CustomMemoryCache(300, 3600000), // 1 hour
    // Disposable cache: larger size, longer TTL
    disposable: new CustomMemoryCache(1500, 172800000), // 48 hours
    // Free cache: default size and TTL
    free: new CustomMemoryCache(DEFAULT_CACHE_SIZE.free, DEFAULT_CACHE_TTL.free),
    // Domain validation cache
    domainValid: new CustomMemoryCache(DEFAULT_CACHE_SIZE.domainValid, DEFAULT_CACHE_TTL.domainValid),
    // Domain suggestion cache
    domainSuggestion: new CustomMemoryCache(DEFAULT_CACHE_SIZE.domainSuggestion, DEFAULT_CACHE_TTL.domainSuggestion),
    // WHOIS cache
    whois: new CustomMemoryCache(DEFAULT_CACHE_SIZE.whois, DEFAULT_CACHE_TTL.whois),
  };

  // Set the custom cache globally
  setCustomCache(customCache);

  console.log('✅ Custom memory cache configured with statistics tracking');
}

async function demonstrateCacheUsage() {
  const testEmails = [
    'test@gmail.com',
    'user@yahoo.com',
    'admin@disposable-temp-email.com',
    'test@gmail.com', // This should hit the cache
    'another@example.org',
  ];

  console.log('\n🔍 Verifying emails with custom memory cache...\n');

  const smtpCache = new CustomMemoryCache<boolean | null>(200, 1800000);

  for (const email of testEmails) {
    console.log(`\n📧 Verifying: ${email}`);

    const result = await verifyEmail({
      emailAddress: email,
      verifyMx: true,
      verifySmtp: false, // Set to false for this example
      checkDisposable: true,
      checkFree: true,
      debug: false,
    });

    console.log(`Result:`, {
      valid: result.validFormat && result.validMx,
      disposable: result.isDisposable,
      freeProvider: result.isFree,
      cached: result.metadata?.cached,
    });

    // Show cache statistics after each verification
    if (result.metadata?.cached) {
      console.log('📈 Cache hit!');
    }
  }

  // Get cache statistics
  const mxCache = new CustomMemoryCache<string[]>(300, 3600000);
  console.log('\n📊 Final Cache Statistics:');
  console.log('  MX Cache:', mxCache.getStats());
  console.log('  SMTP Cache:', smtpCache.getStats());
}

async function testDirectCacheOperations() {
  console.log('\n🧪 Testing direct cache operations...\n');

  const testCache = new CustomMemoryCache<string>(10, 5000); // 5 second TTL

  // Test basic operations
  console.log('Setting key1 -> value1');
  testCache.set('key1', 'value1');

  console.log('Getting key1:', testCache.get('key1'));
  console.log('Has key1:', testCache.has('key1'));
  console.log('Cache size:', testCache.size());
  console.log('Cache stats:', testCache.getStats());

  // Test TTL
  console.log('\nWaiting 6 seconds for TTL to expire...');
  await new Promise((resolve) => setTimeout(resolve, 6000));

  console.log('Getting key1 after TTL:', testCache.get('key1'));
  console.log('Cache stats after TTL:', testCache.getStats());
}

async function main() {
  try {
    console.log('🚀 Setting up custom memory cache for email validation...\n');
    await setupCustomCache();

    console.log('\n📊 Demonstrating cache usage...\n');
    await demonstrateCacheUsage();

    console.log('\n🧪 Testing direct cache operations...\n');
    await testDirectCacheOperations();

    console.log('\n✨ Example completed successfully!');
    console.log('\n📝 Key points:');
    console.log('  • Custom cache can implement advanced features');
    console.log('  • Statistics tracking helps monitor cache performance');
    console.log('  • LRU eviction prevents memory leaks');
    console.log('  • TTL-based expiration keeps data fresh');
    console.log('  • Configurable sizes and TTLs per cache type');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the example
if (require.main === module) {
  main();
}
