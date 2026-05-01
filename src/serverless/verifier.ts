/**
 * Edge-runtime / serverless email validator.
 *
 * No Node.js APIs (no `node:net`, no `node:dns`) — DNS is delegated to a
 * caller-supplied `DNSResolver`, so the same code runs on Cloudflare Workers,
 * Vercel Edge, Lambda@Edge, and Deno Deploy.
 *
 * Shares data with the main validator: `commonEmailDomains` and the typo map
 * are imported from `src/data/`, so we never drift between the two surfaces.
 */

import { stringSimilarity } from 'string-similarity-js';
import commonEmailDomainsJson from '../data/common-email-domains.json';
import typoPatternsJson from '../data/typo-patterns.json';
import disposableProviders from '../disposable-email-providers.json';
import freeProviders from '../free-email-providers.json';
import type { DomainSuggesterOptions, EmailValidationResult, ValidateEmailOptions } from '../types';

/** Compact LRU/TTL cache. One Map, expiry stamp per entry, batched eviction. */
export class EdgeCache<T> {
  private readonly cache = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly maxSize = 1000,
    private readonly ttl = 3_600_000
  ) {}

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) this.evict();
    this.cache.set(key, { value, expires: Date.now() + this.ttl });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evict(): void {
    // Drop the oldest 10% in one pass — Map preserves insertion order so
    // `keys()` walks oldest-first.
    const drop = Math.max(1, Math.floor(this.maxSize * 0.1));
    let n = 0;
    for (const key of this.cache.keys()) {
      if (n++ >= drop) break;
      this.cache.delete(key);
    }
  }
}

// Module-level per-isolate caches. Edge runtimes get cold-start fresh; warm
// invocations benefit from the in-memory hits.
export const validationCache = new EdgeCache<EmailValidationResult>(1000);
export const mxCache = new EdgeCache<string[]>(500);

/** Same regex the main validator uses — kept inline because edge runtimes don't auto-resolve psl. */
const VALID_EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Common email domains — re-exported so callers (Vercel Edge, etc.) can pass a
 * custom subset via `DomainSuggesterOptions.customDomains`.
 */
export const COMMON_DOMAINS: readonly string[] = commonEmailDomainsJson as string[];

const TYPO_PATTERNS = typoPatternsJson as Record<string, string[]>;
/** Reverse index for O(1) typo → canonical lookup. */
const TYPO_LOOKUP = new Map<string, string>();
for (const [canonical, typos] of Object.entries(TYPO_PATTERNS)) {
  for (const typo of typos) TYPO_LOOKUP.set(typo, canonical);
}

/** DNS resolver contract — caller-supplied so we don't import `node:dns`. */
export interface DNSResolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveTxt(domain: string): Promise<string[]>;
}

/** No-op resolver for environments where DNS isn't available. */
export class StubDNSResolver implements DNSResolver {
  async resolveMx(): Promise<Array<{ exchange: string; priority: number }>> {
    return [];
  }
  async resolveTxt(): Promise<string[]> {
    return [];
  }
}

/**
 * Suggest a corrected domain. Returns the canonical for a known typo,
 * otherwise the closest match within the threshold, otherwise null.
 */
export function suggestDomain(domain: string, options?: DomainSuggesterOptions): string | null {
  const lower = domain.toLowerCase();

  // Hand-curated typo map first — beats similarity for common cases.
  const known = TYPO_LOOKUP.get(lower);
  if (known) return known;

  const domains = options?.customDomains ?? COMMON_DOMAINS;
  if (domains.includes(lower)) return null;

  const threshold = options?.threshold ?? 2;
  let minDistance = Infinity;
  let suggestion: string | null = null;

  for (const candidate of domains) {
    const candidateLower = candidate.toLowerCase();
    if (lower === candidateLower) return null;
    const similarity = stringSimilarity(lower, candidateLower);
    const distance = Math.round((1 - similarity) * Math.max(domain.length, candidate.length));
    if (distance > 0 && distance <= threshold && distance < minDistance) {
      minDistance = distance;
      suggestion = candidate;
    }
  }
  return suggestion;
}

/**
 * Validate one email — syntax / typo / disposable / free / MX (if a resolver
 * is supplied). Each step is independently flag-gated so callers pay only for
 * what they use.
 */
export async function validateEmailCore(
  email: string,
  options?: ValidateEmailOptions & { dnsResolver?: DNSResolver }
): Promise<EmailValidationResult> {
  const normalized = email.toLowerCase().trim();

  if (!options?.skipCache) {
    const cached = validationCache.get(normalized);
    if (cached) return cached;
  }

  const result: EmailValidationResult = { valid: false, email: normalized, validators: {} };

  if (options?.validateSyntax !== false) {
    const syntaxValid = VALID_EMAIL_REGEX.test(normalized);
    result.validators.syntax = { valid: syntaxValid };
    if (!syntaxValid) {
      validationCache.set(normalized, result);
      return result;
    }
  }

  const [local, domain] = normalized.split('@');
  result.local = local;
  result.domain = domain;

  if (options?.validateTypo !== false) {
    const suggestion = suggestDomain(domain, options?.domainSuggesterOptions);
    result.validators.typo = { valid: !suggestion, suggestion: suggestion ?? undefined };
  }

  if (options?.validateDisposable !== false) {
    result.validators.disposable = { valid: !disposableProviders.includes(domain) };
  }

  if (options?.validateFree !== false) {
    result.validators.free = { valid: !freeProviders.includes(domain) };
  }

  if (options?.validateMx && options.dnsResolver) {
    try {
      const records = await options.dnsResolver.resolveMx(domain);
      const hasMx = records.length > 0;
      result.validators.mx = {
        valid: hasMx,
        records: hasMx ? records.map((r) => r.exchange) : undefined,
      };
    } catch (error) {
      result.validators.mx = {
        valid: false,
        error: error instanceof Error ? error.message : 'MX validation failed',
      };
    }
  }

  // Free-provider detection is informational; only the hard validators gate validity.
  result.valid = (['syntax', 'typo', 'disposable', 'mx'] as const).every((key) => {
    const validator = result.validators[key];
    return !validator || validator.valid !== false;
  });

  if (!options?.skipCache) validationCache.set(normalized, result);
  return result;
}

export async function validateEmailBatch(
  emails: string[],
  options?: ValidateEmailOptions & { dnsResolver?: DNSResolver }
): Promise<EmailValidationResult[]> {
  const chunkSize = options?.batchSize ?? 10;
  const results: EmailValidationResult[] = [];
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map((email) => validateEmailCore(email, options)));
    results.push(...chunkResults);
  }
  return results;
}

export function clearCache(): void {
  validationCache.clear();
  mxCache.clear();
}

export type { DomainSuggesterOptions, EmailValidationResult, ValidateEmailOptions } from '../types';
