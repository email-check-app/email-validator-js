/**
 * Public entry point — pure barrel re-exports.
 *
 * The actual orchestrator (`verifyEmail`) and the list checks
 * (`isDisposableEmail`, `isFreeEmail`) live in their own modules so
 * `batch-verifier.ts` can pull `verifyEmail` directly without going through
 * this file. That broke a `index → batch-verifier → index` Rollup cycle.
 */

export * from './adapters/lru-adapter';
export * from './adapters/redis-adapter';
export { verifyEmailBatch } from './batch-verifier';
export * from './cache';
export * from './cache-interface';
export {
  commonEmailDomains,
  defaultDomainSuggestionMethod,
  getDomainSimilarity,
  isCommonDomain,
  suggestDomain,
  suggestEmailDomain,
} from './domain-suggester';
export { isValidEmail, isValidEmailDomain } from './email-validator';
export { isDisposableEmail } from './is-disposable-email';
export { isFreeEmail } from './is-free-email';
export { isSpamEmail } from './is-spam-email';
export { isSpamName } from './is-spam-name';
export {
  cleanNameForAlgorithm,
  defaultNameDetectionMethod,
  detectName,
  detectNameForAlgorithm,
  detectNameFromEmail,
} from './name-detector';
export { refineReasonByEnhancedStatus } from './refine-reason';
export { type ParsedSmtpError, parseSmtpError } from './smtp-error-parser';
export {
  ArrayTranscriptCollector,
  NULL_COLLECTOR,
  type TranscriptCollector,
} from './transcript';
// Re-export types
export * from './types';
export { domainPorts, verifyEmail } from './verify-email';
export { getDomainAge, getDomainRegistrationStatus } from './whois';
