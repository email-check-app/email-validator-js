import { lru } from 'tiny-lru';
import { LRUAdapter } from './adapters/lru-adapter';
import type { ICache, ICacheStore } from './cache-interface';
import { DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL } from './cache-interface';
import type { ParsedWhoisResult } from './whois-parser';

// Default cache instances using tiny-lru (backward compatibility)
export const mxCache = lru<string[]>(500, 3600000); // 1 hour TTL for MX records
export const disposableCache = lru<boolean>(1000, 86400000); // 24 hour TTL for disposable checks
export const freeCache = lru<boolean>(1000, 86400000); // 24 hour TTL for free email checks
export const domainValidCache = lru<boolean>(1000, 86400000); // 24 hour TTL for domain validation
export const smtpCache = lru<boolean | null>(500, 1800000); // 30 minute TTL for SMTP verification
export const domainSuggestionCache = lru<{ suggested: string; confidence: number } | null>(1000, 86400000); // 24 hour TTL for domain suggestions
export const whoisCache = lru<ParsedWhoisResult>(200, 3600000); // 1 hour TTL for WHOIS data

// Global custom cache instance (can be injected)
let globalCustomCache: ICache | null = null;

/**
 * Set a global custom cache instance to use instead of the default LRU caches
 */
export function setCustomCache(cache: ICache): void {
  globalCustomCache = cache;
}

/**
 * Get the current global custom cache instance
 */
export function getCustomCache(): ICache | null {
  return globalCustomCache;
}

/**
 * Reset to use default LRU caches
 */
export function resetToDefaultCache(): void {
  globalCustomCache = null;
}

/**
 * Get cache adapter that works with passed cache, global cache, or default LRU
 */
export function getCacheStore<T>(
  defaultLru: any,
  cacheType: keyof ICache,
  passedCache?: ICache | null
): ICacheStore<T> {
  // First, try to use the passed cache if provided
  if (passedCache && passedCache[cacheType]) {
    return passedCache[cacheType] as ICacheStore<T>;
  }

  // Fall back to global custom cache if set
  if (globalCustomCache) {
    return globalCustomCache[cacheType] as ICacheStore<T>;
  }

  // Finally, use default LRU cache
  return new LRUAdapter<T>(
    DEFAULT_CACHE_SIZE[cacheType as keyof typeof DEFAULT_CACHE_SIZE],
    DEFAULT_CACHE_TTL[cacheType as keyof typeof DEFAULT_CACHE_TTL]
  );
}

// Export cache accessors that automatically use custom cache if available
export const mxCacheStore = (passedCache?: ICache | null): ICacheStore<string[]> =>
  getCacheStore<string[]>(mxCache, 'mx', passedCache);
export const disposableCacheStore = (passedCache?: ICache | null): ICacheStore<boolean> =>
  getCacheStore<boolean>(disposableCache, 'disposable', passedCache);
export const freeCacheStore = (passedCache?: ICache | null): ICacheStore<boolean> =>
  getCacheStore<boolean>(freeCache, 'free', passedCache);
export const domainValidCacheStore = (passedCache?: ICache | null): ICacheStore<boolean> =>
  getCacheStore<boolean>(domainValidCache, 'domainValid', passedCache);
export const smtpCacheStore = (passedCache?: ICache | null): ICacheStore<boolean | null> =>
  getCacheStore<boolean | null>(smtpCache, 'smtp', passedCache);
export const domainSuggestionCacheStore = (
  passedCache?: ICache | null
): ICacheStore<{ suggested: string; confidence: number } | null> =>
  getCacheStore<{ suggested: string; confidence: number } | null>(
    domainSuggestionCache,
    'domainSuggestion',
    passedCache
  );
export const whoisCacheStore = (passedCache?: ICache | null): ICacheStore<ParsedWhoisResult> =>
  getCacheStore<ParsedWhoisResult>(whoisCache, 'whois', passedCache);

// Helper to clear all caches (both default and custom)
export function clearAllCaches(): void {
  // Clear default LRU caches
  mxCache.clear();
  disposableCache.clear();
  freeCache.clear();
  domainValidCache.clear();
  smtpCache.clear();
  domainSuggestionCache.clear();
  whoisCache.clear();

  // Clear custom cache if available
  if (globalCustomCache) {
    globalCustomCache.mx.clear();
    globalCustomCache.disposable.clear();
    globalCustomCache.free.clear();
    globalCustomCache.domainValid.clear();
    globalCustomCache.smtp.clear();
    globalCustomCache.domainSuggestion.clear();
    globalCustomCache.whois.clear();
  }
}

// Export types for external use
export type { ICache, ICacheStore } from './cache-interface';
