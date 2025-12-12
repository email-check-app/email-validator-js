import type { ICache } from './cache-interface';

/**
 * Error codes for email verification failures
 */
export enum VerificationErrorCode {
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_DOMAIN = 'INVALID_DOMAIN',
  NO_MX_RECORDS = 'NO_MX_RECORDS',
  SMTP_CONNECTION_FAILED = 'SMTP_CONNECTION_FAILED',
  SMTP_TIMEOUT = 'SMTP_TIMEOUT',
  MAILBOX_NOT_FOUND = 'MAILBOX_NOT_FOUND',
  MAILBOX_FULL = 'MAILBOX_FULL',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DISPOSABLE_EMAIL = 'DISPOSABLE_EMAIL',
  FREE_EMAIL_PROVIDER = 'FREE_EMAIL_PROVIDER',
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
  metadata?: {
    verificationTime: number;
    cached: boolean;
    error?: VerificationErrorCode;
  };
}

/**
 * Parameters for email verification
 */
export interface IVerifyEmailParams {
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
  skipMxForDisposable?: boolean; // Skip MX check if disposable email detected
  skipDomainWhoisForDisposable?: boolean; // Skip domain age/registration if disposable email detected
  cache?: ICache; // Optional custom cache instance
}

/**
 * Parameters for batch verification
 */
export interface IBatchVerifyParams {
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
  skipMxForDisposable?: boolean; // Skip MX check if disposable email detected
  skipDomainWhoisForDisposable?: boolean; // Skip domain age/registration if disposable email detected
  cache?: ICache; // Optional custom cache instance
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
  GREETING = 'GREETING',
  EHLO = 'EHLO',
  HELO = 'HELO',
  STARTTLS = 'STARTTLS',
  MAIL_FROM = 'MAIL_FROM',
  RCPT_TO = 'RCPT_TO',
  VRFY = 'VRFY',
  QUIT = 'QUIT',
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
  cache?: ICache | null; // Cache instance or null/undefined for no caching
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
export interface ISuggestDomainParams {
  domain: string;
  customMethod?: DomainSuggestionMethod;
  commonDomains?: string[];
  cache?: ICache;
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
export interface IDetectNameParams {
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
export interface IDisposableEmailParams {
  emailOrDomain: string;
  cache?: ICache | null;
  logger?: (...args: unknown[]) => void;
}

/**
 * Parameters for isFreeEmail function
 */
export interface IFreeEmailParams {
  emailOrDomain: string;
  cache?: ICache | null;
  logger?: (...args: unknown[]) => void;
}

/**
 * Parameters for resolveMxRecords function
 */
export interface IResolveMxParams {
  domain: string;
  cache?: ICache | null;
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
export type { ICache, ICacheStore } from './cache-interface';
