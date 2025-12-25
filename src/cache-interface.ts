/**
 * Simple cache interface for email validator
 * Mirrors the logging pattern - pass as optional parameter
 */

import type { SmtpVerificationResult } from './types';

/**
 * Generic cache interface that can be implemented by any cache store
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
   * @param ttlMs - Optional TTL in milliseconds
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
 * Cache interface for different types of data
 * Each cache store stores the appropriate data type for its use case
 */
export interface ICache {
  mx: ICacheStore<string[]>;
  disposable: ICacheStore<boolean>;
  free: ICacheStore<boolean>;
  domainValid: ICacheStore<boolean>;
  /** Rich SMTP verification result with all data points (has_full_inbox, is_disabled, etc.) */
  smtp: ICacheStore<SmtpVerificationResult | null>;
  smtpPort: ICacheStore<number>; // Cache for storing successful port per host/domain
  domainSuggestion: ICacheStore<{ suggested: string; confidence: number } | null>;
  whois: ICacheStore<any>;
}
