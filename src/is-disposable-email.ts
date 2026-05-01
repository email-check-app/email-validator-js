import { getCacheStore } from './cache';
import disposableProviders from './disposable-email-providers.json';
import type { DisposableEmailCheckParams, DisposableEmailResult } from './types';

const disposableEmailProviders: Set<string> = new Set(disposableProviders as string[]);

/**
 * Check whether the email's domain is on the bundled disposable-provider list.
 * Result is rich-cached (`DisposableEmailResult`) so repeated calls hit a Set
 * lookup behind a CacheStore<T>.
 */
export async function isDisposableEmail(params: DisposableEmailCheckParams): Promise<boolean> {
  const { emailOrDomain, cache, logger } = params;
  const log = logger || (() => {});

  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) return false;

  const cacheStore = getCacheStore<DisposableEmailResult>(cache, 'disposable');
  let cached: DisposableEmailResult | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch {
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isDisposableEmail] Cache hit for ${emailDomain}: ${cached.isDisposable}`);
    return cached.isDisposable;
  }

  const isDisposable = disposableEmailProviders.has(emailDomain);
  const richResult: DisposableEmailResult = {
    isDisposable,
    source: 'disposable-email-providers.json',
    category: isDisposable ? 'disposable' : undefined,
    checkedAt: Date.now(),
  };

  try {
    await cacheStore.set(emailDomain, richResult);
    log(`[isDisposableEmail] Cached result for ${emailDomain}: ${isDisposable}`);
  } catch {
    log(`[isDisposableEmail] Cache write error for ${emailDomain}`);
  }
  log(`[isDisposableEmail] Check result for ${emailDomain}: ${isDisposable}`);
  return isDisposable;
}
