/**
 * Post-hoc classifier for free-form SMTP error messages.
 *
 * The library's own probe (`smtp-verifier.ts`) classifies live SMTP replies at
 * the wire level — that flow does not use this function. `parseSmtpError` is
 * a public utility for callers who have a flattened error string in hand
 * (e.g. `result.smtp.error`, the `message` of a thrown exception, or a
 * provider-specific bounce message logged elsewhere) and want a structured
 * verdict.
 *
 * Returns four orthogonal signals:
 *   - `isDisabled`    — recipient does not exist / account locked / blocked
 *   - `hasFullInbox`  — quota / storage limit / 452 / 552
 *   - `isCatchAll`    — domain accepts every recipient
 *   - `isInvalid`     — caller-friendly default: nothing else matched and the
 *                       error isn't a known transient/rate-limit pattern
 *
 * The categories are independent — a single message can be both `isDisabled`
 * and `hasFullInbox` if its text matches both groups.
 */
export interface ParsedSmtpError {
  isDisabled: boolean;
  hasFullInbox: boolean;
  isCatchAll: boolean;
  isInvalid: boolean;
}

/** Connection-level OS errors that surface in `error.message` strings. */
const NETWORK_ERROR_PATTERNS = [
  'etimedout',
  'econnrefused',
  'enotfound',
  'econnreset',
  'socket hang up',
  'connection_timeout',
  'socket_timeout',
  'connection_error',
  'connection_closed',
];

/** Permanent rejections that imply "the recipient does not exist or is blocked". */
const DISABLED_PATTERNS = [
  'account disabled',
  'account is disabled',
  'user disabled',
  'user is disabled',
  'account locked',
  'account is locked',
  'user blocked',
  'user is blocked',
  'mailbox disabled',
  'delivery not authorized',
  'message rejected',
  'access denied',
  'permission denied',
  'recipient unknown',
  'recipient address rejected',
  'user unknown',
  'address unknown',
  'invalid recipient',
  'not a valid recipient',
  'recipient does not exist',
  'no such user',
  'user does not exist',
  'mailbox unavailable',
  'recipient unavailable',
  'address rejected',
  'not_found',
  'ambiguous',
];

const FULL_INBOX_PATTERNS = [
  'mailbox full',
  'inbox full',
  'quota exceeded',
  'over quota',
  'storage limit exceeded',
  'message too large',
  'insufficient storage',
  'mailbox over quota',
  'over the quota',
  'mailbox size limit exceeded',
  'account over quota',
  'storage space',
  'overquota',
  'over_quota',
];

const CATCH_ALL_PATTERNS = [
  'accept all mail',
  'catch-all',
  'catchall',
  'wildcard',
  'accepts any recipient',
  'recipient address accepted',
];

const RATE_LIMIT_PATTERNS = [
  'receiving mail at a rate that',
  'rate limit',
  'too many messages',
  'temporarily rejected',
  'try again later',
  'greylisted',
  'greylist',
  'deferring',
  'temporarily deferred',
  'temporary_failure',
];

/** SMTP basic codes that imply each category, anywhere in the message. */
const DISABLED_CODES = ['550', '551', '553'] as const;
const FULL_INBOX_CODES = ['452', '552'] as const;
const RATE_LIMIT_CODES = ['421', '450', '451'] as const;

const NETWORK_RESULT: ParsedSmtpError = {
  isDisabled: false,
  hasFullInbox: false,
  isCatchAll: false,
  isInvalid: true,
};

function matchesAny(haystack: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => haystack.includes(p));
}

function startsWithAny(haystack: string, codes: readonly string[]): boolean {
  return codes.some((c) => haystack.startsWith(c));
}

/**
 * Classify a free-form SMTP error message. Empty / null input returns the
 * "everything-false except isInvalid" shape since we have no signal.
 */
export function parseSmtpError(errorMessage: string): ParsedSmtpError {
  const lower = (errorMessage ?? '').toLowerCase();

  // Network errors short-circuit — no recipient-level signal possible.
  if (matchesAny(lower, NETWORK_ERROR_PATTERNS)) return NETWORK_RESULT;

  const isDisabled = matchesAny(lower, DISABLED_PATTERNS) || startsWithAny(lower, DISABLED_CODES);
  const hasFullInbox = matchesAny(lower, FULL_INBOX_PATTERNS) || startsWithAny(lower, FULL_INBOX_CODES);
  const isCatchAll = matchesAny(lower, CATCH_ALL_PATTERNS);
  const isRateLimited = matchesAny(lower, RATE_LIMIT_PATTERNS) || startsWithAny(lower, RATE_LIMIT_CODES);

  // `isInvalid` is the conservative default — only when nothing else fired and
  // the error isn't a known transient pattern. Callers can use it as the
  // "should I treat this address as bad" signal.
  const isInvalid = !isDisabled && !hasFullInbox && !isCatchAll && !isRateLimited;

  return { isDisabled, hasFullInbox, isCatchAll, isInvalid };
}
