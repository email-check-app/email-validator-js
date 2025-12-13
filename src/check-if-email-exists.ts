import { promises as dns } from 'node:dns';
import type { ICache } from './cache-interface';
import { isDisposableEmail, isFreeEmail } from './index';
import type { IVerifyEmailParams } from './types';

// Constants for common providers
export const CHECK_IF_EMAIL_EXISTS_CONSTANTS = {
  GMAIL_DOMAINS: ['gmail.com', 'googlemail.com'],
  YAHOO_DOMAINS: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
  HOTMAIL_DOMAINS: ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'],
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_SMTP_PORT: 25,
  DEFAULT_FROM_EMAIL: 'test@example.com',
  DEFAULT_HELLO_NAME: 'example.com',
} as const;

/**
 * Email providers as defined in the original Rust implementation
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
 * SMTP verification result matching the original SmtpDetails structure
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
 * Complete check-if-email-exists result
 */
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
 * SMTP connection options
 */
export interface CheckIfEmailExistsSmtpOptions {
  timeout?: number;
  port?: number;
  retries?: number;
  fromEmail?: string;
  helloName?: string;
  useStartTls?: boolean;
}

/**
 * Enhanced verification parameters for check-if-email-exists functionality
 */
export interface ICheckIfEmailExistsCoreParams extends Omit<IVerifyEmailParams, 'cache'> {
  cache?: ICache | null;
  smtpTimeout?: number;
  fromEmail?: string;
  helloName?: string;
  smtpOptions?: CheckIfEmailExistsSmtpOptions;
  enableProviderOptimizations?: boolean;
}

/**
 * Enhanced syntax validation with RFC 5321 compliance
 */
export function validateEmailSyntax(email: string): {
  is_valid: boolean;
  email?: string;
  local_part?: string;
  domain?: string;
  error?: string;
} {
  if (!email || typeof email !== 'string') {
    return {
      is_valid: false,
      error: 'Invalid input: email must be a string',
    };
  }

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  const emailLower = email.toLowerCase().trim();

  // Length checks according to RFC first
  if (!emailLower.includes('@')) {
    return {
      is_valid: false,
      error: 'Invalid email format',
    };
  }

  const [localPart, domain] = emailLower.split('@');

  if (localPart.length > 64) {
    return {
      is_valid: false,
      error: 'Local part exceeds 64 characters',
    };
  }

  if (domain.length > 253) {
    return {
      is_valid: false,
      error: 'Domain exceeds 253 characters',
    };
  }

  // Basic format check
  if (!emailRegex.test(emailLower)) {
    return {
      is_valid: false,
      error: 'Invalid email format',
    };
  }

  // Check for invalid characters/sequences
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return {
      is_valid: false,
      error: 'Local part cannot start or end with a dot',
    };
  }

  if (localPart.includes('..')) {
    return {
      is_valid: false,
      error: 'Local part cannot contain consecutive dots',
    };
  }

  return {
    is_valid: true,
    email: emailLower,
    local_part: localPart,
    domain: domain,
  };
}

/**
 * Provider detection functions matching the original Rust implementation
 */
export function isGmail(host: string): boolean {
  const gmailPatterns = [
    /gmail-smtp-in\.l\.google\.com/,
    /alt\d*\.gmail-smtp-in\.l\.google\.com/,
    /aspmx\.l\.google\.com/,
    /mail\.gmail\.com/,
    /\.gmail\.com$/,
    /google\.com$/,
    /googlemail\.com$/,
    /\.google\.com$/,
  ];

  return gmailPatterns.some((pattern) => pattern.test(host.toLowerCase()));
}

export function isYahoo(host: string): boolean {
  const yahooPatterns = [
    /mta\d*\.am0\.yahoodns\.net/,
    /mx-eu\.mail\.am0\.yahoodns\.net/,
    /\.yahoo\.com$/,
    /\.ymail\.com$/,
    /\.rocketmail\.com$/,
    /yahoodns\.net$/,
  ];

  return yahooPatterns.some((pattern) => pattern.test(host.toLowerCase()));
}

export function isHotmailB2C(host: string): boolean {
  const hotmailB2CPatterns = [
    /hotmail-com\.olc\.protection\.outlook\.com/,
    /outlook-com\.olc\.protection\.outlook\.com/,
    /eur\.olc\.protection\.outlook\.com/,
  ];

  const hotmailB2BPatterns = [/mail\.protection\.outlook\.com/, /company-com\.mail\.protection\.outlook\.com/];

  // Ensure it's B2C only if it matches B2C patterns but NOT B2B patterns
  return (
    hotmailB2CPatterns.some((pattern) => pattern.test(host.toLowerCase())) &&
    !hotmailB2BPatterns.some((pattern) => pattern.test(host.toLowerCase()))
  );
}

export function isHotmailB2B(host: string): boolean {
  const hotmailB2BPatterns = [
    /mail\.protection\.outlook\.com/,
    /company-com\.mail\.protection\.outlook\.com/,
    /^[^.]+\.protection\.outlook\.com$/,
  ];

  return hotmailB2BPatterns.some((pattern) => pattern.test(host.toLowerCase()));
}

export function isProofpoint(host: string): boolean {
  const proofpointPatterns = [/pphosted\.com/, /ppe-hosted\.com/, /proofpoint/];

  return proofpointPatterns.some((pattern) => pattern.test(host.toLowerCase()));
}

export function isMimecast(host: string): boolean {
  const mimecastPatterns = [/smtp\.mimecast\.com/, /eu\.mimecast\.com/, /mimecast/];

  return mimecastPatterns.some((pattern) => pattern.test(host.toLowerCase()));
}

/**
 * Provider detection from MX host (matching original implementation)
 */
export function getProviderFromMxHost(host: string): EmailProvider {
  if (isGmail(host)) {
    return EmailProvider.GMAIL;
  } else if (isYahoo(host)) {
    return EmailProvider.YAHOO;
  } else if (isHotmailB2B(host)) {
    return EmailProvider.HOTMAIL_B2B;
  } else if (isHotmailB2C(host)) {
    return EmailProvider.HOTMAIL_B2C;
  } else if (isProofpoint(host)) {
    return EmailProvider.PROOFPOINT;
  } else if (isMimecast(host)) {
    return EmailProvider.MIMECAST;
  } else {
    return EmailProvider.EVERYTHING_ELSE;
  }
}

/**
 * Get provider type for known email providers (legacy function)
 */
export function getProviderType(domain: string): EmailProvider {
  const { GMAIL_DOMAINS, YAHOO_DOMAINS, HOTMAIL_DOMAINS } = CHECK_IF_EMAIL_EXISTS_CONSTANTS;

  if (GMAIL_DOMAINS.some((d) => domain === d)) return EmailProvider.GMAIL;
  if (YAHOO_DOMAINS.some((d) => domain === d)) return EmailProvider.YAHOO;
  if (HOTMAIL_DOMAINS.some((d) => domain === d)) return EmailProvider.HOTMAIL_B2C;
  return EmailProvider.EVERYTHING_ELSE;
}

/**
 * Enhanced MX record lookup with caching support
 */
export async function queryMxRecords(
  domain: string,
  options: {
    timeout?: number;
    cache?: ICache | null;
  } = {}
): Promise<MxLookupResult> {
  const { timeout = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT, cache } = options;

  // Check cache first
  if (cache && cache.mx) {
    try {
      const cached = await cache.mx.get(domain);
      if (cached !== null && cached !== undefined) {
        // Reconstruct MxLookupResult from cached MX hosts
        const records = cached.map((host, index) => ({
          exchange: host,
          priority: index + 1,
        }));
        return {
          success: true,
          records,
          lowest_priority: records[0],
        };
      }
    } catch (error) {
      // Cache error, continue with processing
    }
  }

  try {
    const mxRecords = await dns.resolveMx(domain);

    if (mxRecords.length === 0) {
      const result: MxLookupResult = {
        success: false,
        records: [],
        error: 'No MX records found',
      };

      // Cache the result (only cache successful MX lookups)
      if (cache && cache.mx && result.success) {
        try {
          const mxHosts = result.records.map((r) => r.exchange);
          await cache.mx.set(domain, mxHosts);
        } catch (error) {
          // Cache error, ignore it
        }
      }

      return result;
    }

    // Sort by preference (lower = higher priority)
    // Handle both 'priority' and 'preference' property names
    mxRecords.sort((a, b) => {
      const aPriority = (a as any).preference || a.priority;
      const bPriority = (b as any).preference || b.priority;
      return aPriority - bPriority;
    });

    const firstRecord = mxRecords[0];
    const firstPriority = (firstRecord as any).preference || firstRecord.priority;

    const result = {
      success: true,
      records: mxRecords.map((record) => ({
        exchange: record.exchange,
        priority: (record as any).preference || record.priority,
      })),
      lowest_priority: {
        exchange: firstRecord.exchange,
        priority: firstPriority,
      },
    };

    // Cache the result (only cache successful MX lookups)
    if (cache && cache.mx) {
      try {
        const mxHosts = result.records.map((r) => r.exchange);
        await cache.mx.set(domain, mxHosts);
      } catch (error) {
        // Cache error, ignore it
      }
    }

    return result;
  } catch (error: any) {
    // Clean up error message - remove error codes for cleaner output
    const errorMessage = error.message.replace(/^[A-Z]+\s+/, '');
    const result: MxLookupResult = {
      success: false,
      records: [],
      error: errorMessage,
      code: error.code,
    };

    // Don't cache error results
    // cache.mx.set(domain, result) // Not caching errors

    return result;
  }
}

/**
 * Generate random email for catch-all detection
 */
function generateRandomEmail(domain: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomString = '';
  for (let i = 0; i < 15; i++) {
    randomString += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${randomString}@${domain}`;
}

/**
 * Parse SMTP error messages to detect specific conditions
 */
function parseSmtpError(errorMessage: string): {
  isDisabled: boolean;
  hasFullInbox: boolean;
  isInvalid: boolean;
} {
  const lowerError = errorMessage.toLowerCase();

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
    '452',
    '552',
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
  const isInvalid =
    !isDisabled &&
    !hasFullInbox &&
    !rateLimitPatterns.some((pattern) => lowerError.includes(pattern)) &&
    !lowerError.startsWith('421') &&
    !lowerError.startsWith('450') &&
    !lowerError.startsWith('451');

  return {
    isDisabled,
    hasFullInbox,
    isInvalid,
  };
}

/**
 * Enhanced SMTP verification with provider-specific logic and catch-all detection
 */
export async function verifySmtpConnection(
  email: string,
  domain: string,
  mxHost: string,
  options: {
    timeout?: number;
    fromEmail?: string;
    helloName?: string;
    port?: number;
    retries?: number;
    useStartTls?: boolean;
    proxy?: any;
  } = {},
  providerType: EmailProvider = EmailProvider.EVERYTHING_ELSE
): Promise<SmtpVerificationResult> {
  const {
    timeout = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT,
    fromEmail = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_FROM_EMAIL,
    helloName = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_HELLO_NAME,
    port = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_SMTP_PORT,
    retries = 2,
    useStartTls = true,
  } = options;

  // Apply provider-specific optimizations
  const providerOptimizations = getProviderOptimizations(providerType);
  const effectiveOptions = {
    timeout: providerOptimizations.timeout || timeout,
    fromEmail: providerOptimizations.fromEmail || fromEmail,
    helloName: providerOptimizations.helloName || helloName,
    port: providerOptimizations.port || port,
    retries: providerOptimizations.retries || retries,
    useStartTls: providerOptimizations.useStartTls || useStartTls,
  };

  for (let attempt = 0; attempt <= effectiveOptions.retries; attempt++) {
    try {
      const result = await performSmtpVerificationWithCatchAll(email, domain, mxHost, effectiveOptions, providerType);

      return {
        ...result,
        provider_used: providerType,
      };
    } catch (error: any) {
      if (attempt === effectiveOptions.retries) {
        return {
          can_connect_smtp: false,
          has_full_inbox: false,
          is_catch_all: false,
          is_deliverable: false,
          is_disabled: false,
          error: error.message,
          provider_used: providerType,
        };
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }

  return {
    can_connect_smtp: false,
    has_full_inbox: false,
    is_catch_all: false,
    is_deliverable: false,
    is_disabled: false,
    error: 'SMTP verification failed after all retries',
    provider_used: providerType,
  };
}

/**
 * Get provider-specific optimizations for SMTP verification
 */
function getProviderOptimizations(providerType: EmailProvider): Partial<any> {
  switch (providerType) {
    case EmailProvider.GMAIL:
      return {
        port: 587,
        timeout: 15000,
        retries: 1,
        useStartTls: true,
      };
    case EmailProvider.YAHOO:
      return {
        port: 587,
        timeout: 20000,
        retries: 2,
        useStartTls: true,
      };
    case EmailProvider.HOTMAIL_B2C:
      return {
        port: 587,
        timeout: 15000,
        retries: 2,
        useStartTls: true,
      };
    case EmailProvider.HOTMAIL_B2B:
      return {
        port: 587,
        timeout: 15000,
        retries: 2,
        useStartTls: true,
      };
    default:
      return {};
  }
}

/**
 * Perform SMTP verification with catch-all detection
 */
async function performSmtpVerificationWithCatchAll(
  email: string,
  domain: string,
  mxHost: string,
  options: {
    timeout: number;
    fromEmail: string;
    helloName: string;
    port: number;
    retries: number;
  },
  providerType: EmailProvider
): Promise<Omit<SmtpVerificationResult, 'provider_used'>> {
  let isCatchAll = false;
  let hasFullInbox = false;
  let isDisabled = false;
  let isDeliverable = false;

  try {
    // Create SMTP connection
    const connection = await createSmtpConnection(mxHost, options);

    // Check if this is a catch-all domain
    isCatchAll = await checkCatchAll(connection, domain, email, options);

    if (isCatchAll) {
      // If catch-all, we consider it deliverable
      isDeliverable = true;
    } else {
      // Check actual email deliverability
      const deliverability = await checkEmailDeliverability(connection, email, options);
      isDeliverable = deliverability.isDeliverable;
      hasFullInbox = deliverability.hasFullInbox;
      isDisabled = deliverability.isDisabled;
    }

    await connection.quit();

    return {
      can_connect_smtp: true,
      has_full_inbox: hasFullInbox,
      is_catch_all: isCatchAll,
      is_deliverable: isDeliverable,
      is_disabled: isDisabled,
    };
  } catch (error: any) {
    const parsed = parseSmtpError(error.message);

    return {
      can_connect_smtp: true,
      has_full_inbox: parsed.hasFullInbox,
      is_catch_all: false,
      is_deliverable: !parsed.isInvalid && !parsed.isDisabled,
      is_disabled: parsed.isDisabled,
      error: error.message,
    };
  }
}

/**
 * Create SMTP connection
 */
async function createSmtpConnection(
  mxHost: string,
  options: {
    timeout: number;
    fromEmail: string;
    helloName: string;
    port: number;
  }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const { Socket } = require('net');
    const socket = new Socket();

    socket.setTimeout(options.timeout);

    socket.on('connect', () => {
      resolve(createSmtpTransport(socket, options));
    });

    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });

    socket.connect(options.port, mxHost);
  });
}

/**
 * Create SMTP transport layer
 */
function createSmtpTransport(
  socket: any,
  options: {
    fromEmail: string;
    helloName: string;
  }
): any {
  let responseBuffer = '';

  socket.on('data', (data: Buffer) => {
    responseBuffer += data.toString();
  });

  return {
    async sendCommand(command: string): Promise<string> {
      return new Promise((resolve, reject) => {
        socket.write(command + '\r\n');

        const checkResponse = () => {
          const lines = responseBuffer.split('\r\n');
          const completeLines = lines.slice(0, -1);

          for (const line of completeLines) {
            if (line.length >= 3) {
              const code = parseInt(line.substring(0, 3));

              if (line[3] === ' ' || line[3] === undefined) {
                // Complete response
                if (code >= 200 && code < 300) {
                  responseBuffer = '';
                  resolve(line);
                } else {
                  responseBuffer = '';
                  reject(new Error(line));
                }
                return;
              }
            }
          }
        };

        setTimeout(() => checkResponse(), 1000);
      });
    },

    async mailFrom(email: string): Promise<void> {
      await this.sendCommand(`MAIL FROM:<${email}>`);
    },

    async rcptTo(email: string): Promise<void> {
      await this.sendCommand(`RCPT TO:<${email}>`);
    },

    async ehlo(hostname: string): Promise<void> {
      try {
        await this.sendCommand(`EHLO ${hostname}`);
      } catch (error) {
        // Fall back to HELO if EHLO fails
        await this.sendCommand(`HELO ${hostname}`);
      }
    },

    async quit(): Promise<void> {
      try {
        await this.sendCommand('QUIT');
      } catch (error) {
        // Ignore quit errors
      }
      socket.end();
    },
  };
}

/**
 * Check if domain has catch-all email setup
 */
async function checkCatchAll(
  connection: any,
  domain: string,
  originalEmail: string,
  options: {
    fromEmail: string;
    helloName: string;
  }
): Promise<boolean> {
  try {
    // Send EHLO/HELO
    await connection.ehlo(options.helloName);

    // Set MAIL FROM
    await connection.mailFrom(options.fromEmail);

    // Test with a random email address
    const randomEmail = generateRandomEmail(domain);
    await connection.rcptTo(randomEmail);

    // If random email succeeds, domain has catch-all
    return true;
  } catch (error) {
    // If random email fails, no catch-all
    return false;
  }
}

/**
 * Check email deliverability
 */
async function checkEmailDeliverability(
  connection: any,
  email: string,
  options: {
    fromEmail: string;
    helloName: string;
  }
): Promise<{
  isDeliverable: boolean;
  hasFullInbox: boolean;
  isDisabled: boolean;
}> {
  try {
    // Send EHLO/HELO
    await connection.ehlo(options.helloName);

    // Set MAIL FROM
    await connection.mailFrom(options.fromEmail);

    // Test with the actual email
    await connection.rcptTo(email);

    return {
      isDeliverable: true,
      hasFullInbox: false,
      isDisabled: false,
    };
  } catch (error: any) {
    const parsed = parseSmtpError(error.message);
    return {
      isDeliverable: !parsed.isInvalid && !parsed.isDisabled,
      hasFullInbox: parsed.hasFullInbox,
      isDisabled: parsed.isDisabled,
    };
  }
}

/**
 * Calculate overall reachability based on verification results
 */
function calculateReachability(result: CheckIfEmailExistsCoreResult): 'safe' | 'invalid' | 'risky' | 'unknown' {
  if (!result.syntax.is_valid) {
    return 'invalid';
  }

  if (!result.mx || !result.mx.success) {
    // If MX failed due to timeout, return 'unknown' instead of 'invalid'
    if (result.mx && (result.mx.code === 'ETIMEDOUT' || result.mx.error?.toLowerCase().includes('timeout'))) {
      return 'unknown';
    }
    return 'invalid';
  }

  if (!result.smtp || !result.smtp.can_connect_smtp) {
    return 'unknown';
  }

  if (result.misc && result.misc.is_disposable) {
    return 'risky';
  }

  if (!result.smtp.is_deliverable) {
    return 'invalid';
  }

  return 'safe';
}

/**
 * Main function to check if an email
 */
export async function checkIfEmailExistsCore(
  params: ICheckIfEmailExistsCoreParams
): Promise<CheckIfEmailExistsCoreResult> {
  // Handle null/undefined params
  if (!params) {
    return {
      email: 'unknown',
      is_reachable: 'invalid',
      error: 'Parameters object is required',
      syntax: {
        is_valid: false,
        error: 'Parameters object is required',
      },
      mx: null,
      smtp: null,
      misc: null,
      duration: 0,
    };
  }

  const {
    emailAddress,
    timeout = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT,
    verifyMx = true,
    verifySmtp = false, // Default to false for safety
    debug = false,
    checkDisposable = true,
    checkFree = true,
    cache,
    smtpTimeout,
    fromEmail,
    helloName,
  } = params;

  const startTime = Date.now();
  const log = debug ? console.debug : () => {};

  try {
    // Step 1: Syntax validation
    const syntaxResult = validateEmailSyntax(emailAddress);
    if (!syntaxResult.is_valid) {
      return {
        email: emailAddress,
        is_reachable: 'invalid',
        syntax: {
          is_valid: false,
          error: syntaxResult.error,
        },
        mx: null,
        smtp: null,
        misc: null,
        duration: Date.now() - startTime,
      };
    }

    const result: CheckIfEmailExistsCoreResult = {
      email: syntaxResult.email!,
      is_reachable: 'unknown',
      syntax: {
        is_valid: true,
        domain: syntaxResult.domain,
        local_part: syntaxResult.local_part,
      },
      mx: null,
      smtp: null,
      misc: null,
      duration: 0,
    };

    // Step 2: MX record lookup
    let mxResult: MxLookupResult | null = null;
    if (verifyMx) {
      mxResult = await queryMxRecords(syntaxResult.domain!, { timeout, cache });
      result.mx = mxResult;

      if (!mxResult.success) {
        result.is_reachable = 'invalid';
        result.duration = Date.now() - startTime;
        return result;
      }
    }

    // Step 3: Provider detection from MX host
    let providerType = EmailProvider.EVERYTHING_ELSE;
    if (mxResult && mxResult.success && mxResult.lowest_priority) {
      providerType = getProviderFromMxHost(mxResult.lowest_priority.exchange);
    } else {
      providerType = getProviderType(syntaxResult.domain!);
    }

    // Step 4: Misc checks (disposable, free email, etc.)
    if (checkDisposable || checkFree) {
      const [isDisposable, isFree] = await Promise.allSettled([
        checkDisposable
          ? isDisposableEmail({ emailOrDomain: emailAddress, cache, logger: log })
          : Promise.resolve(false),
        checkFree ? isFreeEmail({ emailOrDomain: emailAddress, cache, logger: log }) : Promise.resolve(false),
      ]);

      result.misc = {
        is_disposable: isDisposable.status === 'fulfilled' ? isDisposable.value : false,
        is_free: isFree.status === 'fulfilled' ? isFree.value : false,
        provider_type: providerType,
      };
    }

    // Step 5: SMTP verification
    if (verifySmtp && mxResult && mxResult.success && mxResult.lowest_priority) {
      const smtpResult = await verifySmtpConnection(
        syntaxResult.email!,
        syntaxResult.domain!,
        mxResult.lowest_priority.exchange,
        {
          timeout: smtpTimeout || timeout,
          fromEmail: fromEmail || CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_FROM_EMAIL,
          helloName: helloName || CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_HELLO_NAME,
        },
        providerType
      );

      result.smtp = smtpResult;

      // Determine reachability based on all results
      result.is_reachable = calculateReachability(result);
    }

    result.duration = Date.now() - startTime;
    return result;
  } catch (error: any) {
    return {
      email: emailAddress,
      is_reachable: 'unknown',
      error: error.message,
      syntax: {
        is_valid: false,
        error: 'Email validation skipped',
      },
      mx: null,
      smtp: null,
      misc: null,
      duration: Date.now() - startTime,
    };
  }
}
