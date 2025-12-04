import type { ICacheStore } from '../cache-interface';

/**
 * Redis client interface to avoid direct dependency on redis package
 */
export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  flushdb(): Promise<string>;
}

/**
 * Redis adapter for the cache interface
 * Supports JSON serialization for complex objects
 */
export class RedisAdapter<T> implements ICacheStore<T> {
  private redis: IRedisClient;
  private keyPrefix: string;
  private defaultTtlMs: number;
  private jsonSerializer: {
    stringify: (value: T) => string;
    parse: (value: string) => T;
  };

  constructor(
    redis: IRedisClient,
    options: {
      keyPrefix?: string;
      defaultTtlMs?: number;
      jsonSerializer?: {
        stringify: (value: T) => string;
        parse: (value: string) => T;
      };
    } = {}
  ) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'email_validator:';
    this.defaultTtlMs = options.defaultTtlMs || 3600000; // 1 hour default

    // Default JSON serializer with Date support
    this.jsonSerializer = options.jsonSerializer || {
      stringify: (value: T) =>
        JSON.stringify(value, (key, v) => {
          // Check if value is our Date wrapper (avoid infinite recursion)
          if (v && typeof v === 'object' && v.__type === 'Date') {
            return v;
          }
          // Check if value is a Date (this won't work as JSON.stringify converts Dates to strings first)
          if (v instanceof Date) {
            return { __type: 'Date', value: v.toISOString() };
          }
          // Check if value is an ISO date string, but not inside a Date wrapper (avoid infinite recursion)
          if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v) && key !== 'value') {
            const date = new Date(v);
            if (!isNaN(date.getTime())) {
              return { __type: 'Date', value: v };
            }
          }
          return v;
        }),
      parse: (value: string) =>
        JSON.parse(value, (key, v) => {
          if (v && typeof v === 'object' && v.__type === 'Date') {
            return new Date(v.value);
          }
          return v;
        }),
    };
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(this.getKey(key));
      if (value === null) {
        return null;
      }
      return this.jsonSerializer.parse(value);
    } catch (error) {
      // Log error but don't throw - cache failures shouldn't break the app
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const serializedValue = this.jsonSerializer.stringify(value);
      const ttl = ttlMs || this.defaultTtlMs;
      // Redis TTL is in seconds
      const ttlSeconds = Math.ceil(ttl / 1000);

      await this.redis.set(this.getKey(key), serializedValue, 'EX', ttlSeconds);
    } catch (error) {
      // Log error but don't throw
      console.error('Redis set error:', error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.getKey(key));
      return result > 0;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.getKey(key));
      return result > 0;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      // Note: This clears the entire database. Use with caution!
      // In production, you might want to delete only keys with the prefix
      await this.redis.flushdb();
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  // size() is not applicable for Redis as it's a distributed store
  size(): number | undefined {
    return undefined;
  }

  /**
   * Helper method to delete only keys with the configured prefix
   * Requires Redis SCAN command which might not be available in all Redis clients
   */
  async clearPrefixed(): Promise<void> {
    // This is a placeholder implementation
    // In a real implementation, you would use SCAN or KEYS to find and delete prefixed keys
    // For simplicity, we're using flushdb() above
    console.warn('clearPrefixed not implemented. Use clear() to flush the entire database.');
  }
}
