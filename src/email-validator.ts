import { isValid } from 'psl';
import { getCacheStore } from './cache';
import type { Cache } from './cache-interface';
import type { DomainValidResult } from './types';

/**
 * Validates if email domain is valid TLD
 */
export async function isValidEmailDomain(emailOrDomain: string, cache?: Cache | null): Promise<boolean> {
  let [localPart, emailDomain] = emailOrDomain?.split('@') || [];
  if (!emailDomain) {
    emailDomain = localPart;
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
  } catch (validationError) {
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
 * Validates email-address format with a pragmatic (not strictly RFC-5322) regex.
 *
 * The local-part allow-list is `[a-zA-Z0-9._+'-]` — letters, digits, dot,
 * underscore, plus, apostrophe, hyphen. Characters that are technically valid
 * in RFC atext but virtually never appear in real mailboxes (`= ? ^ ~ { } | *
 * & % $ # ! / `` `) are rejected. Quoted local-parts (`"..."@example.com`) are
 * accepted as-is — they're rare but legal — but their interior is not parsed.
 */
export function isValidEmail(emailAddress: string) {
  if (!emailAddress || typeof emailAddress !== 'string') {
    return false;
  }

  // Local-part: dot-atom-text with the pragmatic character set, OR a
  // quoted-string. Domain: IPv4 literal in brackets, OR labels-and-TLD.
  const re =
    /^(([a-zA-Z0-9_+'-]+(\.[a-zA-Z0-9_+'-]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}))$/;

  const emailLower = emailAddress.toLowerCase();

  // Heuristic guards on top of the regex — these are subtle invalid patterns
  // that the regex's dot-atom structure can still permit at the seams.
  if (emailLower.indexOf('.+') !== -1) return false;
  if (emailLower.indexOf('..') !== -1) return false;
  if (emailLower.startsWith('.') || emailLower.endsWith('.')) return false;

  const parts = emailAddress.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false; // RFC 5321
  if (domain.length > 253) return false; // RFC 5321

  return re.test(emailLower);
}
