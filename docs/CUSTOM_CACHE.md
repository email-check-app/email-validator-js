# Custom Cache Implementation

The email validator now supports custom cache implementations, allowing you to use any cache backend including Redis, Memcached, or your own in-memory cache solution.

## Overview

The library provides a flexible cache interface `ICacheStore<T>` that can be implemented by any cache store. This allows you to:
- Use Redis for distributed caching across multiple instances
- Implement custom caching strategies
- Monitor cache performance with statistics
- Set different TTLs for different cache types
- Scale horizontally with shared cache storage

## Cache Types

The validator uses several cache types for different purposes:

| Cache Type | Purpose | Default TTL | Default Size |
|------------|---------|-------------|--------------|
| `mx` | MX record lookups | 1 hour | 500 entries |
| `disposable` | Disposable email checks | 24 hours | 1000 entries |
| `free` | Free email provider checks | 24 hours | 1000 entries |
| `domainValid` | Domain validation results | 24 hours | 1000 entries |
| `smtp` | SMTP verification results | 30 minutes | 500 entries |
| `domainSuggestion` | Domain typo suggestions | 24 hours | 1000 entries |
| `whois` | WHOIS data | 1 hour | 200 entries |

## Quick Start

### Using Redis Cache

```typescript
import { RedisAdapter } from 'email-validator-js/adapters/redis-adapter';
import { CacheFactory } from 'email-validator-js/cache-factory';
import { setCustomCache } from 'email-validator-js/cache';
import { verifyEmail } from 'email-validator-js';

// Create Redis cache
const redisCache = CacheFactory.createRedisCache(redisClient, {
  keyPrefix: 'email_validator:',
  customTtl: {
    mx: 7200000, // 2 hours
    smtp: 3600000, // 1 hour
  }
});

// Set as global cache
setCustomCache(redisCache);

// Now all verification calls will use Redis
const result = await verifyEmail({
  emailAddress: 'user@example.com',
  verifyMx: true,
  verifySmtp: true
});
```

### Using Custom In-Memory Cache

```typescript
import { CacheFactory } from 'email-validator-js/cache-factory';
import { setCustomCache } from 'email-validator-js/cache';

// Create custom cache with specific configurations
const customCache = CacheFactory.createCustomCache((cacheType, defaultTtl, defaultSize) => {
  // Different configurations for different cache types
  switch (cacheType) {
    case 'smtp':
      return new MyCustomCache(200, 1800000); // 30 minutes
    case 'disposable':
      return new MyCustomCache(2000, 172800000); // 48 hours
    default:
      return new MyCustomCache(defaultSize, defaultTtl);
  }
});

setCustomCache(customCache);
```

## Implementing a Custom Cache Store

Your cache store must implement the `ICacheStore<T>` interface:

```typescript
interface ICacheStore<T = any> {
  get(key: string): Promise<T | null | undefined> | T | null | undefined;
  set(key: string, value: T, ttlMs?: number): Promise<void> | void;
  delete(key: string): Promise<boolean> | boolean;
  has(key: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
  size?(): number | undefined;
}
```

### Example: Custom Cache with Statistics

```typescript
class StatsCache<T> implements ICacheStore<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs = 3600000): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry ? Date.now() <= entry.expiresAt : false;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits / (this.hits + this.misses) || 0
    };
  }
}
```

## Built-in Adapters

### LRUAdapter

Wraps the tiny-lru library to work with the cache interface:

```typescript
import { LRUAdapter } from 'email-validator-js/adapters/lru-adapter';

const cache = new LRUAdapter<string>(1000, 3600000); // 1000 items, 1 hour TTL
```

### RedisAdapter

Redis adapter with automatic JSON serialization:

```typescript
import { RedisAdapter } from 'email-validator-js/adapters/redis-adapter';

const cache = new RedisAdapter(redisClient, {
  keyPrefix: 'myapp:',
  defaultTtlMs: 3600000,
  jsonSerializer: {
    stringify: JSON.stringify,
    parse: JSON.parse
  }
});
```

## Cache Factory

The `CacheFactory` provides convenient methods to create cache instances:

### Create LRU Cache

```typescript
const cache = CacheFactory.createLRUCache({
  mx: 7200000, // Custom TTL for MX cache
  smtp: 1800000, // Custom TTL for SMTP cache
});
```

### Create Redis Cache

```typescript
const cache = CacheFactory.createRedisCache(redisClient, {
  keyPrefix: 'email_validator:',
  customTtl: {
    disposable: 172800000, // 48 hours
  }
});
```

### Create Mixed Cache

Use different backends for different cache types:

```typescript
const cache = CacheFactory.createMixedCache({
  mx: { store: redisStore }, // Use Redis for MX
  disposable: { ttlMs: 86400000 }, // Memory for disposable with 24h TTL
  smtp: { store: memcachedStore }, // Use Memcached for SMTP
});
```

## Global Cache Management

### Set Custom Cache

```typescript
import { setCustomCache } from 'email-validator-js/cache';

setCustomCache(myCustomCache);
```

### Get Current Cache

```typescript
import { getCustomCache } from 'email-validator-js/cache';

const currentCache = getCustomCache();
```

### Reset to Default

```typescript
import { resetToDefaultCache } from 'email-validator-js/cache';

resetToDefaultCache(); // Use built-in LRU cache
```

### Clear All Caches

```typescript
import { clearAllCaches } from 'email-validator-js/cache';

clearAllCaches(); // Works with both default and custom caches
```

## Best Practices

### 1. TTL Configuration

Set appropriate TTLs based on data volatility:
- **MX records**: Change infrequently, can be cached longer
- **SMTP verification**: Email status can change quickly, cache shorter
- **Disposable lists**: Updated regularly, cache for 24-48 hours

### 2. Error Handling

The cache adapters gracefully handle errors:
- Cache failures don't break email validation
- Errors are logged for debugging
- Operations fall back to direct computation

### 3. Performance Considerations

- Use async operations for network-based caches (Redis, Memcached)
- Implement size limits for in-memory caches
- Consider using connection pooling for Redis
- Monitor cache hit rates to optimize TTLs

### 4. Distributed Caching

When scaling across multiple instances:
- Use Redis or another shared cache store
- Ensure cache keys are namespaced to avoid conflicts
- Consider cache warming strategies for better performance

## Migration Guide

### From Default Cache

To migrate from the default LRU cache to a custom implementation:

1. Create your cache store implementing `ICacheStore<T>`
2. Use `CacheFactory` to create a full cache instance
3. Set it globally with `setCustomCache()`

```typescript
// Before: Default cache
import { verifyEmail } from 'email-validator-js';

// After: Custom cache
import { verifyEmail } from 'email-validator-js';
import { CacheFactory, setCustomCache } from 'email-validator-js/cache-factory';

const myCache = CacheFactory.createLRUCache({ /* custom TTLs */ });
setCustomCache(myCache);

// No changes needed to verification calls
const result = await verifyEmail({ emailAddress: 'test@example.com' });
```

### Backward Compatibility

The default LRU cache is still available and used by default. Existing code continues to work without changes:

```typescript
// This still works exactly as before
import { verifyEmail } from 'email-validator-js';

const result = await verifyEmail({ emailAddress: 'test@example.com' });
```

## Examples

See the `examples/` directory for complete working examples:
- `custom-cache-redis.ts` - Redis cache implementation
- `custom-cache-memory.ts` - Custom in-memory cache with statistics

## TypeScript Support

Full TypeScript support is included with proper type definitions:

```typescript
import type { ICacheStore, ICache } from 'email-validator-js/cache-interface';

// Your custom cache store
class MyCache<T> implements ICacheStore<T> {
  // Implementation
}

// Full cache configuration
const myFullCache: ICache = {
  mx: new MyCache<string[]>(),
  disposable: new MyCache<boolean>(),
  // ... other cache types
};
```