/**
 * Example: Using Redis as custom cache backend
 * This demonstrates how to configure the email validator with Redis cache
 */

import { verifyEmail } from '../../src';
// Mock Redis client for demonstration. In production, plug in `ioredis` or
// the official `redis` package — both implement this surface.
import type { RedisClient } from '../../src/adapters/redis-adapter';
import { RedisAdapter } from '../../src/adapters/redis-adapter';
import { DEFAULT_CACHE_OPTIONS } from '../../src/cache';
import type { Cache } from '../../src/cache-interface';

const mockRedisClient: RedisClient = {
  async get(key: string): Promise<string | null> {
    console.log(`[Redis] GET ${key}`);
    return null;
  },
  async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
    console.log(`[Redis] SET ${key} ${mode ? `${mode} ` : ''}${duration ? `${duration}s ` : ''}`);
    return 'OK';
  },
  async del(key: string | string[]): Promise<number> {
    console.log(`[Redis] DEL ${Array.isArray(key) ? key.join(' ') : key}`);
    return Array.isArray(key) ? key.length : 1;
  },
  async exists(key: string): Promise<number> {
    console.log(`[Redis] EXISTS ${key}`);
    return 0;
  },
  async scan(cursor: string | number, ..._args: Array<string | number>): Promise<[string, string[]]> {
    console.log(`[Redis] SCAN ${cursor} ${_args.join(' ')}`);
    return ['0', []];
  },
};

function createRedisCache(): Cache {
  // Create Redis cache with custom configuration
  const redisCache: Cache = {
    // SMTP cache: shorter TTL for SMTP verification results
    smtp: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:smtp:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.smtp,
    }),
    // SMTP port cache: longer TTL for port performance
    smtpPort: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email:smtp_port:',
      defaultTtlMs: DEFAULT_CACHE_OPTIONS.ttl.smtpPort,
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
