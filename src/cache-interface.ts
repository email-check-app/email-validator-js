/**
 * Simple cache interface for email validator
 * Mirrors the logging pattern - pass as optional parameter
 */

import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from './types';
import type { ParsedWhoisResult } from './whois-parser';

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
 * Uses rich result types instead of boolean values for better debugging and analytics
 */
export interface ICache {
  mx: ICacheStore<string[]>;
  /** Rich result: includes isDisposable, source, category, and checkedAt */
  disposable: ICacheStore<DisposableEmailResult>;
  /** Rich result: includes isFree, provider, and checkedAt */
  free: ICacheStore<FreeEmailResult>;
  /** Rich result: includes isValid, hasMX, mxRecords, and checkedAt */
  domainValid: ICacheStore<DomainValidResult>;
  /** Rich result: includes isValid, mxHost, port, reason, tlsUsed, and checkedAt */
  smtp: ICacheStore<SmtpVerificationResult>;
  smtpPort: ICacheStore<number>; // Cache for storing successful port per host/domain
  domainSuggestion: ICacheStore<{ suggested: string; confidence: number } | null>;
  whois: ICacheStore<ParsedWhoisResult>;
}
