import type { CacheStore } from '../cache-interface';

/**
 * Subset of the redis client surface we depend on. Kept minimal so consumers
 * can plug in `ioredis`, `node-redis`, or any compatible library without
 * pulling that package as a direct dependency.
 *
 * `scan` is used by clear() to walk and delete keys matching our prefix —
 * the previous implementation called `flushdb()`, which wipes the whole
 * database and is unsafe in shared deployments.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
  del(key: string | string[]): Promise<number>;
  exists(key: string): Promise<number>;
  scan(cursor: string | number, ...args: Array<string | number>): Promise<[string, string[]]>;
}

/**
 * Redis adapter for the cache interface
 * Supports JSON serialization for complex objects
 */
export class RedisAdapter<T> implements CacheStore<T> {
  private redis: RedisClient;
  private keyPrefix: string;
  private defaultTtlMs: number;
  private jsonSerializer: {
    stringify: (value: T) => string;
    parse: (value: string) => T;
  };

  constructor(
    redis: RedisClient,
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
      stringify: (value: T) => {
        // Pre-process the object to convert Dates to a special format
        const processed = this.processDatesForSerialization(value);
        return JSON.stringify(processed);
      },
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

  /**
   * Walk an arbitrary value and replace `Date` instances with a tagged
   * envelope `{__type: 'Date', value: <ISO>}` so JSON.stringify can round-trip
   * them. The reverse (parsing the envelope) lives in the JSON `parse` reviver
   * configured in the constructor.
   */
  private processDatesForSerialization(value: unknown): unknown {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.processDatesForSerialization(item));
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value)) {
        result[key] = this.processDatesForSerialization(v);
      }
      return result;
    }
    return value;
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

  /**
   * Delete every key written by this adapter (scoped by `keyPrefix`).
   * Walks the keyspace with SCAN + MATCH so we never touch unrelated keys.
   */
  async clear(): Promise<void> {
    try {
      let cursor: string = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${this.keyPrefix}*`, 'COUNT', 500);
        if (keys.length > 0) await this.redis.del(keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  // size() is not applicable for Redis as it's a distributed store
  size(): number | undefined {
    return undefined;
  }
}
