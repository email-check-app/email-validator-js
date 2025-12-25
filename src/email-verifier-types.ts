/**
 * Type definitions for email verification functionality
 * Based on the original Rust implementation's type structure
 */

import type { ICache } from './cache-interface';

/**
 * Email providers with enhanced type safety
 */
export enum EmailProvider {
  GMAIL = 'gmail',
  HOTMAIL_B2B = 'hotmail_b2b',
  HOTMAIL_B2C = 'hotmail_b2c',
  PROOFPOINT = 'proofpoint',
  MIMECAST = 'mimecast',
  YAHOO = 'yahoo',
  EVERYTHING_ELSE = 'everything_else',
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
  can_connect_smtp: boolean;
  has_full_inbox: boolean;
  is_catch_all: boolean;
  is_deliverable: boolean;
  is_disabled: boolean;
  error?: string;
  provider_used?: EmailProvider;
  // Additional properties for compatibility
  success?: boolean;
  can_connect?: boolean;
  response_code?: number;
  provider_specific?: {
    error_code?: string;
    action_required?: string;
    details?: string;
  };
}

/**
 * MX record lookup result
 */
export interface MxLookupResult {
  success: boolean;
  records: Array<{ exchange: string; priority: number }>;
  lowest_priority?: { exchange: string; priority: number };
  error?: string;
  code?: string;
}

/**
 * Email syntax validation result
 */
export interface EmailSyntaxResult {
  is_valid: boolean;
  email?: string;
  local_part?: string;
  domain?: string;
  error?: string;
}

export interface CheckIfEmailExistsCoreResult {
  email: string;
  is_reachable: 'safe' | 'invalid' | 'risky' | 'unknown';
  syntax: {
    is_valid: boolean;
    domain?: string;
    local_part?: string;
    error?: string;
  };
  mx: MxLookupResult | null;
  smtp: SmtpVerificationResult | null;
  misc: {
    is_disposable: boolean;
    is_free: boolean;
    provider_type: EmailProvider;
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
      is_valid: boolean;
      domain?: string;
      local_part?: string;
    };
    provider?: EmailProvider;
    is_deliverable?: boolean;
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
