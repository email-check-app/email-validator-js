import { isValid } from 'psl';
import { getCacheStore } from './cache';
import type { ICache } from './cache-interface';
import type { DomainValidResult } from './types';

/**
 * Validates if email domain is valid TLD
 */
export async function isValidEmailDomain(emailOrDomain: string, cache?: ICache | null): Promise<boolean> {
  let [_, emailDomain] = emailOrDomain?.split('@') || [];
  if (!emailDomain) {
    emailDomain = _;
  }
  if (!emailDomain) {
    return false;
  }

  // Check cache first - now uses rich DomainValidResult
  const cacheStore = getCacheStore<DomainValidResult>(cache, 'domainValid');
  const cached = await cacheStore.get(emailDomain);
  if (cached !== null && cached !== undefined) {
    return cached.isValid;
  }

  try {
    const isValidResult = isValid(emailDomain) || false;

    // Store rich result in cache
    const richResult: DomainValidResult = {
      isValid: isValidResult,
      hasMX: false, // MX not checked in this function
      checkedAt: Date.now(),
    };

    await cacheStore.set(emailDomain, richResult);
    return isValidResult;
  } catch (_e) {
    const errorResult: DomainValidResult = {
      isValid: false,
      hasMX: false,
      checkedAt: Date.now(),
    };
    await cacheStore.set(emailDomain, errorResult);
    return false;
  }
}

/**
 * Validates email address format using RFC-compliant regex
 * @param emailAddress - The email address to validate
 * @returns true if email format is valid
 */
export function isValidEmail(emailAddress: string) {
  if (!emailAddress || typeof emailAddress !== 'string') {
    return false;
  }

  // Updated regex to be more comprehensive
  const re =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  // Additional checks
  const emailLower = emailAddress.toLowerCase();

  // Check for invalid patterns
  if (emailLower.indexOf('.+') !== -1) return false;
  if (emailLower.indexOf('..') !== -1) return false;
  if (emailLower.startsWith('.') || emailLower.endsWith('.')) return false;

  // Check length constraints
  const parts = emailAddress.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false; // RFC 5321
  if (domain.length > 253) return false; // RFC 5321

  return re.test(emailLower);
}
