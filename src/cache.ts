import { LRUAdapter } from './adapters/lru-adapter';
import type { ICache, ICacheStore } from './cache-interface';
import type { DisposableEmailResult, DomainValidResult, FreeEmailResult, SmtpVerificationResult } from './types';
import type { ParsedWhoisResult } from './whois-parser';

/**
 * Default cache options
 */
export const DEFAULT_CACHE_OPTIONS = {
  ttl: {
    mx: 3600000, // 1 hour
    disposable: 86400000, // 24 hours
    free: 86400000, // 24 hours
    domainValid: 86400000, // 24 hours
    smtp: 1800000, // 30 minutes
    smtpPort: 86400000, // 1 hour
    domainSuggestion: 86400000, // 24 hours
    whois: 3600000, // 1 hour
  },
  maxSize: {
    mx: 10000,
    disposable: 10000,
    free: 10000,
    domainValid: 10000,
    smtp: 10000,
    smtpPort: 10000,
    domainSuggestion: 10000,
    whois: 10000,
  },
};

/**
 * Lazy-loaded default cache instance
 */
let defaultCacheInstance: ICache | null = null;

/**
 * Get the default in-memory cache singleton using LRU
 * This is created on first access and reused for all subsequent calls
 */
export function getDefaultCache(): ICache {
  if (!defaultCacheInstance) {
    defaultCacheInstance = {
      mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
      disposable: new LRUAdapter<DisposableEmailResult>(
        DEFAULT_CACHE_OPTIONS.maxSize.disposable,
        DEFAULT_CACHE_OPTIONS.ttl.disposable
      ),
      free: new LRUAdapter<FreeEmailResult>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
      domainValid: new LRUAdapter<DomainValidResult>(
        DEFAULT_CACHE_OPTIONS.maxSize.domainValid,
        DEFAULT_CACHE_OPTIONS.ttl.domainValid
      ),
      smtp: new LRUAdapter<SmtpVerificationResult>(DEFAULT_CACHE_OPTIONS.maxSize.smtp, DEFAULT_CACHE_OPTIONS.ttl.smtp),
      smtpPort: new LRUAdapter<number>(DEFAULT_CACHE_OPTIONS.maxSize.smtpPort, DEFAULT_CACHE_OPTIONS.ttl.smtpPort),
      domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
        DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
        DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
      ),
      whois: new LRUAdapter<ParsedWhoisResult>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
    };
  }
  return defaultCacheInstance;
}

/**
 * Helper function to get cache store from cache parameter
 * Follows the same pattern as logging - use passed cache or default
 */
export function getCacheStore<T>(cache: ICache | null | undefined, key: keyof ICache): ICacheStore<T> {
  return (cache?.[key] || getDefaultCache()[key]) as ICacheStore<T>;
}

/**
 * Clear the default cache instance
 * Useful for testing or when you want to reset cache state
 */
export function clearDefaultCache(): void {
  if (defaultCacheInstance) {
    defaultCacheInstance.mx.clear();
    defaultCacheInstance.disposable.clear();
    defaultCacheInstance.free.clear();
    defaultCacheInstance.domainValid.clear();
    defaultCacheInstance.smtp.clear();
    defaultCacheInstance.smtpPort.clear();
    defaultCacheInstance.domainSuggestion.clear();
    defaultCacheInstance.whois.clear();
  }
}

/**
 * Reset the default cache instance to a fresh one
 */
export function resetDefaultCache(): void {
  defaultCacheInstance = null;
}

// Export types for external use
export type { ICache, ICacheStore } from './cache-interface';
