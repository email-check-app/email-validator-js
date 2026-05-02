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
 * Parameters for `verifyEmail` — the high-level orchestrator that runs the
 * full pipeline (syntax → typo / name / domain → disposable / free → WHOIS
 * → MX → SMTP).
 */
export interface VerifyEmailParams {
  /** The full email address to verify (`local@domain`). */
  emailAddress: string;
  // ── Step toggles (each defaults are listed inline) ────────────────────────
  /** Resolve MX records via DNS to confirm the domain accepts mail. Default: `true`. */
  verifyMx?: boolean;
  /** Open an SMTP connection to the highest-priority MX and probe `RCPT TO`. Default: `false`. */
  verifySmtp?: boolean;
  /** Check the address against the bundled disposable-provider list. Default: `true`. */
  checkDisposable?: boolean;
  /** Check the address against the bundled free-provider list. Default: `true`. */
  checkFree?: boolean;
  /** Extract first/last name from the local-part. Default: `false` (cheap, but not free). */
  detectName?: boolean;
  /** Suggest a corrected domain on typos (e.g. `gnail.com` → `gmail.com`). Default: `true`. */
  suggestDomain?: boolean;
  /** Look up the domain creation date via WHOIS. Slow + external dep. Default: `false`. */
  checkDomainAge?: boolean;
  /** Look up domain registration status (registered / expired / locked). Default: `false`. */
  checkDomainRegistration?: boolean;
  // ── Skip-on-disposable shortcuts ────────────────────────────────────────
  /**
   * When the address is identified as disposable, skip the (expensive) MX +
   * SMTP probe and accept the disposable verdict as the final answer.
   * Default: `false`.
   */
  skipMxForDisposable?: boolean;
  /**
   * When the address is identified as disposable, skip the WHOIS checks too.
   * Default: `false`.
   */
  skipDomainWhoisForDisposable?: boolean;
  // ── Custom strategies (extension points for callers) ──────────────────────
  /** Override the default name-detection heuristic. Receives the email; returns `DetectedName | null`. */
  nameDetectionMethod?: NameDetectionMethod;
  /** Override the default domain-suggestion heuristic. Receives the domain; returns `DomainSuggestion | null`. */
  domainSuggestionMethod?: DomainSuggestionMethod;
  /** Custom domain list for the typo suggester. Defaults to the bundled common-domain set. */
  commonDomains?: string[];
  // ── SMTP probe wiring ─────────────────────────────────────────────────────
  /**
   * Per-attempt timeout for the SMTP probe, in milliseconds. Bounds both the
   * TCP/TLS connection setup AND the inactivity gap between SMTP commands
   * within an attempt. Default: `4000` ms.
   *
   * To bound the total wall-clock across all MX × port attempts, use
   * `smtpTotalDeadlineMs` instead. To control retries on connection-class
   * failures, use `smtpRetry`.
   */
  smtpPerAttemptTimeoutMs?: number;
  /**
   * Hard cap on total wall-clock time for the SMTP probe across all MX × port
   * × retry attempts. Reasonable when calling from a request handler with a
   * tight latency budget. Default: unbounded.
   */
  smtpTotalDeadlineMs?: number;
  /**
   * Stop the SMTP probe after this many connection-class failures in a row
   * (counting `connection_error` / `connection_timeout` / `connection_closed`
   * across MX × port attempts). Resets on any non-connection-class outcome.
   * Default: unbounded.
   */
  smtpMaxConsecutiveFailures?: number;
  /**
   * Hard cap on how many MX hostnames the SMTP probe will try, regardless of
   * how many DNS returned. Default: unbounded — try them all.
   */
  smtpMaxMxHosts?: number;
  /** Optional retry policy for connection-class failures on a single MX × port. Default: no retries. */
  smtpRetry?: RetryPolicy;
  /**
   * Force a specific port for the SMTP probe (e.g. `587`). When set, this
   * port is the only one tried — overrides the default `[25, 587, 465]` walk
   * and any per-MX hint cached from a previous probe.
   */
  smtpPort?: number;
  // ── WHOIS probe wiring ────────────────────────────────────────────────────
  /** Per-WHOIS-query timeout in milliseconds. Default: `5000`. */
  whoisTimeoutMs?: number;
  // ── Caching + diagnostics ────────────────────────────────────────────────
  /** Optional shared cache for MX, WHOIS, disposable / free, SMTP, and domain results. */
  cache?: Cache;
  /** When true, the pipeline writes a per-line trace to `console.debug`. Default: `false`. */
  debug?: boolean;
  /**
   * When true, populates `result.transcript` with a per-step structured trace
   * covering every subsystem (syntax / disposable / free / MX / SMTP / WHOIS /
   * name detection / domain suggestion). Each step records timing +
   * step-specific details (raw WHOIS data, SMTP transcript, MX records, cache
   * hit/miss, etc.). Safe to leave off for production; turn on for diagnostics
   * or debug UIs. Default: `false`.
   */
  captureTranscript?: boolean;
}

/**
 * Parameters for `verifyEmailBatch` — fan-out wrapper around `verifyEmail`
 * that runs many addresses through the same pipeline with a concurrency cap.
 */
export interface BatchVerifyParams {
  /** Email addresses to verify, in order. */
  emailAddresses: string[];
  /** Maximum number of in-flight `verifyEmail` calls. Default: `5`. */
  concurrency?: number;
  /** Per-attempt SMTP timeout in milliseconds (forwarded to each `verifyEmail` call). Default: `4000`. */
  smtpPerAttemptTimeoutMs?: number;
  /** Hard cap on total wall-clock for each individual SMTP probe. Forwarded to `verifyEmail`. */
  smtpTotalDeadlineMs?: number;
  /** Stop each individual SMTP probe after this many connection-class failures in a row. */
  smtpMaxConsecutiveFailures?: number;
  /** Hard cap on MX hostnames per individual SMTP probe. */
  smtpMaxMxHosts?: number;
  /** Optional retry policy per MX×port for each individual SMTP probe. */
  smtpRetry?: RetryPolicy;
  /** Resolve MX records per address. Default: `true`. */
  verifyMx?: boolean;
  /** Run the SMTP probe per address. Default: `false`. */
  verifySmtp?: boolean;
  /** Check disposable list per address. Default: `true`. */
  checkDisposable?: boolean;
  /** Check free-provider list per address. Default: `true`. */
  checkFree?: boolean;
  /** Extract first/last name from each local-part. Default: `false`. */
  detectName?: boolean;
  /** Override the name-detection heuristic. */
  nameDetectionMethod?: NameDetectionMethod;
  /** Suggest a corrected domain on typos. Default: `false` for batches (it's per-call cost). */
  suggestDomain?: boolean;
  /** Override the domain-suggestion heuristic. */
  domainSuggestionMethod?: DomainSuggestionMethod;
  /** Custom canonical-domain list for the typo suggester. */
  commonDomains?: string[];
  /** Skip MX/SMTP probe for disposable addresses. Default: `false`. */
  skipMxForDisposable?: boolean;
  /** Skip WHOIS lookups for disposable addresses. Default: `false`. */
  skipDomainWhoisForDisposable?: boolean;
  /** Optional shared cache (re-used across all addresses in the batch). */
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

/**
 * Optional retry policy for connection-class failures (timeout / connection
 * error / connection closed) on a single MX × port. Definitive answers
 * (250 / 550 / 552 / etc.) are never retried — they're stable verdicts.
 */
export interface RetryPolicy {
  /**
   * How many extra attempts to make on the same MX × port after a
   * connection-class failure. `0` means no retry (the default).
   */
  attempts: number;
  /**
   * Delay between retries, in milliseconds. With `backoff: 'exponential'`
   * (the default), the actual delay is `delayMs * 2^(attemptIndex - 1)`.
   * Default: `200` ms.
   */
  delayMs?: number;
  /**
   * Backoff strategy between retries.
   * - `'exponential'` (default): `delayMs * 2^(attemptIndex - 1)`.
   * - `'fixed'`: every retry waits `delayMs` exactly.
   */
  backoff?: 'exponential' | 'fixed';
}

/**
 * Options for `verifyMailboxSMTP` and `verifyEmail`'s SMTP probe.
 *
 * Time-budget defaults are tuned for a 4-MX × 3-port worst case. If you
 * call this from a request handler with a tight latency budget, set
 * `totalDeadlineMs` so the probe gives up before your handler does.
 */
export interface SMTPVerifyOptions {
  // ── Connection envelope ───────────────────────────────────────────────────
  /**
   * Ports to walk per MX, in priority order. The probe stops on the first
   * port that yields a definitive answer; indeterminate outcomes (timeout /
   * connection error / etc.) fall through to the next port.
   *
   * Default: `[25, 587, 465]` — plain → STARTTLS-able → implicit-TLS.
   */
  ports?: number[];
  /**
   * Per-attempt timeout in milliseconds. Bounds both the TCP/TLS connection
   * setup AND the inactivity gap between SMTP commands within an attempt.
   * Each MX × port pair gets its own budget — to bound the total wall-clock,
   * use `totalDeadlineMs` instead.
   *
   * Default: `3000` ms.
   */
  perAttemptTimeoutMs?: number;
  /**
   * TLS configuration applied to implicit-TLS ports (465) and to STARTTLS
   * upgrades on plaintext ports.
   *
   * - `true` (default): use sensible TLS defaults (`rejectUnauthorized: false`,
   *   `minVersion: 'TLSv1.2'`) — picks up CA quirks of long-tail MXes.
   * - `false`: disable TLS entirely (port 465 will fail to handshake; STARTTLS
   *   step is skipped).
   * - `SMTPTLSConfig` object: override individual fields. Merged onto the defaults.
   */
  tlsConfig?: boolean | SMTPTLSConfig;
  /**
   * Hostname this client identifies itself as in the `EHLO` / `HELO` argument.
   * Should be a real FQDN — `localhost` from a public IP is a textbook spam-bot
   * signature and gets rejected by careful MXes.
   *
   * Default: `'localhost'`. Override with your delivery domain in production.
   */
  heloHostname?: string;
  // ── Caching ──────────────────────────────────────────────────────────────
  /**
   * Optional cache instance. When provided, the probe reuses prior verdicts
   * keyed on `<primary mx>:<local>@<domain>` and remembers the last
   * successful port per primary MX (so a re-probe skips the failed-port
   * walk).
   *
   * Pass `null` or omit to skip caching entirely.
   */
  cache?: Cache | null;
  /**
   * When true, a per-line `[SMTP] …` trace is written to `console.log`.
   * Useful for diagnosing real-MX behavior; off by default for production.
   */
  debug?: boolean;
  /**
   * When true, the returned `SmtpVerificationResult` carries `transcript`
   * and `commands` arrays prefixed with `<host>:<port>|s| …` /
   * `<host>:<port>|c| …`. Aggregated across every MX × port attempted.
   *
   * Default: `false`. The strings are O(N × wire-bytes); skip when you
   * don't need the trace.
   */
  captureTranscript?: boolean;
  // ── Time budget + early-stop policy ───────────────────────────────────────
  /**
   * Hard cap on total wall-clock time for the entire probe (across all
   * MX × port × retry attempts). When the deadline passes, the in-flight
   * attempt is allowed to finish (it has its own per-attempt budget) and
   * no new attempts are started.
   *
   * Use this to bound latency from a request-handler caller. A reasonable
   * value matches your handler's deadline minus headroom for everything
   * else it does.
   *
   * Default: unbounded — only `perAttemptTimeoutMs × ports.length × mxRecords.length`
   * limits the worst case (e.g. `3000 × 3 × 4 = 36s`).
   */
  totalDeadlineMs?: number;
  /**
   * Stop probing after this many connection-class failures in a row.
   * Counts consecutive `connection_error` / `connection_timeout` /
   * `connection_closed` outcomes across MX × port attempts; resets on any
   * non-connection-class outcome. Useful for cutting off probes when the
   * network path to the MX is wholly unreachable instead of waiting for
   * every port × MX combination to time out.
   *
   * Default: unbounded.
   */
  maxConsecutiveFailures?: number;
  /**
   * Hard cap on how many MX hostnames to try, regardless of how many were
   * supplied in `mxRecords`. The probe walks them in priority order
   * (`mxRecords[0]` first) and stops after this many.
   *
   * Default: unbounded.
   */
  maxMxHosts?: number;
  /**
   * Optional retry policy for connection-class failures on a single MX × port.
   * Definitive answers (250 / 550 / 552 / 421 / etc.) are never retried —
   * they're stable verdicts.
   *
   * Default: no retries.
   */
  retry?: RetryPolicy;
  // ── Dialogue customization ───────────────────────────────────────────────
  /**
   * Override the per-attempt SMTP step list. Defaults to
   * `[greeting, ehlo, startTls, mailFrom, rcptTo]` — covering the entire
   * RFC 5321 envelope plus optional TLS upgrade. Most callers never need
   * to override this; useful for advanced testing scenarios (e.g. probe
   * RFC compliance with `[greeting, helo, mailFrom, rcptTo]`).
   */
  sequence?: SMTPSequence;
  /**
   * Override the random local-part generator used by the catch-all dual
   * probe. Useful for deterministic tests; receives the real local-part
   * and domain so callers can derive a probe-local that matches the MX's
   * syntax rules.
   *
   * Default: `<16 hex chars>-noexist` — long enough to never collide,
   * structured so it's clearly synthetic, and passes common syntax filters.
   */
  catchAllProbeLocal?: (realLocal: string, domain: string) => string;
  /**
   * SMTP PIPELINING (RFC 2920) — batch the envelope phase
   * (RCPT TO real + RCPT TO probe + RSET) into one `socket.write()` when
   * the MX advertises support.
   *
   * - `'auto'` (default): pipeline when EHLO multi-line includes `PIPELINING`,
   *   sequential otherwise.
   * - `'never'`: always sequential — useful for deterministic wire-level
   *   assertions in tests or when investigating a pipeline-buggy MX.
   * - `'force'`: pipeline without checking — testing escape hatch.
   */
  pipelining?: 'auto' | 'never' | 'force';
  /**
   * STARTTLS upgrade on plaintext ports (25, 587). Implicit-TLS ports (465)
   * ignore this option — they're already TLS from the start.
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
