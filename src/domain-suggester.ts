import { stringSimilarity } from 'string-similarity-js';
import { getCacheStore } from './cache';
import type { Cache } from './cache-interface';
import commonEmailDomainsJson from './data/common-email-domains.json';
import typoPatternsJson from './data/typo-patterns.json';
import type { DomainSuggestion, DomainSuggestionParams } from './types';

/**
 * List of common email domains for typo detection — popular free providers,
 * business providers, and hosting services. Source data lives in
 * src/data/common-email-domains.json.
 */
export const commonEmailDomains: readonly string[] = commonEmailDomainsJson as string[];

/**
 * Hand-curated typo → canonical map. Faster + more accurate than the
 * similarity heuristic for common misspellings of the top providers.
 */
const TYPO_PATTERNS = typoPatternsJson as Record<string, string[]>;

/**
 * Calculate similarity threshold based on domain length
 * Shorter domains need higher similarity to avoid false positives
 */
function getSimilarityThreshold(domain: string) {
  const length = domain.length;
  if (length <= 6) return 0.85; // Short domains need high similarity
  if (length <= 10) return 0.8; // Medium domains
  return 0.75; // Longer domains can have lower threshold
}

/**
 * Pure matching logic — no caching, no I/O. Returns the best suggestion for
 * `domain` against `candidates` or null. Both the sync and the async
 * (cache-aware) public entry points share this single implementation.
 */
function findSuggestion(domain: string, candidates: readonly string[]): DomainSuggestion | null {
  const lower = domain.toLowerCase();

  // Already a known good domain → no suggestion.
  if (candidates.includes(lower)) return null;

  // Hand-crafted typo table beats the similarity heuristic for common cases.
  for (const [correct, typos] of Object.entries(TYPO_PATTERNS)) {
    if (typos.includes(lower)) {
      return { original: domain, suggested: correct, confidence: 0.95 };
    }
  }

  const threshold = getSimilarityThreshold(lower);
  let best: { domain: string; similarity: number } | null = null;

  for (const candidate of candidates) {
    const similarity = stringSimilarity(lower, candidate.toLowerCase());
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { domain: candidate, similarity };
    }
  }

  // Second pass with a relaxed threshold for length-similar domains.
  if (!best) {
    for (const candidate of candidates) {
      if (Math.abs(lower.length - candidate.length) > 2) continue;
      const similarity = stringSimilarity(lower, candidate.toLowerCase());
      if (similarity >= 0.7 && (!best || similarity > best.similarity)) {
        best = { domain: candidate, similarity };
      }
    }
  }

  if (!best) return null;
  // Reject suggestions whose first letter differs unless similarity is very high
  // — this avoids "amazon.com" being suggested for "yahoo.com" type junk.
  if (best.domain.charAt(0) !== lower.charAt(0) && best.similarity < 0.9) return null;

  return { original: domain, suggested: best.domain, confidence: best.similarity };
}

/** Sync default — no cache. Public for callers that need a synchronous answer. */
export function defaultDomainSuggestionMethod(domain: string, commonDomains?: string[]): DomainSuggestion | null {
  if (!domain || domain.length < 3) return null;
  return findSuggestion(domain, commonDomains ?? commonEmailDomains);
}

/** Async default — wraps the sync match with a per-domain cache layer. */
export async function defaultDomainSuggestionMethodAsync(
  domain: string,
  commonDomains?: string[],
  cache?: Cache
): Promise<DomainSuggestion | null> {
  if (!domain || domain.length < 3) return null;
  const candidates = commonDomains ?? commonEmailDomains;
  const cacheKey = `${domain.toLowerCase()}:${candidates.length}`;
  const cacheStore = getCacheStore<DomainSuggestion | null>(cache, 'domainSuggestion');

  const cached = await cacheStore.get(cacheKey);
  if (cached !== null && cached !== undefined) return cached as DomainSuggestion | null;

  const result = findSuggestion(domain, candidates);
  await cacheStore.set(cacheKey, result);
  return result;
}

/** Sync entry: pass a domain (or email-shaped string), get a suggestion or null. */
export function suggestDomain(params: DomainSuggestionParams): DomainSuggestion | null {
  const { domain, customMethod, commonDomains } = params;
  if (!domain || domain.length < 3) return null;

  if (customMethod) {
    try {
      return customMethod(domain);
    } catch (error) {
      // Fall back to the default if the user's method throws.
      console.warn('Custom domain suggestion method failed, falling back to default:', error);
    }
  }
  return defaultDomainSuggestionMethod(domain, commonDomains);
}

/** Async entry: takes a full email, returns a suggestion that rewrites the local-part too. */
export async function suggestEmailDomain(
  email: string,
  commonDomains?: string[],
  cache?: Cache
): Promise<DomainSuggestion | null> {
  if (!email?.includes('@')) return null;
  const [localPart, domain] = email.split('@');
  if (!domain || !localPart) return null;

  const suggestion = await defaultDomainSuggestionMethodAsync(domain, commonDomains, cache);
  if (!suggestion) return null;

  return {
    original: email,
    suggested: `${localPart}@${suggestion.suggested}`,
    confidence: suggestion.confidence,
  };
}

export function isCommonDomain(domain: string, commonDomains?: string[]): boolean {
  return (commonDomains ?? commonEmailDomains).includes(domain.toLowerCase());
}

export function getDomainSimilarity(domain1: string, domain2: string): number {
  return stringSimilarity(domain1.toLowerCase(), domain2.toLowerCase());
}
