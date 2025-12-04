/**
 * Example: Using Redis as custom cache backend
 * This demonstrates how to configure the email validator with Redis cache
 */

import { verifyEmail } from '../src';
import { RedisAdapter } from '../src/adapters/redis-adapter';
import { DEFAULT_CACHE_OPTIONS } from '../src/cache';
import type { ICache } from '../src/cache-interface';

// Example Redis client (you would use your actual Redis client here)
// This example assumes you have a Redis client that implements the IRedisClient interface
interface SimpleRedisClient {
  get(key: string): Promise<string | null>;

  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;

  del(key: string): Promise<number>;

  exists(key: string): Promise<number>;

  flushdb(): Promise<string>;
}

// Create a mock Redis client for demonstration
// In production, you would use a real Redis client like 'redis' or 'ioredis'
const mockRedisClient: SimpleRedisClient = {
  async get(key: string): Promise<string | null> {
    console.log(`[Redis] GET ${key}`);
    // In real implementation, this would fetch from Redis
    return null;
  },
  async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
    console.log(`[Redis] SET ${key} ${mode ? mode + ' ' : ''}${duration ? duration + 's ' : ''}`);
    // In real implementation, this would store in Redis
    return 'OK';
  },
  async del(key: string): Promise<number> {
    console.log(`[Redis] DEL ${key}`);
    return 1;
  },
  async exists(key: string): Promise<number> {
    console.log(`[Redis] EXISTS ${key}`);
    return 0;
  },
  async flushdb(): Promise<string> {
    console.log('[Redis] FLUSHDB');
    return 'OK';
  },
};

function createRedisCache(): ICache {
  // Create Redis cache with custom configuration
  const redisCache: ICache = {
    // SMTP cache: shorter TTL for SMTP verification results
    smtp: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:smtp:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.smtp,
    }),
    // MX cache: medium TTL for MX records
    mx: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:mx:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.mx,
    }),
    // Disposable email cache: longer TTL
    disposable: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:disposable:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.disposable,
    }),
    // Free email cache: longer TTL
    free: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:free:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.free,
    }),
    // Domain validation cache: longer TTL
    domainValid: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:domain:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.domainValid,
    }),
    // Domain suggestion cache: longer TTL
    domainSuggestion: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:suggest:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion,
    }),
    // WHOIS cache: shorter TTL for WHOIS data
    whois: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:whois:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.whois,
    }),
  };

  return redisCache;
}

async function demonstrateDefaultCache() {
  const testEmails = [
    'user@gmail.com',
    'test@yahoo.com',
    'user@gmail.com', // Duplicate to test cache hit
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
}

async function demonstrateRedisCache() {
  const testEmails = ['admin@outlook.com', 'info@nonexistent-domain.xyz'];

  console.log('\n📧 Testing email verification with Redis cache...\n');

  // Create Redis cache
  const redisCache = createRedisCache();

  // Verify emails with Redis cache
  for (const email of testEmails) {
    try {
      console.log(`Verifying: ${email}`);
      const result = await verifyEmail({
        emailAddress: email,
        verifySmtp: false, // Skip SMTP for faster demo
        cache: redisCache, // Pass cache directly
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

  // Demonstrate cache management
  console.log('\n🔧 Demonstrating cache management...\n');

  // Clear specific cache type
  console.log('Clearing disposable email cache...');
  await redisCache.disposable.clear();
  console.log('Disposable cache cleared.\n');

  // Check cache size (note: Redis returns undefined for size)
  console.log('Cache sizes:');
  console.log(`  SMTP: ${redisCache.smtp.size?.() || 'N/A (Redis)'}`);
  console.log(`  MX: ${redisCache.mx.size?.() || 'N/A (Redis)'}`);
  console.log(`  Disposable: ${redisCache.disposable.size?.() || 'N/A (Redis)'}`);
  console.log(`  Free: ${redisCache.free.size?.() || 'N/A (Redis)'}`);
}

// Run the demonstrations
async function runAll() {
  await demonstrateDefaultCache();
  await demonstrateRedisCache();
}

runAll().catch(console.error);
