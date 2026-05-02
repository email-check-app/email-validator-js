import type { Cache } from './cache-interface';

/** Error codes set on `VerificationResult.metadata.error` when `verifyEmail` cannot deliver a definitive verdict. */
export enum VerificationErrorCode {
  invalidFormat = 'INVALID_FORMAT',
  invalidDomain = 'INVALID_DOMAIN',
  noMxRecords = 'NO_MX_RECORDS',
  smtpConnectionFailed = 'SMTP_CONNECTION_FAILED',
  smtpTimeout = 'SMTP_TIMEOUT',
  mailboxNotFound = 'MAILBOX_NOT_FOUND',
  networkError = 'NETWORK_ERROR',
  disposableEmail = 'DISPOSABLE_EMAIL',
}

/** Discriminator for `VerificationStep.kind`. */
export type VerificationStepKind =
  | 'syntax'
  | 'domain-validation'
  | 'name-detection'
  | 'domain-suggestion'
  | 'disposable'
  | 'free'
  | 'mx-lookup'
  | 'smtp-probe'
  | 'whois-age'
  | 'whois-registration';

/**
 * One unit of work in the verification pipeline. Produced when
 * `VerifyEmailParams.captureTranscript === true`. The `details` shape varies
 * per step — see the inline interfaces under each kind.
 */
export interface VerificationStep {
  kind: VerificationStepKind;
  startedAt: number;
  durationMs: number;
  /** Whether the step completed without throwing. Step-level result lives in `details`. */
  ok: boolean;
  details: Record<string, unknown>;
}

export interface VerificationResult {
  email: string;
  validFormat: boolean;
  validMx: boolean | null;
  validSmtp: boolean | null;
  isDisposable: boolean;
  isFree: boolean;
  detectedName?: DetectedName | null;
  domainAge?: DomainAgeInfo | null;
  domainRegistration?: DomainRegistrationInfo | null;
  domainSuggestion?: DomainSuggestion | null;
  /** MX records found for the domain (if MX verification was performed) */
  mxRecords?: string[] | null;

  // SMTP verification fields (flattened from SmtpVerificationResult)
  /** Whether SMTP connection was successful */
  canConnectSmtp?: boolean;
  /** Whether the mailbox is full */
  hasFullInbox?: boolean;
  /** Whether the domain has catch-all enabled */
  isCatchAll?: boolean;
  /** Whether the email is deliverable */
  isDeliverable?: boolean;
  /** Whether the email/account is disabled */
  isDisabled?: boolean;

  /** Always populated by `verifyEmail` — read directly without optional chaining. */
  metadata: {
    verificationTime: number;
    cached: boolean;
    error?: VerificationErrorCode;
  };
  /**
   * Per-step trace of what `verifyEmail` did. Present only when
   * `VerifyEmailParams.captureTranscript === true`. Each entry records timing
   * and step-specific details (raw WHOIS data, SMTP transcript, MX records,
   * cache hit/miss, etc.) for debugging and diagnostics.
   */
  transcript?: VerificationStep[];
}

/**
 * Parameters for email verification
 */
export interface VerifyEmailParams {
  emailAddress: string;
  timeout?: number;
  verifyMx?: boolean;
  verifySmtp?: boolean;
  debug?: boolean;
  smtpPort?: number;
  checkDisposable?: boolean;
  checkFree?: boolean;
  detectName?: boolean;
  nameDetectionMethod?: NameDetectionMethod;
  suggestDomain?: boolean;
  domainSuggestionMethod?: DomainSuggestionMethod;
  commonDomains?: string[];
  checkDomainAge?: boolean;
  checkDomainRegistration?: boolean;
  whoisTimeout?: number;
  skipMxForDisposable?: boolean;
  skipDomainWhoisForDisposable?: boolean;
  cache?: Cache;
  /**
   * When true, populates `result.transcript` with a per-step trace covering
   * every subsystem (syntax / disposable / free / MX / SMTP / WHOIS / name
   * detection / domain suggestion). Each step records timing + step-specific
   * structured details. Safe to leave off for production; turn on for
   * diagnostics or building debug UIs.
   */
  captureTranscript?: boolean;
}

/**
 * Parameters for batch verification
 */
export interface BatchVerifyParams {
  emailAddresses: string[];
  concurrency?: number;
  timeout?: number;
  verifyMx?: boolean;
  verifySmtp?: boolean;
  checkDisposable?: boolean;
  checkFree?: boolean;
  detectName?: boolean;
  nameDetectionMethod?: NameDetectionMethod;
  suggestDomain?: boolean;
  domainSuggestionMethod?: DomainSuggestionMethod;
  commonDomains?: string[];
  skipMxForDisposable?: boolean;
  skipDomainWhoisForDisposable?: boolean;
  cache?: Cache;
}

/**
 * Rich cache result types for storing detailed verification results
 */

/**
 * Result for disposable email detection with metadata
 */
export interface DisposableEmailResult {
  /** Whether the email/domain is disposable */
  isDisposable: boolean;
  /** Source that identified this as disposable (e.g., list name, service) */
  source?: string;
  /** Category of disposable email (e.g., 'temp', 'alias', 'forwarding') */
  category?: string;
  /** Timestamp when this was checked */
  checkedAt: number;
}

/**
 * Result for free email provider detection with metadata
 */
export interface FreeEmailResult {
  /** Whether the email/domain is from a free provider */
  isFree: boolean;
  /** Name of the free provider (e.g., 'gmail', 'yahoo', 'outlook') */
  provider?: string;
  /** Timestamp when this was checked */
  checkedAt: number;
}

/**
 * Result for domain validation with metadata
 */
export interface DomainValidResult {
  /** Whether the domain is valid */
  isValid: boolean;
  /** Whether MX records were found */
  hasMX: boolean;
  /** The MX records that were found */
  mxRecords?: string[];
  /** Timestamp when this was checked */
  checkedAt: number;
}

/**
 * Email providers enum
 */
export enum EmailProvider {
  gmail = 'gmail',
  hotmailB2b = 'hotmail_b2b',
  hotmailB2c = 'hotmail_b2c',
  proofpoint = 'proofpoint',
  mimecast = 'mimecast',
  yahoo = 'yahoo',
  everythingElse = 'everything_else',
}

/**
 * Verdict from one `verifyMailboxSMTP` call. Flat by design — every field is
 * one boolean / scalar so callers can switch on a few keys instead of walking
 * a tree.
 */
export interface SmtpVerificationResult {
  /** True when at least one MX×port responded with an SMTP greeting. */
  canConnectSmtp: boolean;
  /** True when the MX returned `552` / `452` (over-quota / mailbox full). */
  hasFullInbox: boolean;
  /**
   * True when both the real RCPT TO and the random-local probe RCPT TO
   * returned `250` — the MX accepts every recipient and the deliverability
   * signal for the real address is unreliable.
   */
  isCatchAll: boolean;
  /** True when the real RCPT TO returned `250` / `251`. */
  isDeliverable: boolean;
  /** True when the real RCPT TO was definitively rejected. */
  isDisabled: boolean;
  /**
   * Short reason key when `isDeliverable === false`. Vocabulary:
   *   `not_found` | `over_quota` | `temporary_failure` | `ambiguous` |
   *   `connection_error` | `connection_timeout` | `connection_closed` |
   *   `tls_upgrade_failed` | `tls_handshake_failed` |
   *   `ehlo_failed` | `helo_failed` | `mail_from_rejected` |
   *   `no_greeting` | `no_mx_records` | `unrecognized_response` |
   *   `step_timeout` | `socket_timeout`
   *
   * Pass to `refineReasonByEnhancedStatus(error, enhancedStatus)` for a
   * richer (mailbox-status-aware) reason when the MX returned a DSN.
   */
  error?: string;
  /** Most recent 3-digit SMTP code observed during the probe. */
  responseCode?: number;
  /**
   * RFC 3463 enhanced status code from the most recent SMTP reply that
   * carried one — e.g. `"5.1.1"` (mailbox unknown), `"5.7.1"` (policy
   * block), `"4.7.0"` (transient policy). Undefined when no MX reply
   * included an enhanced status.
   */
  enhancedStatus?: string;
  /** Operational counters — always populated. See `SmtpProbeMetrics`. */
  metrics?: SmtpProbeMetrics;
  /** Wall-clock timestamp this verdict was produced (set on every result). */
  checkedAt?: number;
  /**
   * Server reply lines, in arrival order, prefixed `<host>:<port>|s| <line>`
   * so multi-MX dialogues stay readable. Present only when
   * `captureTranscript: true` was passed.
   */
  transcript?: string[];
  /**
   * Client commands sent, in send order, prefixed `<host>:<port>|c| <cmd>`.
   * Present only when `captureTranscript: true` was passed.
   */
  commands?: string[];
}

/**
 * Operational counters for one `verifyMailboxSMTP` call. The cost of
 * collecting these is trivial — pure bookkeeping during the existing flow.
 */
export interface SmtpProbeMetrics {
  /** How many MX hostnames the outer loop attempted before stopping. */
  mxAttempts: number;
  /** Total connection attempts across the whole call (sum across MX×port). */
  portAttempts: number;
  /** MX hostnames attempted in priority order (matches `mxRecords` slice). */
  mxHostsTried: string[];
  /**
   * MX hostname that produced the final answer. Undefined when every MX
   * failed (in which case `result.isDeliverable === false` and the SMTP
   * reason is whatever the last attempted MX returned).
   */
  mxHostUsed?: string;
  /** Total wall-clock time the probe spent, in milliseconds. */
  totalDurationMs: number;
}

/**
 * Result for batch verification
 */
export interface BatchVerificationResult {
  results: Map<string, VerificationResult>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    errors: number;
    processingTime: number;
  };
}

/** TLS configuration options for the SMTP probe. */
export interface SMTPTLSConfig {
  rejectUnauthorized?: boolean;
  minVersion?: 'TLSv1.2' | 'TLSv1.3';
}

/**
 * SMTP protocol steps walked by the verifier in order. `startTls` is a
 * conditional step — it sends the STARTTLS command and upgrades the socket
 * to TLS when the MX advertised support (controlled by
 * `SMTPVerifyOptions.startTls`). On implicit-TLS ports (465) it's a no-op.
 */
export enum SMTPStep {
  greeting = 'GREETING',
  ehlo = 'EHLO',
  helo = 'HELO',
  startTls = 'STARTTLS',
  mailFrom = 'MAIL_FROM',
  rcptTo = 'RCPT_TO',
}

/** Custom SMTP step sequence for advanced callers. */
export interface SMTPSequence {
  steps: SMTPStep[];
  /** Override MAIL FROM payload — supply with angle brackets or `<>` for null sender. */
  from?: string;
}

export interface SMTPVerifyOptions {
  ports?: number[];
  timeout?: number;
  tls?: boolean | SMTPTLSConfig;
  hostname?: string;
  cache?: Cache | null;
  debug?: boolean;
  /**
   * When true, the returned `SmtpVerificationResult` carries `transcript` and
   * `commands` arrays prefixed with `<host>:<port>|s| …` / `<host>:<port>|c| …`.
   * Aggregated across every MX×port attempted.
   *
   * Default: `false`. The strings are O(N×wire-bytes); skip when you don't
   * need the trace.
   */
  captureTranscript?: boolean;
  sequence?: SMTPSequence;
  /**
   * Override the random-local-part generator used by the catch-all probe.
   * Useful for deterministic tests; receives the real local-part and domain
   * so callers can derive a probe-local that matches the MX's syntax rules.
   *
   * Default: `<16 hex chars>-noexist` — long enough to never collide,
   * structured so it's clearly synthetic and passes common syntax filters.
   */
  catchAllProbeLocal?: (realLocal: string, domain: string) => string;
  /**
   * Use SMTP PIPELINING (RFC 2920) to batch the envelope phase
   * (RCPT TO real + RCPT TO probe + RSET) into one `socket.write()` when
   * the MX advertises support.
   *
   * - `'auto'` (default): pipeline when EHLO multi-line includes
   *   `PIPELINING`, sequential otherwise.
   * - `'never'`: always sequential — useful for deterministic wire-level
   *   assertions in tests, or when investigating a flaky pipeline-buggy MX.
   * - `'force'`: pipeline without checking — testing escape hatch.
   */
  pipelining?: 'auto' | 'never' | 'force';
  /**
   * Controls STARTTLS upgrade on plaintext ports (25, 587). Implicit-TLS
   * ports (465) ignore this option — they're already TLS from the start.
   *
   * - `'auto'` (default): upgrade if the MX advertises STARTTLS in EHLO.
   *   Submission-port (587) MXes typically require this — without it,
   *   `MAIL FROM` is rejected with `530 Must issue STARTTLS first`.
   * - `'never'`: never upgrade — send `MAIL FROM` / `RCPT TO` in plaintext.
   * - `'force'`: send `STARTTLS` unconditionally. Fails with
   *   `tls_upgrade_failed` when the MX doesn't support it. Testing only.
   */
  startTls?: 'auto' | 'never' | 'force';
}

export interface VerifyMailboxSMTPParams {
  local: string;
  domain: string;
  mxRecords: string[];
  options?: SMTPVerifyOptions;
}

/**
 * Domain suggestion for typo correction
 */
export interface DomainSuggestion {
  original: string;
  suggested: string;
  confidence: number;
}

/**
 * Custom domain suggestion function type
 */
export type DomainSuggestionMethod = (domain: string) => DomainSuggestion | null;

/**
 * Parameters for domain suggestion
 */
export interface DomainSuggestionParams {
  domain: string;
  customMethod?: DomainSuggestionMethod;
  commonDomains?: string[];
  cache?: Cache;
}

/**
 * Result of name detection from email
 */
export interface DetectedName {
  firstName?: string;
  lastName?: string;
  confidence: number;
}

/**
 * Custom name detection function type
 */
export type NameDetectionMethod = (email: string) => DetectedName | null;

/**
 * Parameters for name detection
 */
export interface NameDetectionParams {
  email: string;
  customMethod?: NameDetectionMethod;
}

/**
 * Domain age information
 */
export interface DomainAgeInfo {
  domain: string;
  creationDate: Date;
  ageInDays: number;
  ageInYears: number;
  expirationDate: Date | null;
  updatedDate: Date | null;
}

/**
 * Domain registration status information
 */
export interface DomainRegistrationInfo {
  domain: string;
  isRegistered: boolean;
  isAvailable: boolean;
  status: string[];
  registrar: string | null;
  nameServers: string[];
  expirationDate: Date | null;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  isPendingDelete?: boolean;
  isLocked?: boolean;
}

/**
 * Options for domain suggester
 */
export interface DomainSuggesterOptions {
  threshold?: number;
  customDomains?: string[];
}

/**
 * Parameters for isDisposableEmail function
 */
export interface DisposableEmailCheckParams {
  emailOrDomain: string;
  cache?: Cache | null;
  logger?: (...args: unknown[]) => void;
}

/**
 * Parameters for isFreeEmail function
 */
export interface FreeEmailCheckParams {
  emailOrDomain: string;
  cache?: Cache | null;
  logger?: (...args: unknown[]) => void;
}

/**
 * Parameters for resolveMxRecords function
 */
export interface ResolveMxParams {
  domain: string;
  cache?: Cache | null;
  logger?: (...args: unknown[]) => void;
}

/**
 * Options for email validation (serverless compatible)
 */
export interface ValidateEmailOptions {
  validateSyntax?: boolean;
  validateTypo?: boolean;
  validateDisposable?: boolean;
  validateFree?: boolean;
  validateMx?: boolean;
  validateSMTP?: boolean;
  skipCache?: boolean;
  batchSize?: number;
  domainSuggesterOptions?: DomainSuggesterOptions;
}

/**
 * Result of email validation (serverless compatible)
 */
export interface EmailValidationResult {
  valid: boolean;
  email: string;
  local?: string;
  domain?: string;
  validators: {
    syntax?: ValidatorResult;
    typo?: ValidatorResult & { suggestion?: string };
    disposable?: ValidatorResult;
    free?: ValidatorResult;
    mx?: ValidatorResult & { records?: string[]; error?: string };
    smtp?: ValidatorResult & { error?: string };
  };
}

/**
 * Individual validator result
 */
export interface ValidatorResult {
  valid: boolean;
}

// Re-export cache interfaces
export type { Cache, CacheStore } from './cache-interface';
