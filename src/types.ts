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

  metadata?: {
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
  retryAttempts?: number;
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

/**
 * Parse SMTP error message to determine error type
 * Handles both SMTP protocol errors and system/network errors
 */
export function parseSmtpError(errorMessage: string): {
  isDisabled: boolean;
  hasFullInbox: boolean;
  isInvalid: boolean;
  isCatchAll: boolean;
} {
  const lowerError = errorMessage.toLowerCase();

  // Check for network/connection errors first
  const networkErrorPatterns = [
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

  const isNetworkError = networkErrorPatterns.some((pattern) => lowerError.includes(pattern));

  // If it's a network error, return as invalid (not deliverable)
  if (isNetworkError) {
    return {
      isDisabled: false,
      hasFullInbox: false,
      isInvalid: true,
      isCatchAll: false,
    };
  }

  // Check for disabled account
  const disabledPatterns = [
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
    '550',
    '551',
    '553',
    'not_found',
    'ambiguous',
  ];

  // Check for full inbox
  const fullInboxPatterns = [
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
    '452',
    '552',
    'over_quota',
  ];

  // Check for catch-all (accepts all recipients)
  const catchAllPatterns = [
    'accept all mail',
    'catch-all',
    'catchall',
    'wildcard',
    'accepts any recipient',
    'recipient address accepted',
  ];

  // Check for rate limiting but still deliverable
  const rateLimitPatterns = [
    'receiving mail at a rate that',
    'rate limit',
    'too many messages',
    'temporarily rejected',
    'try again later',
    'greylisted',
    'greylist',
    'deferring',
    'temporarily deferred',
    '421',
    '450',
    '451',
    'temporary_failure',
  ];

  const isDisabled =
    disabledPatterns.some((pattern) => lowerError.includes(pattern)) ||
    lowerError.startsWith('550') ||
    lowerError.startsWith('551') ||
    lowerError.startsWith('553');
  const hasFullInbox =
    fullInboxPatterns.some((pattern) => lowerError.includes(pattern)) ||
    lowerError.startsWith('452') ||
    lowerError.startsWith('552');
  const isCatchAll = catchAllPatterns.some((pattern) => lowerError.includes(pattern));
  const isInvalid =
    !isDisabled &&
    !hasFullInbox &&
    !isCatchAll &&
    !rateLimitPatterns.some((pattern) => lowerError.includes(pattern)) &&
    !lowerError.startsWith('421') &&
    !lowerError.startsWith('450') &&
    !lowerError.startsWith('451');

  return {
    isDisabled,
    hasFullInbox,
    isInvalid,
    isCatchAll,
  };
}

/**
 * Port configuration for SMTP verification
 */
export interface SMTPPortConfig {
  ports: number[];
  timeout: number;
  maxRetries: number;
}

/**
 * TLS configuration options
 */
export interface SMTPTLSConfig {
  rejectUnauthorized?: boolean;
  minVersion?: 'TLSv1.2' | 'TLSv1.3';
}

/**
 * SMTP protocol steps enum
 */
export enum SMTPStep {
  greeting = 'GREETING',
  ehlo = 'EHLO',
  helo = 'HELO',
  startTls = 'STARTTLS',
  mailFrom = 'MAIL_FROM',
  rcptTo = 'RCPT_TO',
  vrfy = 'VRFY',
  quit = 'QUIT',
}

/**
 * Custom SMTP sequence configuration
 */
export interface SMTPSequence {
  steps: SMTPStep[];
  from?: string;
  vrfyTarget?: string;
}

/**
 * SMTP verification options
 */
export interface SMTPVerifyOptions {
  ports?: number[];
  timeout?: number;
  maxRetries?: number;
  tls?: boolean | SMTPTLSConfig;
  hostname?: string;
  useVRFY?: boolean;
  cache?: Cache | null; // Cache instance or null/undefined for no caching
  debug?: boolean;
  sequence?: SMTPSequence; // Custom step sequence
}

/**
 * SMTP verification parameters
 */
export interface VerifyMailboxSMTPParams {
  local: string;
  domain: string;
  mxRecords: string[];
  options?: SMTPVerifyOptions;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  maxConnections?: number;
  maxIdleTime?: number;
  connectionTimeout?: number;
}

/**
 * Email suggestion for typo correction (deprecated - use DomainSuggestion)
 */
export interface EmailSuggestion {
  original: string;
  suggested: string;
  confidence: number;
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
 * WHOIS data structure
 */
export interface WhoisData {
  domainName: string | null;
  registrar: string | null;
  creationDate: Date | null;
  expirationDate: Date | null;
  updatedDate: Date | null;
  status: string[];
  nameServers: string[];
  rawData: string;
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
