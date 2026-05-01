import { getCacheStore } from './cache';
import freeProviders from './free-email-providers.json';
import type { FreeEmailCheckParams, FreeEmailResult } from './types';

const freeEmailProviders: Set<string> = new Set(freeProviders as string[]);

/**
 * Check whether the email's domain is on the bundled free-provider list.
 * Result is rich-cached (`FreeEmailResult`) so repeated calls hit a Set
 * lookup behind a CacheStore<T>.
 */
export async function isFreeEmail(params: FreeEmailCheckParams): Promise<boolean> {
  const { emailOrDomain, cache, logger } = params;
  const log = logger || (() => {});

  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) return false;

  const cacheStore = getCacheStore<FreeEmailResult>(cache, 'free');
  let cached: FreeEmailResult | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch {
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isFreeEmail] Cache hit for ${emailDomain}: ${cached.isFree}`);
    return cached.isFree;
  }

  const isFree = freeEmailProviders.has(emailDomain);
  const richResult: FreeEmailResult = {
    isFree,
    provider: isFree ? emailDomain : undefined,
    checkedAt: Date.now(),
  };

  try {
    await cacheStore.set(emailDomain, richResult);
    log(`[isFreeEmail] Cached result for ${emailDomain}: ${isFree}`);
  } catch {
    log(`[isFreeEmail] Cache write error for ${emailDomain}`);
  }
  log(`[isFreeEmail] Check result for ${emailDomain}: ${isFree}`);
  return isFree;
}
