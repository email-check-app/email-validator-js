/**
 * Generic cache interface that can be implemented by any cache store
 * including in-memory LRU cache, Redis, Memcached, etc.
 */
export interface ICacheStore<T = any> {
  /**
   * Get a value from the cache
   * @param key - The cache key
   * @returns The cached value or null/undefined if not found or expired
   */
  get(key: string): Promise<T | null | undefined> | T | null | undefined;

  /**
   * Set a value in the cache with optional TTL
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttlMs - Optional TTL in milliseconds. If not provided, use default TTL
   */
  set(key: string, value: T, ttlMs?: number): Promise<void> | void;

  /**
   * Delete a value from the cache
   * @param key - The cache key
   */
  delete(key: string): Promise<boolean> | boolean;

  /**
   * Check if a key exists in the cache
   * @param key - The cache key
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * Clear all values from the cache
   */
  clear(): Promise<void> | void;

  /**
   * Get the current size of the cache (number of entries)
   * Returns undefined if size is not applicable (e.g., Redis)
   */
  size?(): number | undefined;
}

/**
 * Synchronous cache interface for in-memory caches
 */
export interface ISyncCacheStore<T = any> {
  /**
   * Get a value from the cache
   * @param key - The cache key
   * @returns The cached value or null/undefined if not found or expired
   */
  get(key: string): T | null | undefined;

  /**
   * Set a value in the cache with optional TTL
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttlMs - Optional TTL in milliseconds. If not provided, use default TTL
   */
  set(key: string, value: T, ttlMs?: number): void;

  /**
   * Delete a value from the cache
   * @param key - The cache key
   */
  delete(key: string): boolean;

  /**
   * Check if a key exists in the cache
   * @param key - The cache key
   */
  has(key: string): boolean;

  /**
   * Clear all values from the cache
   */
  clear(): void;

  /**
   * Get the current size of the cache (number of entries)
   */
  size?(): number;
}

/**
 * Cache configuration for different cache types
 */
export interface CacheConfig {
  /** Maximum number of entries (for LRU caches) */
  maxSize?: number;
  /** Default TTL in milliseconds */
  ttlMs?: number;
  /** Custom cache store implementation */
  store?: ICacheStore;
}

/**
 * Cache holder interface for typed caches
 */
export interface ICache {
  mx: ICacheStore<string[]>;
  disposable: ICacheStore<boolean>;
  free: ICacheStore<boolean>;
  domainValid: ICacheStore<boolean>;
  smtp: ICacheStore<boolean | null>;
  domainSuggestion: ICacheStore<{ suggested: string; confidence: number } | null>;
  whois: ICacheStore<any>; // ParsedWhoisResult type to avoid circular import
}

/**
 * Default TTL values in milliseconds
 */
export const DEFAULT_CACHE_TTL = {
  mx: 3600000, // 1 hour
  disposable: 86400000, // 24 hours
  free: 86400000, // 24 hours
  domainValid: 86400000, // 24 hours
  smtp: 1800000, // 30 minutes
  domainSuggestion: 86400000, // 24 hours
  whois: 3600000, // 1 hour
};

/**
 * Default cache sizes
 */
export const DEFAULT_CACHE_SIZE = {
  mx: 500,
  disposable: 1000,
  free: 1000,
  domainValid: 1000,
  smtp: 500,
  domainSuggestion: 1000,
  whois: 200,
};
