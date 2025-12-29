/**
 * Simple cache interface for email validator
 * Mirrors the logging pattern - pass as optional parameter
 */

import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from './types';
import type { ParsedWhoisResult } from './whois-parser';

/**
 * Generic cache interface that can be implemented by any cache store
 */
export interface CacheStore<T = any> {
  /**
   * Get a value from cache
   * @param key - The cache key
   * @returns The cached value or null/undefined if not found or expired
   */
  get(key: string): Promise<T | null | undefined> | T | null | undefined;

  /**
   * Set a value in cache with optional TTL
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttlMs - Optional TTL in milliseconds
   */
  set(key: string, value: T, ttlMs?: number): Promise<void> | void;

  /**
   * Delete a value from cache
   * @param key - The cache key
   */
  delete(key: string): Promise<boolean> | boolean;

  /**
   * Check if a key exists in cache
   * @param key - The cache key
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * Clear all values from cache
   */
  clear(): Promise<void> | void;

  /**
   * Get the current size of cache (number of entries)
   * Returns undefined if size is not applicable (e.g., Redis)
   */
  size?(): number | undefined;
}

/**
 * Cache interface for different types of data
 * Uses rich result types instead of boolean values for better debugging and analytics
 */
export interface Cache {
  mx: CacheStore<string[]>;
  /** Rich result: includes isDisposable, source, category, and checkedAt */
  disposable: CacheStore<DisposableEmailResult>;
  /** Rich result: includes isFree, provider, and checkedAt */
  free: CacheStore<FreeEmailResult>;
  /** Rich result: includes isValid, hasMX, mxRecords, and checkedAt */
  domainValid: CacheStore<DomainValidResult>;
  /** Rich result: includes isValid, mxHost, port, reason, tlsUsed, and checkedAt */
  smtp: CacheStore<SmtpVerificationResult>;
  smtpPort: CacheStore<number>; // Cache for storing successful port per host/domain
  domainSuggestion: CacheStore<{ suggested: string; confidence: number } | null>;
  whois: CacheStore<ParsedWhoisResult>;
}
