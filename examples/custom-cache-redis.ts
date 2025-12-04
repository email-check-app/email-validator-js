/**
 * Example: Using Redis as custom cache backend
 * This demonstrates how to configure the email validator with Redis cache
 */

import { verifyEmail } from '../src';
import { setCustomCache } from '../src/cache';
import { RedisAdapter } from '../src/adapters/redis-adapter';
import type { ICache } from '../src/cache-interface';
import { DEFAULT_CACHE_TTL } from '../src/cache-interface';

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

async function setupRedisCache() {
  // Create Redis cache with custom configuration
  const redisCache: ICache = {
    mx: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:mx:',
      defaultTtlMs: 7200000, // 2 hours for MX records (default is 1 hour)
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    smtp: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:smtp:',
      defaultTtlMs: 3600000, // 1 hour for SMTP verification (default is 30 minutes)
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    disposable: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:disposable:',
      defaultTtlMs: 172800000, // 48 hours for disposable list (default is 24 hours)
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    free: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:free:',
      defaultTtlMs: DEFAULT_CACHE_TTL.free,
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    domainValid: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:domain_valid:',
      defaultTtlMs: DEFAULT_CACHE_TTL.domainValid,
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    domainSuggestion: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:domain_suggestion:',
      defaultTtlMs: DEFAULT_CACHE_TTL.domainSuggestion,
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
    whois: new RedisAdapter(mockRedisClient, {
      keyPrefix: 'email_validator:whois:',
      defaultTtlMs: DEFAULT_CACHE_TTL.whois,
      jsonSerializer: {
        stringify: (value) => JSON.stringify(value),
        parse: (value) => JSON.parse(value),
      },
    }),
  };

  // Set the custom cache globally
  setCustomCache(redisCache);

  console.log('✅ Redis cache configured and set globally');
}

async function demonstrateCacheUsage() {
  const testEmails = [
    'test@gmail.com',
    'user@yahoo.com',
    'admin@disposable-temp-email.com',
    'test@gmail.com', // This should hit the cache
  ];

  console.log('\n🔍 Verifying emails with Redis cache...\n');

  for (const email of testEmails) {
    console.log(`\n📧 Verifying: ${email}`);
    const result = await verifyEmail({
      emailAddress: email,
      verifyMx: true,
      verifySmtp: false, // Set to false for this example
      checkDisposable: true,
      checkFree: true,
      debug: true,
    });

    console.log(`Result:`, {
      valid: result.validFormat && result.validMx,
      disposable: result.isDisposable,
      freeProvider: result.isFree,
      cached: result.metadata?.cached,
    });
  }
}

async function main() {
  try {
    console.log('🚀 Setting up Redis cache for email validation...\n');
    await setupRedisCache();

    console.log('\n📊 Demonstrating cache usage...\n');
    await demonstrateCacheUsage();

    console.log('\n✨ Example completed successfully!');
    console.log('\n📝 Key points:');
    console.log('  • Redis adapter automatically handles JSON serialization');
    console.log('  • Cache keys are prefixed to avoid conflicts');
    console.log('  • TTL values are configurable per cache type');
    console.log('  • All cache operations are async and non-blocking');
    console.log("  • Cache errors are logged but don't break validation");
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the example
if (require.main === module) {
  main();
}
