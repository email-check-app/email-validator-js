/**
 * Public entry point — pure barrel re-exports.
 *
 * The actual orchestrator (`verifyEmail`) and the list checks
 * (`isDisposableEmail`, `isFreeEmail`) live in their own modules so
 * `batch-verifier.ts` can pull `verifyEmail` directly without going through
 * this file. That broke a `index → batch-verifier → index` Rollup cycle.
 *
 * Anything `export`ed under `src/*.ts` should also be re-exported here so
 * `import { … } from '@emailcheck/email-validator-js'` works for every
 * public symbol. See the audit comment per-line below.
 */

// Cache adapters (LRU, Redis) + the cache interface + default cache helpers.
export * from './adapters/lru-adapter';
export * from './adapters/redis-adapter';
// Top-level orchestrators.
export { verifyEmailBatch } from './batch-verifier';
export * from './cache';
export * from './cache-interface';
// Domain-suggestion utilities (sync + async + similarity scoring).
export {
  commonEmailDomains,
  defaultDomainSuggestionMethod,
  defaultDomainSuggestionMethodAsync,
  getDomainSimilarity,
  isCommonDomain,
  suggestDomain,
  suggestEmailDomain,
} from './domain-suggester';

// Direct subsystem APIs — callers can use these without going through
// `verifyEmail` when they only need one piece (MX lookup, SMTP probe,
// disposable / free check, WHOIS, syntax validation, etc.).
export { isValidEmail, isValidEmailDomain } from './email-validator';
export { isDisposableEmail } from './is-disposable-email';
export { isFreeEmail } from './is-free-email';
export { isSpamEmail } from './is-spam-email';
export { isSpamName } from './is-spam-name';
export { resolveMxRecords } from './mx-resolver';
// Name-detection utilities (default heuristic + algorithm-clean variants).
export {
  cleanNameForAlgorithm,
  defaultNameDetectionMethod,
  detectName,
  detectNameForAlgorithm,
  detectNameFromEmail,
} from './name-detector';
export { refineReasonByEnhancedStatus } from './refine-reason';
export { type ParsedSmtpError, parseSmtpError } from './smtp-error-parser';
export { type ParsedDsn, parseDsn, verifyMailboxSMTP } from './smtp-verifier';
// Transcript collector primitives — opt-in pipeline tracing.
export {
  ArrayTranscriptCollector,
  NULL_COLLECTOR,
  type TranscriptCollector,
} from './transcript';
// All type definitions live in one module; re-export everything so callers
// can import any of them directly from the package root.
export * from './types';
export { domainPorts, verifyEmail } from './verify-email';
export { getDomainAge, getDomainRegistrationStatus } from './whois';
export { type ParsedWhoisResult, parseWhoisData } from './whois-parser';
