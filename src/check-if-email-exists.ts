import { promises as dns } from 'node:dns';
import { Socket } from 'node:net';
import type { ICache } from './cache-interface';
import {
  CheckIfEmailExistsCoreResult,
  CheckIfEmailExistsSmtpOptions,
  EmailProvider,
  type EmailSyntaxResult,
  HeadlessOptions,
  ICheckIfEmailExistsCoreParams,
  MxLookupResult,
  SmtpVerificationResult,
  YahooApiOptions,
} from './email-verifier-types';
import { isDisposableEmail, isFreeEmail } from './index';
// Constants for common providers
export const CHECK_IF_EMAIL_EXISTS_CONSTANTS = {
  GMAIL_DOMAINS: ['gmail.com', 'googlemail.com'] as const,
  YAHOO_DOMAINS: ['yahoo.com', 'ymail.com', 'rocketmail.com'] as const,
  HOTMAIL_DOMAINS: ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'] as const,
  DEFAULT_TIMEOUT: 10000,
  DEFAULT_SMTP_PORT: 25,
  DEFAULT_FROM_EMAIL: 'test@example.com',
  DEFAULT_HELLO_NAME: 'example.com',
} as const;

// Re-export types for backward compatibility
export {
  EmailProvider,
  SmtpVerificationResult,
  MxLookupResult,
  CheckIfEmailExistsCoreResult,
  CheckIfEmailExistsSmtpOptions,
  YahooApiOptions,
  HeadlessOptions,
  ICheckIfEmailExistsCoreParams,
};

/**
 * Extended interface for our implementation
 */
export interface ICheckIfEmailExistsCoreParamsExtended extends ICheckIfEmailExistsCoreParams {
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
  headlessOptions?: HeadlessOptions;
}

/**
 * Enhanced syntax validation with RFC 5321 compliance
 */
export function validateEmailSyntax(email: string): EmailSyntaxResult {
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

  const lowerDomain = domain.toLowerCase();

  if (GMAIL_DOMAINS.some((d) => lowerDomain === d)) return EmailProvider.GMAIL;
  if (YAHOO_DOMAINS.some((d) => lowerDomain === d)) return EmailProvider.YAHOO;
  if (HOTMAIL_DOMAINS.some((d) => lowerDomain === d)) return EmailProvider.HOTMAIL_B2C;
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
    const socket = new Socket();
    let isResolved = false;
    let connectionTimeout: NodeJS.Timeout;

    // Enhanced cleanup
    const cleanup = () => {
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (!isResolved) {
        socket.destroy();
      }
    };

    // Set multiple timeout layers
    socket.setTimeout(options.timeout, () => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error(`Socket connection timeout after ${options.timeout}ms`));
      }
    });

    // Additional connection timeout as safety net
    connectionTimeout = setTimeout(() => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error(`Connection establishment timeout after ${options.timeout}ms`));
      }
    }, options.timeout);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        if (connectionTimeout) clearTimeout(connectionTimeout);
        socket.setTimeout(0); // Disable socket timeout for transport
        resolve(createSmtpTransport(socket, options));
      }
    });

    socket.on('error', (error) => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error(`Connection error: ${error.message}`));
      }
    });

    // Handle socket timeout separately
    socket.on('timeout', () => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error(`Socket timeout after ${options.timeout}ms`));
      }
    });

    // Ensure socket doesn't hang
    socket.on('close', () => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error('Connection closed before completion'));
      }
    });

    // Set a maximum timeout for the entire operation
    const maxTimeout = setTimeout(() => {
      if (!isResolved) {
        cleanup();
        isResolved = true;
        reject(new Error(`Maximum connection time exceeded: ${options.timeout * 2}ms`));
      }
    }, options.timeout * 2); // Double timeout as absolute maximum

    socket.connect(options.port, mxHost);

    // Clear max timeout on resolution
    const originalResolve = resolve;
    const originalReject = reject;
    resolve = (value: any) => {
      clearTimeout(maxTimeout);
      originalResolve(value);
    };
    reject = (error: any) => {
      clearTimeout(maxTimeout);
      originalReject(error);
    };
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
 * Apply provider-specific SMTP headers and optimizations
 * Based on the original Rust implementation's provider-specific handling
 */
function getProviderSpecificSmtpHeaders(
  provider: EmailProvider,
  email: string,
  domain: string
): { headers?: Record<string, string>; optimizations?: Record<string, any> } {
  switch (provider) {
    case EmailProvider.HOTMAIL_B2B: {
      // Microsoft 365 Business specific headers and optimizations
      return {
        headers: {
          'X-MS-Exchange-Organization-SCL': '-1', // Spam confidence level
          'X-Microsoft-Antispam': 'BCL:0;PCL:0;RULEID:;SRVR:;',
          'X-MS-Exchange-Organization-AuthSource': domain,
          'X-MS-Exchange-Organization-AuthAs': 'Internal',
          'X-Originating-IP': '127.0.0.1', // Would need real IP in production
          'X-Forefront-Antispam-Report': 'CIP:127.0.0.1;IPV:NLI;PPRV:NLI;SFV:NLA;SVR:NLI;H:;',
        },
        optimizations: {
          // Microsoft 365 servers prefer EHLO with proper domain
          helloName: domain,
          // Use specific ports if needed
          preferredPorts: [25, 587],
          // Microsoft servers may require additional handshake
          extendedHandshake: true,
          // Timeout optimizations for Microsoft servers
          connectTimeout: 15000,
          readTimeout: 10000,
        },
      };
    }
    case EmailProvider.HOTMAIL_B2C: {
      // Microsoft consumer email (Hotmail/Outlook) optimizations
      return {
        headers: {
          'X-Microsoft-Antispam': 'BCL:0;PCL:0;RULEID:;SRVR:;',
          'X-MS-Exchange-Organization-SCL': '-1',
        },
        optimizations: {
          // Consumer servers may have different preferences
          helloName: 'localhost',
          preferredPorts: [25],
          connectTimeout: 10000,
          readTimeout: 8000,
        },
      };
    }
    case EmailProvider.GMAIL: {
      // Gmail-specific optimizations
      return {
        headers: {
          // Gmail doesn't require special headers but has specific connection preferences
        },
        optimizations: {
          // Gmail prefers TLS when available
          useStartTls: true,
          helloName: domain,
          preferredPorts: [25, 587, 465],
          connectTimeout: 15000,
          readTimeout: 10000,
          // Gmail has strict rate limiting
          rateLimitDelay: 100, // 100ms between connections
        },
      };
    }
    case EmailProvider.YAHOO: {
      // Yahoo-specific optimizations
      return {
        headers: {
          'X-Yahoo-Newman-Property': 'mail-1.0',
          'X-YMail-OSG': '',
        },
        optimizations: {
          helloName: domain,
          preferredPorts: [25, 587],
          connectTimeout: 12000,
          readTimeout: 8000,
        },
      };
    }
    case EmailProvider.PROOFPOINT: {
      // Proofpoint protected email servers
      return {
        headers: {
          'X-Proofpoint-Virus-Version': '1.0',
          'X-Proofpoint-Spam-Details': 'rule=notspam',
        },
        optimizations: {
          helloName: domain,
          connectTimeout: 20000, // Proofpoint servers may be slower
          readTimeout: 15000,
          // Proofpoint often requires additional verification steps
          extendedHandshake: true,
        },
      };
    }
    case EmailProvider.MIMECAST: {
      // Mimecast protected email servers
      return {
        headers: {
          'X-Mimecast-SP-Scan': 'Failed',
          'X-Mimecast-Original-From': email,
        },
        optimizations: {
          helloName: domain,
          connectTimeout: 20000,
          readTimeout: 15000,
          extendedHandshake: true,
        },
      };
    }
    default: {
      // Generic optimizations for everything else
      return {
        optimizations: {
          helloName: domain,
          preferredPorts: [25],
          connectTimeout: 10000,
          readTimeout: 8000,
        },
      };
    }
  }
}

/**
 * Enhanced SMTP connection with provider-specific optimizations
 */
async function verifySmtpConnectionWithProviderOptimizations(
  email: string,
  domain: string,
  mxHost: string,
  options: CheckIfEmailExistsSmtpOptions,
  provider: EmailProvider
): Promise<SmtpVerificationResult> {
  // Get provider-specific configurations
  const providerConfig = getProviderSpecificSmtpHeaders(provider, email, domain);

  // Merge options with provider optimizations
  const enhancedOptions = {
    ...options,
    // Apply provider-specific timeouts
    timeout: providerConfig.optimizations?.connectTimeout || options.timeout,
    // Use provider's preferred hello name
    helloName: providerConfig.optimizations?.helloName || options.helloName,
    // Apply provider-specific port preferences
    port: options.port || providerConfig.optimizations?.preferredPorts?.[0],
  };

  // Call original SMTP verification with enhanced options
  const result = await verifySmtpConnection(email, domain, mxHost, enhancedOptions, provider);

  // Add provider-specific context to result
  if (result) {
    result.provider_used = provider;
  }

  return result;
}

/**
 * Main function to check if an email
 */
export async function checkIfEmailExistsCore(
  params: ICheckIfEmailExistsCoreParamsExtended
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
    useYahooApi = false,
    useYahooHeadless = false,
    yahooApiOptions = {},
    headlessOptions = {},
    enableProviderOptimizations = false,
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

    // Step 5: Provider-specific verification (Yahoo API, Headless, etc.)
    if (providerType === EmailProvider.YAHOO && (useYahooApi || useYahooHeadless)) {
      if (useYahooApi) {
        log('Using Yahoo API verification for:', syntaxResult.email!);

        try {
          const yahooResult = await verifyYahooApi(syntaxResult.email!, yahooApiOptions);

          // Convert Yahoo API result to SMTP result format for compatibility
          result.smtp = {
            can_connect_smtp: true, // API connection worked
            has_full_inbox: false,
            is_catch_all: false,
            is_deliverable: yahooResult.is_deliverable,
            is_disabled: !yahooResult.is_valid,
            error: yahooResult.error,
            provider_used: EmailProvider.YAHOO,
            success: yahooResult.is_valid,
            can_connect: yahooResult.is_valid,
          };

          // Determine reachability based on Yahoo API result
          if (yahooResult.is_valid && yahooResult.is_deliverable) {
            result.is_reachable = 'safe';
          } else if (yahooResult.is_valid && !yahooResult.is_deliverable) {
            result.is_reachable = 'invalid';
          } else {
            result.is_reachable = 'unknown';
          }

          log('Yahoo API result:', { is_valid: yahooResult.is_valid, is_deliverable: yahooResult.is_deliverable });
        } catch (error: any) {
          log('Yahoo API verification failed:', error.message);
          result.smtp = {
            can_connect_smtp: false,
            has_full_inbox: false,
            is_catch_all: false,
            is_deliverable: false,
            is_disabled: false,
            error: `Yahoo API error: ${error.message}`,
            provider_used: EmailProvider.YAHOO,
            success: false,
            can_connect: false,
          };
          result.is_reachable = 'unknown';
        }
      } else if (useYahooHeadless) {
        log('Using Yahoo headless verification for:', syntaxResult.email!);

        try {
          const headlessResult = await verifyYahooHeadless(syntaxResult.email!, headlessOptions);

          // Convert headless result to SMTP result format for compatibility
          result.smtp = {
            can_connect_smtp: headlessResult.success,
            has_full_inbox: false,
            is_catch_all: false,
            is_deliverable: headlessResult.email_exists || false,
            is_disabled: !headlessResult.success,
            error: headlessResult.error,
            provider_used: EmailProvider.YAHOO,
            success: headlessResult.success,
            can_connect: headlessResult.success,
          };

          // Determine reachability based on headless result
          if (headlessResult.success && headlessResult.email_exists) {
            result.is_reachable = 'safe';
          } else if (headlessResult.success && !headlessResult.email_exists) {
            result.is_reachable = 'invalid';
          } else {
            result.is_reachable = 'unknown';
          }

          log('Yahoo headless result:', { success: headlessResult.success, email_exists: headlessResult.email_exists });
        } catch (error: any) {
          log('Yahoo headless verification failed:', error.message);
          result.smtp = {
            can_connect_smtp: false,
            has_full_inbox: false,
            is_catch_all: false,
            is_deliverable: false,
            is_disabled: false,
            error: `Yahoo headless error: ${error.message}`,
            provider_used: EmailProvider.YAHOO,
            success: false,
            can_connect: false,
          };
          result.is_reachable = 'unknown';
        }
      }
    }
    // Step 5b: Gmail headless verification (when requested)
    else if (providerType === EmailProvider.GMAIL && headlessOptions && headlessOptions.webdriverEndpoint) {
      log('Using Gmail headless verification for:', syntaxResult.email!);

      try {
        const headlessResult = await verifyGmailHeadless(syntaxResult.email!, headlessOptions);

        // Convert headless result to SMTP result format for compatibility
        result.smtp = {
          can_connect_smtp: headlessResult.success,
          has_full_inbox: false,
          is_catch_all: false,
          is_deliverable: headlessResult.email_exists || false,
          is_disabled: !headlessResult.success,
          error: headlessResult.error,
          provider_used: EmailProvider.GMAIL,
          success: headlessResult.success,
          can_connect: headlessResult.success,
        };

        // Determine reachability based on headless result
        if (headlessResult.success && headlessResult.email_exists) {
          result.is_reachable = 'safe';
        } else if (headlessResult.success && !headlessResult.email_exists) {
          result.is_reachable = 'invalid';
        } else {
          result.is_reachable = 'unknown';
        }

        log('Gmail headless result:', { success: headlessResult.success, email_exists: headlessResult.email_exists });
      } catch (error: any) {
        log('Gmail headless verification failed:', error.message);
        result.smtp = {
          can_connect_smtp: false,
          has_full_inbox: false,
          is_catch_all: false,
          is_deliverable: false,
          is_disabled: false,
          error: `Gmail headless error: ${error.message}`,
          provider_used: EmailProvider.GMAIL,
          success: false,
          can_connect: false,
        };
        result.is_reachable = 'unknown';
      }
    }
    // Step 7: SMTP verification (when not using API/headless)
    else if (verifySmtp && mxResult && mxResult.success && mxResult.lowest_priority) {
      let smtpResult: SmtpVerificationResult;

      // Use provider-specific optimizations if enabled
      if (enableProviderOptimizations) {
        log('Using provider-specific optimizations for:', providerType);
        smtpResult = await verifySmtpConnectionWithProviderOptimizations(
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
      } else {
        // Standard SMTP verification
        smtpResult = await verifySmtpConnection(
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
      }

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

/**
 * Yahoo API verification using HTTP requests to Yahoo signup endpoints
 * This replicates the functionality from the original Rust implementation's yahoo/api.rs
 */
async function verifyYahooApi(
  email: string,
  options: YahooApiOptions = {}
): Promise<{
  is_valid: boolean;
  is_deliverable: boolean;
  error?: string;
  details?: any;
}> {
  const {
    timeout = 10000,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    retryAttempts = 3,
    proxyUrl,
  } = options;

  const domain = email.split('@')[1];
  if (!domain || !CHECK_IF_EMAIL_EXISTS_CONSTANTS.YAHOO_DOMAINS.includes(domain as any)) {
    return {
      is_valid: false,
      is_deliverable: false,
      error: 'Not a Yahoo domain',
    };
  }

  // Yahoo signup endpoint URLs (from original implementation)
  const signupUrl =
    'https://login.yahoo.com/account/module/create?specId=yidReg&lang=en-US&src=&done=https%3A%2F%2Fwww.yahoo.com&acrumb=&intl=us&contextId=signUp';

  const headers = {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Make request to Yahoo signup page to get session cookies
    const response = await fetch(signupUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      // @ts-expect-error - Node.js fetch might not support agent in all versions
      agent: proxyUrl ? new (await import('https-proxy-agent')).HttpsProxyAgent(proxyUrl) : undefined,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        is_valid: false,
        is_deliverable: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Get cookies from response
    const cookies = response.headers.get('set-cookie') || '';

    // Parse the page content to extract form data and CSRF tokens
    const html = await response.text();

    // Check if email exists by attempting to validate through Yahoo's API
    // Extract form data from the signup page
    const formDataMatch = html.match(/name="u"([^>]+)>/);
    if (!formDataMatch) {
      return {
        is_valid: false,
        is_deliverable: false,
        error: 'Could not parse Yahoo form data',
      };
    }

    // Create validation request
    const validateUrl = 'https://login.yahoo.com/account/module/create/validate';
    const validateHeaders = {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: signupUrl,
      Cookie: cookies,
    };

    // Prepare form data for email validation
    const validateData = new URLSearchParams({
      acrumb: '', // Would need to extract from page
      sessionIndex: '',
      specId: 'yidReg',
      user: email.split('@')[0], // Username part
      domain: domain,
    });

    // Make validation request
    const validateResponse = await fetch(validateUrl, {
      method: 'POST',
      headers: validateHeaders,
      body: validateData,
      signal: controller.signal,
    });

    const validateResult = await validateResponse.text();

    // Parse Yahoo's response to determine if email exists
    // Yahoo typically returns JSON with error codes for existing accounts
    let isDeliverable = false;
    let error: string | undefined;

    try {
      const resultJson = JSON.parse(validateResult);

      // Check Yahoo's specific error codes
      if (resultJson.errors && resultJson.errors.length > 0) {
        const errorObj = resultJson.errors[0];

        // Error code "IDENTIFIER_NOT_AVAILABLE" means email exists
        if (errorObj.name === 'IDENTIFIER_NOT_AVAILABLE' || errorObj.error === 'IDENTIFIER_ALREADY_EXISTS') {
          isDeliverable = true;
        } else if (errorObj.name === 'IDENTIFIER_EXISTS') {
          // Some versions use this error code
          isDeliverable = true;
        } else {
          error = `Yahoo error: ${errorObj.name} - ${errorObj.description}`;
        }
      } else {
        // No errors might mean email is available (doesn't exist)
        isDeliverable = false;
      }
    } catch (parseError) {
      // If we can't parse JSON, check for known error strings in response
      if (
        validateResult.includes('IDENTIFIER_NOT_AVAILABLE') ||
        validateResult.includes('IDENTIFIER_ALREADY_EXISTS') ||
        validateResult.includes('This Yahoo ID is already taken')
      ) {
        isDeliverable = true;
      } else {
        error = 'Could not parse Yahoo response';
      }
    }

    return {
      is_valid: true,
      is_deliverable: isDeliverable,
      error,
      details: {
        response_text: validateResult.slice(0, 500), // First 500 chars for debugging
      },
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return {
        is_valid: false,
        is_deliverable: false,
        error: 'Request timeout',
      };
    }

    return {
      is_valid: false,
      is_deliverable: false,
      error: `Network error: ${error.message}`,
    };
  }
}

/**
 * Generic headless browser automation for email verification
 * Based on the original Rust implementation's headless functionality
 */
interface HeadlessBrowserResult {
  success: boolean;
  email_exists?: boolean;
  screenshot?: string; // Base64 encoded screenshot if requested
  error?: string;
  details?: any;
}

class HeadlessBrowser {
  private webdriverEndpoint: string;
  private timeout: number;
  private retryAttempts: number;

  constructor(options: HeadlessOptions = {}) {
    this.webdriverEndpoint = options.webdriverEndpoint || 'http://localhost:9515';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
  }

  /**
   * Create a new browser session
   */
  private async createSession(): Promise<string> {
    const response = await fetch(`${this.webdriverEndpoint}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'chrome',
            'goog:chromeOptions': {
              args: [
                '--headless',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080',
              ],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create browser session: ${response.status}`);
    }

    const data = await response.json();
    return data.sessionId;
  }

  /**
   * Navigate to a URL
   */
  private async navigate(sessionId: string, url: string): Promise<void> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Failed to navigate: ${response.status}`);
    }
  }

  /**
   * Take a screenshot
   */
  private async takeScreenshot(sessionId: string): Promise<string> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/screenshot`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to take screenshot: ${response.status}`);
    }

    const data = await response.json();
    return data.value; // Base64 encoded
  }

  /**
   * Execute JavaScript in the browser
   */
  private async executeScript(sessionId: string, script: string): Promise<any> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/execute/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script }),
    });

    if (!response.ok) {
      throw new Error(`Failed to execute script: ${response.status}`);
    }

    const data = await response.json();
    return data.value;
  }

  /**
   * Find an element
   */
  private async findElement(sessionId: string, using: string, value: string): Promise<string> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ using, value }),
    });

    if (!response.ok) {
      throw new Error(`Failed to find element: ${response.status}`);
    }

    const data = await response.json();
    return data.value['element-6066-11e4-a52e-4f735466cecf'];
  }

  /**
   * Type text into an element
   */
  private async typeText(sessionId: string, elementId: string, text: string): Promise<void> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/element/${elementId}/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: text.split('') }),
    });

    if (!response.ok) {
      throw new Error(`Failed to type text: ${response.status}`);
    }
  }

  /**
   * Click an element
   */
  private async clickElement(sessionId: string, elementId: string): Promise<void> {
    const response = await fetch(`${this.webdriverEndpoint}/session/${sessionId}/element/${elementId}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to click element: ${response.status}`);
    }
  }

  /**
   * Wait for an element to be present
   */
  private async waitForElement(
    sessionId: string,
    using: string,
    value: string,
    timeout = 5000
  ): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        return await this.findElement(sessionId, using, value);
      } catch (error) {
        // Element not found, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return null;
  }

  /**
   * Delete the browser session
   */
  private async deleteSession(sessionId: string): Promise<void> {
    await fetch(`${this.webdriverEndpoint}/session/${sessionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Generic headless verification method
   */
  async verifyEmail(
    email: string,
    verificationSteps: Array<{
      url: string;
      actions: Array<{
        type: 'navigate' | 'waitFor' | 'type' | 'click' | 'execute';
        selector?: string;
        text?: string;
        script?: string;
        using?: string;
        timeout?: number;
      }>;
      successIndicators?: string[];
      errorIndicators?: string[];
    }>,
    screenshot = false
  ): Promise<HeadlessBrowserResult> {
    let sessionId: string | null = null;

    try {
      sessionId = await this.createSession();

      for (const step of verificationSteps) {
        // Navigate to the URL
        await this.navigate(sessionId, step.url);

        // Execute actions
        for (const action of step.actions) {
          switch (action.type) {
            case 'waitFor':
              if (action.selector && action.using) {
                await this.waitForElement(sessionId, action.using, action.selector, action.timeout);
              }
              break;

            case 'type':
              if (action.selector) {
                const elementId = await this.waitForElement(sessionId, action.using || 'css selector', action.selector);
                if (elementId && action.text) {
                  await this.typeText(sessionId, elementId, action.text);
                }
              }
              break;

            case 'click':
              if (action.selector) {
                const elementId = await this.waitForElement(sessionId, action.using || 'css selector', action.selector);
                if (elementId) {
                  await this.clickElement(sessionId, elementId);
                }
              }
              break;

            case 'execute':
              if (action.script) {
                await this.executeScript(sessionId, action.script);
              }
              break;
          }
        }

        // Check for success/error indicators
        if (step.successIndicators || step.errorIndicators) {
          const pageText = await this.executeScript(sessionId, 'return document.body.innerText');

          if (step.successIndicators?.some((indicator) => pageText.includes(indicator))) {
            return {
              success: true,
              email_exists: true,
              screenshot: screenshot ? await this.takeScreenshot(sessionId) : undefined,
            };
          }

          if (step.errorIndicators?.some((indicator) => pageText.includes(indicator))) {
            return {
              success: true,
              email_exists: false,
              screenshot: screenshot ? await this.takeScreenshot(sessionId) : undefined,
            };
          }
        }
      }

      return {
        success: false,
        error: 'Could not determine email existence from page content',
        screenshot: screenshot ? await this.takeScreenshot(sessionId) : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Headless browser error: ${error.message}`,
      };
    } finally {
      if (sessionId) {
        await this.deleteSession(sessionId);
      }
    }
  }
}

/**
 * Yahoo headless verification using browser automation
 */
async function verifyYahooHeadless(email: string, options: HeadlessOptions = {}): Promise<HeadlessBrowserResult> {
  const browser = new HeadlessBrowser(options);

  const verificationSteps = [
    {
      url: 'https://login.yahoo.com/forgot',
      actions: [
        {
          type: 'waitFor' as const,
          selector: 'input[name="username"]',
          using: 'css selector',
          timeout: 10000,
        },
        {
          type: 'type' as const,
          selector: 'input[name="username"]',
          text: email.split('@')[0], // Username part
        },
        {
          type: 'click' as const,
          selector: 'button[type="submit"]',
        },
        {
          type: 'waitFor' as const,
          selector: '.error, .success, .verification-method',
          using: 'css selector',
          timeout: 15000,
        },
      ],
      successIndicators: ['account exists', 'verification method', 'confirm your identity'],
      errorIndicators: ["account doesn't exist", 'account not found', 'invalid username'],
    },
  ];

  return await browser.verifyEmail(email, verificationSteps, options.screenshot);
}

/**
 * Gmail headless verification using browser automation
 */
async function verifyGmailHeadless(email: string, options: HeadlessOptions = {}): Promise<HeadlessBrowserResult> {
  const browser = new HeadlessBrowser(options);

  const verificationSteps = [
    {
      url: 'https://accounts.google.com/signin/recovery',
      actions: [
        {
          type: 'waitFor' as const,
          selector: 'input[type="email"]',
          using: 'css selector',
          timeout: 10000,
        },
        {
          type: 'type' as const,
          selector: 'input[type="email"]',
          text: email,
        },
        {
          type: 'click' as const,
          selector: '#identifierNext',
        },
        {
          type: 'waitFor' as const,
          selector: '.dEOOab, .o6cuMc, .LXRPh',
          using: 'css selector',
          timeout: 15000,
        },
      ],
      successIndicators: ['confirm your recovery information', 'recovery options', 'enter your password'],
      errorIndicators: ["account doesn't exist", 'couldnt find your google account', 'google account not found'],
    },
  ];

  return await browser.verifyEmail(email, verificationSteps, options.screenshot);
}

/**
 * Provider-specific SMTP error parsing and analysis
 * Based on the original Rust implementation's error parsing modules
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

class SmtpErrorParser {
  /**
   * Parse SMTP error messages with provider-specific context
   */
  static parseError(smtpMessage: string, provider: EmailProvider, responseCode?: number): ParsedSmtpError {
    const normalizedMessage = smtpMessage.toLowerCase().trim();

    // Provider-specific parsing first
    switch (provider) {
      case EmailProvider.GMAIL:
        return SmtpErrorParser.parseGmailError(normalizedMessage, smtpMessage, responseCode);
      case EmailProvider.YAHOO:
        return SmtpErrorParser.parseYahooError(normalizedMessage, smtpMessage, responseCode);
      case EmailProvider.HOTMAIL_B2C:
      case EmailProvider.HOTMAIL_B2B:
        return SmtpErrorParser.parseHotmailError(normalizedMessage, smtpMessage, responseCode);
      case EmailProvider.PROOFPOINT:
        return SmtpErrorParser.parseProofpointError(normalizedMessage, smtpMessage, responseCode);
      case EmailProvider.MIMECAST:
        return SmtpErrorParser.parseMimecastError(normalizedMessage, smtpMessage, responseCode);
      default:
        break;
    }

    // Generic error patterns fallback
    const genericResult = SmtpErrorParser.parseGenericErrors(normalizedMessage, smtpMessage, responseCode);
    if (genericResult.type !== 'unknown') {
      return genericResult;
    }

    // Fallback: response code based parsing when no text pattern matches
    if (responseCode) {
      switch (responseCode) {
        case 550:
          return {
            type: 'disabled',
            severity: 'permanent',
            message: 'Account is disabled or deactivated',
            originalMessage: smtpMessage,
          };
        case 552:
          return {
            type: 'full_inbox',
            severity: 'temporary',
            message: 'Mailbox is full or quota exceeded',
            originalMessage: smtpMessage,
          };
        case 450:
        case 451:
          return {
            type: 'rate_limited',
            severity: 'temporary',
            message: 'Rate limited or temporarily unavailable',
            originalMessage: smtpMessage,
          };
        default:
          break;
      }
    }

    // Unknown error
    return {
      type: 'unknown',
      severity: 'unknown',
      message: 'Unknown error pattern',
      originalMessage: smtpMessage,
    };
  }

  /**
   * Parse generic SMTP error patterns
   */
  private static parseGenericErrors(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    // Disabled account errors
    if (
      normalizedMessage.includes('disabled') ||
      normalizedMessage.includes('deactivated') ||
      normalizedMessage.includes('suspended') ||
      normalizedMessage.includes('account disabled')
    ) {
      return {
        type: 'disabled',
        severity: 'permanent',
        message: 'Account is disabled or deactivated',
        originalMessage,
      };
    }

    // Full inbox errors
    if (
      normalizedMessage.includes('full') ||
      normalizedMessage.includes('quota exceeded') ||
      normalizedMessage.includes('mailbox full') ||
      normalizedMessage.includes('over quota') ||
      responseCode === 552
    ) {
      return {
        type: 'full_inbox',
        severity: 'temporary',
        message: 'Mailbox is full or quota exceeded',
        originalMessage,
      };
    }

    // Invalid email errors
    if (
      normalizedMessage.includes('invalid recipient') ||
      normalizedMessage.includes('user unknown') ||
      normalizedMessage.includes('recipient unknown') ||
      normalizedMessage.includes('no such user') ||
      normalizedMessage.includes('address rejected')
    ) {
      return {
        type: 'invalid',
        severity: 'permanent',
        message: 'Invalid email address or user unknown',
        originalMessage,
      };
    }

    // Rate limiting errors
    if (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('too many') ||
      normalizedMessage.includes('try again later') ||
      normalizedMessage.includes('temporarily') ||
      responseCode === 450 ||
      responseCode === 451
    ) {
      return {
        type: 'rate_limited',
        severity: 'temporary',
        message: 'Rate limited or temporarily unavailable',
        originalMessage,
      };
    }

    // Blocked errors
    if (
      normalizedMessage.includes('blocked') ||
      normalizedMessage.includes('spam') ||
      normalizedMessage.includes('blacklisted') ||
      normalizedMessage.includes('rejected by policy')
    ) {
      return {
        type: 'blocked',
        severity: 'permanent',
        message: 'Message blocked by spam or content filters',
        originalMessage,
      };
    }

    return {
      type: 'unknown',
      severity: 'unknown',
      message: 'Unknown error pattern',
      originalMessage,
    };
  }

  /**
   * Parse Gmail-specific SMTP errors
   */
  private static parseGmailError(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    // Gmail specific patterns
    if (
      normalizedMessage.includes('g-smtp') ||
      normalizedMessage.includes('gmail') ||
      normalizedMessage.includes('google')
    ) {
      // Gmail disabled account
      if (normalizedMessage.includes('account disabled') || normalizedMessage.includes('suspended')) {
        return {
          type: 'disabled',
          severity: 'permanent',
          message: 'Gmail account is disabled or suspended',
          originalMessage,
          providerSpecific: {
            code: 'GMAIL_DISABLED',
            action: 'Contact Gmail support',
            details: 'Account has been disabled by Google',
          },
        };
      }

      // Gmail over quota
      if (normalizedMessage.includes('over quota') || normalizedMessage.includes('storage quota')) {
        return {
          type: 'full_inbox',
          severity: 'temporary',
          message: 'Gmail storage quota exceeded',
          originalMessage,
          providerSpecific: {
            code: 'GMAIL_QUOTA_EXCEEDED',
            action: 'User needs to free up storage space',
            details: 'Gmail account has exceeded storage limits',
          },
        };
      }

      // Gmail rate limiting
      if (normalizedMessage.includes('temporarily deferred') || normalizedMessage.includes('rate limit')) {
        return {
          type: 'rate_limited',
          severity: 'temporary',
          message: 'Gmail rate limiting active',
          originalMessage,
          providerSpecific: {
            code: 'GMAIL_RATE_LIMIT',
            action: 'Wait before retrying',
            details: 'Gmail is temporarily deferring messages',
          },
        };
      }
    }

    return SmtpErrorParser.parseGenericErrors(normalizedMessage, originalMessage, responseCode);
  }

  /**
   * Parse Yahoo-specific SMTP errors
   */
  private static parseYahooError(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    if (
      normalizedMessage.includes('yahoo') ||
      normalizedMessage.includes('ymail') ||
      normalizedMessage.includes('rocketmail')
    ) {
      // Yahoo account disabled
      if (normalizedMessage.includes('account disabled') || normalizedMessage.includes('account suspended')) {
        return {
          type: 'disabled',
          severity: 'permanent',
          message: 'Yahoo account is disabled or suspended',
          originalMessage,
          providerSpecific: {
            code: 'YAHOO_DISABLED',
            action: 'Contact Yahoo support',
            details: 'Yahoo account has been disabled',
          },
        };
      }

      // Yahoo full inbox
      if (normalizedMessage.includes('mailbox over quota') || normalizedMessage.includes('storage limit')) {
        return {
          type: 'full_inbox',
          severity: 'temporary',
          message: 'Yahoo mailbox is over quota',
          originalMessage,
          providerSpecific: {
            code: 'YAHOO_FULL',
            action: 'User needs to clean up mailbox',
            details: 'Yahoo account has exceeded storage limits',
          },
        };
      }

      // Yahoo specific error codes
      if (normalizedMessage.includes('553') && normalizedMessage.includes('request rejected')) {
        return {
          type: 'blocked',
          severity: 'permanent',
          message: 'Yahoo rejected the request',
          originalMessage,
          providerSpecific: {
            code: 'YAHOO_REJECTED',
            action: 'Check sender reputation',
            details: 'Yahoo rejected the message due to policy',
          },
        };
      }
    }

    return SmtpErrorParser.parseGenericErrors(normalizedMessage, originalMessage, responseCode);
  }

  /**
   * Parse Hotmail/Outlook-specific SMTP errors
   */
  private static parseHotmailError(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    if (
      normalizedMessage.includes('hotmail') ||
      normalizedMessage.includes('outlook') ||
      normalizedMessage.includes('live') ||
      normalizedMessage.includes('microsoft')
    ) {
      // Microsoft 365 specific patterns
      if (normalizedMessage.includes('550 5.2.1') || normalizedMessage.includes('recipient rejected')) {
        return {
          type: 'invalid',
          severity: 'permanent',
          message: 'Microsoft 365 rejected recipient',
          originalMessage,
          providerSpecific: {
            code: 'OFFICE365_REJECTED',
            action: 'Verify email address',
            details: 'Microsoft 365 rejected the recipient',
          },
        };
      }

      // Exchange Server patterns
      if (normalizedMessage.includes('550 5.4.1') || normalizedMessage.includes('relay access denied')) {
        return {
          type: 'blocked',
          severity: 'permanent',
          message: 'Microsoft Exchange relay access denied',
          originalMessage,
          providerSpecific: {
            code: 'EXCHANGE_RELAY_DENIED',
            action: 'Check authentication settings',
            details: 'Exchange server denied relay access',
          },
        };
      }

      // Microsoft rate limiting
      if (
        normalizedMessage.includes('4.4.2') ||
        normalizedMessage.includes('connection limit') ||
        normalizedMessage.includes('throttling')
      ) {
        return {
          type: 'rate_limited',
          severity: 'temporary',
          message: 'Microsoft Exchange rate limiting',
          originalMessage,
          providerSpecific: {
            code: 'EXCHANGE_THROTTLING',
            action: 'Wait before retrying',
            details: 'Microsoft Exchange is throttling connections',
          },
        };
      }
    }

    return SmtpErrorParser.parseGenericErrors(normalizedMessage, originalMessage, responseCode);
  }

  /**
   * Parse Proofpoint-specific SMTP errors
   */
  private static parseProofpointError(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    if (normalizedMessage.includes('proofpoint')) {
      // Proofpoint security filtering
      if (normalizedMessage.includes('message rejected') || normalizedMessage.includes('policy violation')) {
        return {
          type: 'blocked',
          severity: 'permanent',
          message: 'Proofpoint security policy violation',
          originalMessage,
          providerSpecific: {
            code: 'PROOFPOINT_BLOCKED',
            action: 'Check message content and sender reputation',
            details: 'Proofpoint blocked the message due to security policy',
          },
        };
      }

      // Proofpoint rate limiting
      if (normalizedMessage.includes('too many messages') || normalizedMessage.includes('frequency limit')) {
        return {
          type: 'rate_limited',
          severity: 'temporary',
          message: 'Proofpoint frequency limit exceeded',
          originalMessage,
          providerSpecific: {
            code: 'PROOFPOINT_RATE_LIMIT',
            action: 'Reduce sending frequency',
            details: 'Proofpoint limited the message frequency',
          },
        };
      }
    }

    return SmtpErrorParser.parseGenericErrors(normalizedMessage, originalMessage, responseCode);
  }

  /**
   * Parse Mimecast-specific SMTP errors
   */
  private static parseMimecastError(
    normalizedMessage: string,
    originalMessage: string,
    responseCode?: number
  ): ParsedSmtpError {
    if (normalizedMessage.includes('mimecast')) {
      // Mimecast security filtering
      if (normalizedMessage.includes('blocked by policy') || normalizedMessage.includes('content filter')) {
        return {
          type: 'blocked',
          severity: 'permanent',
          message: 'Mimecast content policy violation',
          originalMessage,
          providerSpecific: {
            code: 'MIMECAST_BLOCKED',
            action: 'Check message content and attachments',
            details: 'Mimecast blocked the message due to content policy',
          },
        };
      }

      // Mimecast rate limiting
      if (normalizedMessage.includes('rate limit exceeded') || normalizedMessage.includes('too many recipients')) {
        return {
          type: 'rate_limited',
          severity: 'temporary',
          message: 'Mimecast rate limiting active',
          originalMessage,
          providerSpecific: {
            code: 'MIMECAST_RATE_LIMIT',
            action: 'Wait or reduce sending frequency',
            details: 'Mimecast limited the message rate',
          },
        };
      }
    }

    return SmtpErrorParser.parseGenericErrors(normalizedMessage, originalMessage, responseCode);
  }
}

/**
 * Enhanced SMTP verification with provider-specific error parsing
 */
async function verifySmtpConnectionWithErrorParsing(
  email: string,
  domain: string,
  mxHost: string,
  options: CheckIfEmailExistsSmtpOptions,
  provider: EmailProvider
): Promise<SmtpVerificationResult> {
  // First, get the basic SMTP verification result
  const basicResult = await verifySmtpConnection(email, domain, mxHost, options, provider);

  // If there's an error, parse it with provider-specific context
  if (basicResult.error) {
    const parsedError = SmtpErrorParser.parseError(
      basicResult.error,
      provider,
      0 // Response code would need to be captured in SMTP verification
    );

    // Enhance the result based on parsed error
    switch (parsedError.type) {
      case 'disabled':
        basicResult.is_disabled = true;
        basicResult.is_deliverable = false;
        break;
      case 'full_inbox':
        basicResult.has_full_inbox = true;
        basicResult.is_deliverable = false;
        break;
      case 'invalid':
        basicResult.is_deliverable = false;
        break;
      case 'rate_limited':
        basicResult.is_deliverable = false;
        // Rate limiting is temporary, so don't mark as permanently invalid
        break;
      case 'blocked':
        basicResult.is_deliverable = false;
        break;
    }

    // Add provider-specific error details if available
    if (parsedError.providerSpecific) {
      basicResult.error += ` [${parsedError.providerSpecific.code}]`;
    }
  }

  return basicResult;
}

// Export functions for testing
export { verifyYahooApi, verifyYahooHeadless, verifyGmailHeadless, SmtpErrorParser };
export { HeadlessBrowser };
