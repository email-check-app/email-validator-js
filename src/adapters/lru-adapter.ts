import { type LRU, lru } from 'tiny-lru';
import type { ICacheStore } from '../cache-interface';

/**
 * Adapter to make tiny-lru compatible with our cache interface
 */
export class LRUAdapter<T> implements ICacheStore<T> {
  private lru: LRU<T>;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) {
    this.lru = lru<T>(maxSize, ttlMs);
  }

  get(key: string): T | null | undefined {
    const value = this.lru.get(key);
    // tiny-lru returns undefined for not found
    return value === undefined ? null : value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined) {
      // Create a new LRU with the custom TTL for this specific entry
      // Note: tiny-lru doesn't support per-entry TTL, so we use the instance TTL
      this.lru.set(key, value);
    } else {
      this.lru.set(key, value);
    }
  }

  async delete(key: string): Promise<boolean> {
    this.lru.delete(key);
    return true; // tiny-lru delete returns void, but our interface expects boolean
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
