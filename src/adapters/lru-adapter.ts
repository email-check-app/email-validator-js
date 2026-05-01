import { type LRU, lru } from 'tiny-lru';
import type { CacheStore } from '../cache-interface';

/**
 * Adapter to make tiny-lru compatible with our cache interface
 */
export class LRUAdapter<T> implements CacheStore<T> {
  private lru: LRU<T>;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) {
    this.lru = lru<T>(maxSize, ttlMs);
  }

  get(key: string): T | null | undefined {
    const value = this.lru.get(key);
    // tiny-lru returns undefined for not found
    return value === undefined ? null : value;
  }

  // Per-entry ttlMs is intentionally ignored: tiny-lru only supports a single
  // TTL set at construction. Callers that need per-entry expiry should pick a
  // backend that honours it (e.g. RedisAdapter).
  async set(key: string, value: T, _ttlMs?: number): Promise<void> {
    this.lru.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    this.lru.delete(key);
    return true;
  }

  async has(key: string): Promise<boolean> {
    return this.lru.has(key);
  }

  async clear(): Promise<void> {
    this.lru.clear();
  }

  size(): number {
    return this.lru.size;
  }

  /**
   * Get the underlying LRU instance for advanced operations
   */
  getLRU(): LRU<T> {
    return this.lru;
  }
}
