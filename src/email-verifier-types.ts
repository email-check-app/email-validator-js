/**
 * Type definitions for email verification functionality
 * Based on the original Rust implementation's type structure
 */

import type { ICache } from './cache-interface';

/**
 * Email providers with enhanced type safety
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
 * Provider-specific configuration and capabilities
 */
export interface ProviderConfig {
  provider: EmailProvider;
  domains: readonly string[];
  capabilities: {
    plusAddressing: boolean;
    dotsSignificant: boolean;
    underscoresAllowed: boolean;
    maxLocalLength: number;
    supportsApi: boolean;
    supportsHeadless: boolean;
  };
  smtpSettings: {
    preferredPorts: readonly number[];
    connectTimeout: number;
    readTimeout: number;
    requiresTls?: boolean;
    customHeaders?: Record<string, string>;
  };
}

/**
 * SMTP verification result with enhanced typing
 */
export interface SmtpVerificationResult {
  canConnectSmtp: boolean;
  hasFullInbox: boolean;
  isCatchAll: boolean;
  isDeliverable: boolean;
  isDisabled: boolean;
  error?: string;
  providerUsed?: EmailProvider;
  // Additional properties for compatibility
  success?: boolean;
  canConnect?: boolean;
  responseCode?: number;
  providerSpecific?: {
    errorCode?: string;
    actionRequired?: string;
    details?: string;
  };
}

/**
 * MX record lookup result
 */
export interface MxLookupResult {
  success: boolean;
  records: Array<{ exchange: string; priority: number }>;
  lowestPriority?: { exchange: string; priority: number };
  error?: string;
  code?: string;
}

/**
 * Email syntax validation result
 */
export interface EmailSyntaxResult {
  isValid: boolean;
  email?: string;
  localPart?: string;
  domain?: string;
  error?: string;
}

/**
 * Complete check-if-email-exists result
 */
export interface CheckIfEmailExistsCoreResult {
  email: string;
  isReachable: 'safe' | 'invalid' | 'risky' | 'unknown';
  syntax: {
    isValid: boolean;
    domain?: string;
    localPart?: string;
    error?: string;
  };
  mx: MxLookupResult | null;
  smtp: SmtpVerificationResult | null;
  misc: {
    isDisposable: boolean;
    isFree: boolean;
    providerType: EmailProvider;
  } | null;
  duration: number;
  error?: string;
}

/**
 * SMTP connection options with enhanced typing
 */
export interface CheckIfEmailExistsSmtpOptions {
  timeout?: number;
  port?: number;
  retries?: number;
  fromEmail?: string;
  helloName?: string;
  useStartTls?: boolean;
  useSsl?: boolean;
  hostName?: string;
  rejectUnauthorized?: boolean;
}

/**
 * Yahoo API verification options
 */
export interface YahooApiOptions {
  timeout?: number;
  userAgent?: string;
  retryAttempts?: number;
  proxyUrl?: string;
  headers?: Record<string, string>;
  apiUrl?: string;
}

/**
 * Headless browser verification options
 */
export interface HeadlessOptions {
  webdriverEndpoint?: string;
  timeout?: number;
  retryAttempts?: number;
  screenshot?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  acceptInsecureCerts?: boolean;
}

/**
 * Error parsing types
 */
export interface ParsedSmtpError {
  type: 'disabled' | 'full_inbox' | 'unknown' | 'invalid' | 'catch_all' | 'rate_limited' | 'blocked';
  severity: 'permanent' | 'temporary' | 'unknown';
  message: string;
  originalMessage: string;
  providerSpecific?: {
    code?: string;
    action?: string;
    details?: string;
  };
}

/**
 * Enhanced verification parameters
 */
export interface ICheckIfEmailExistsCoreParams {
  emailAddress: string;
  timeout?: number;
  verifyMx?: boolean;
  verifySmtp?: boolean;
  debug?: boolean;
  checkDisposable?: boolean;
  checkFree?: boolean;
  cache?: ICache | null;
  smtpTimeout?: number;
  fromEmail?: string;
  helloName?: string;
  smtpOptions?: CheckIfEmailExistsSmtpOptions;
  enableProviderOptimizations?: boolean;
  // Yahoo-specific options
  useYahooApi?: boolean;
  useYahooHeadless?: boolean;
  yahooApiOptions?: YahooApiOptions;
  // Headless options
  useHeadless?: boolean;
  headlessOptions?: HeadlessOptions;
}

/**
 * Test-specific types
 */
export interface EmailTestCase {
  email: string;
  expected: {
    syntax: {
      isValid: boolean;
      domain?: string;
      localPart?: string;
    };
    provider?: EmailProvider;
    isDeliverable?: boolean;
    error?: string;
  };
  description?: string;
  category: 'valid' | 'invalid' | 'edge_case' | 'provider_specific';
}

export interface MockSmtpServer {
  domain: string;
  provider: EmailProvider;
  responses: Map<string, { code: number; message: string }>;
  connected: boolean;
}

/**
 * Performance metrics
 */
export interface VerificationMetrics {
  duration: number;
  steps: {
    syntax: number;
    mx: number;
    smtp: number;
    misc: number;
  };
  cache_hits: number;
  cache_misses: number;
}
