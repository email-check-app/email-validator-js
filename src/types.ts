import type { Cache } from './cache-interface';

/**
 * Error codes for email verification failures
 */
export enum VerificationErrorCode {
  invalidFormat = 'INVALID_FORMAT',
  invalidDomain = 'INVALID_DOMAIN',
  noMxRecords = 'NO_MX_RECORDS',
  smtpConnectionFailed = 'SMTP_CONNECTION_FAILED',
  smtpTimeout = 'SMTP_TIMEOUT',
  mailboxNotFound = 'MAILBOX_NOT_FOUND',
  mailboxFull = 'MAILBOX_FULL',
  networkError = 'NETWORK_ERROR',
  disposableEmail = 'DISPOSABLE_EMAIL',
  freeEmailProvider = 'FREE_EMAIL_PROVIDER',
}

/**
 * Main verification result interface (flat structure)
 */
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

  /**
   * Always populated by `verifyEmail`. Optional in older shapes is gone —
   * callers can read it directly without optional chaining.
   */
  metadata: {
    verificationTime: number;
    cached: boolean;
    error?: VerificationErrorCode;
  };
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
 * Result for SMTP verification with metadata
 * Uses camelCase for consistency with TypeScript conventions
 */
export interface SmtpVerificationResult {
  /** Whether SMTP connection was successful */
  canConnectSmtp: boolean;
  /** Whether the mailbox is full */
  hasFullInbox: boolean;
  /** Whether the domain has catch-all enabled */
  isCatchAll: boolean;
  /** Whether the email is deliverable */
  isDeliverable: boolean;
  /** Whether the email/account is disabled */
  isDisabled: boolean;
  /** Error message if verification failed */
  error?: string;
  /** Which provider was detected/used */
  providerUsed?: EmailProvider;
  /** Additional compatibility properties */
  success?: boolean;
  canConnect?: boolean;
  responseCode?: number;
  /** Provider-specific error details */
  providerSpecific?: {
    errorCode?: string;
    actionRequired?: string;
    details?: string;
  };
  /** Timestamp when this was checked (for cache) */
  checkedAt?: number;
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
 * SMTP protocol steps. Only the steps the verifier actually walks are listed —
 * STARTTLS upgrade, VRFY, and QUIT used to be separate enum members but were
 * never reachable from production callers.
 */
export enum SMTPStep {
  greeting = 'GREETING',
  ehlo = 'EHLO',
  helo = 'HELO',
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
  sequence?: SMTPSequence;
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
