import { getCacheStore } from './cache';
import { SMTPClient } from './smtp-client';
import type { SMTPSequence, SMTPTLSConfig, SmtpVerificationResult, VerifyMailboxSMTPParams } from './types';
import { SMTPStep } from './types';

// Default configuration
const DEFAULT_PORTS = [25, 587, 465]; // Standard SMTP -> STARTTLS -> SMTPS
const DEFAULT_TIMEOUT = 3000;
const DEFAULT_MAX_RETRIES = 1;

// Port configurations
const PORT_CONFIGS = {
  25: { tls: false, starttls: true },
  587: { tls: false, starttls: true },
  465: { tls: true, starttls: false },
} as const;

/**
 * Parse SMTP error messages to detect specific conditions
 * Ported from check-if-email-exists.ts for consistency
 */
function parseSmtpError(errorMessage: string): {
  isDisabled: boolean;
  hasFullInbox: boolean;
  isInvalid: boolean;
  isCatchAll: boolean;
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
    'storage space', // Gmail specific
    'overquota', // Single word variant
    '452',
    '552',
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
 * Extract response code from SMTP error message
 */
function extractResponseCode(errorMessage: string): number | undefined {
  // Match 3-digit SMTP response code at the start of the message
  const match = errorMessage.match(/^(\d{3})/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Try to find response code in common error patterns
  const codeMatch = errorMessage.match(/\b(452|552|550|553|450|451|421)\b/);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }

  return undefined;
}

/**
 * Enhanced SMTP verification with rich result data
 * Returns SmtpVerificationResult with all data points from check-if-email-exists.ts
 */
export async function verifyMailboxSMTP(params: VerifyMailboxSMTPParams): Promise<SmtpVerificationResult> {
  const { local, domain, mxRecords = [], options = {} } = params;

  const {
    ports = DEFAULT_PORTS,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    tls: tlsConfig = true,
    hostname = 'localhost',
    useVRFY = true,
    cache,
    debug = false,
    sequence,
  } = options;

  const log = debug ? (...args: any[]) => console.log('[SMTP]', ...args) : () => {};

  // Default result when connection fails
  const defaultFailureResult: SmtpVerificationResult = {
    canConnectSmtp: false,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: false,
    isDisabled: false,
    error: 'No MX records found',
  };

  if (!mxRecords || mxRecords.length === 0) {
    log('No MX records found');
    return defaultFailureResult;
  }

  // Validate ports - reject invalid ports (outside valid range 1-65535)
  const hasInvalidPort = ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535);
  if (hasInvalidPort) {
    log('Invalid port numbers provided');
    return {
      ...defaultFailureResult,
      error: 'Invalid port numbers provided',
    };
  }

  const mxHost = mxRecords[0]; // Use highest priority MX
  log(`Verifying ${local}@${domain} via ${mxHost}`);

  // Check cache for existing rich result
  const smtpCacheStore = cache ? getCacheStore<SmtpVerificationResult | null>(cache, 'smtp') : null;
  if (smtpCacheStore) {
    try {
      const cachedResult = await smtpCacheStore.get(`${mxHost}:${local}@${domain}`);
      if (cachedResult !== null && cachedResult !== undefined) {
        log(`Using cached SMTP result: ${cachedResult.isDeliverable}`);
        return cachedResult;
      }
    } catch (_error) {
      // Cache error, continue with processing
    }
  }

  const smtpPortCacheStore = cache ? getCacheStore<number>(cache, 'smtpPort') : null;

  // Check cache for port
  let cachedPort: number | undefined;
  if (smtpPortCacheStore) {
    try {
      const portResult = await smtpPortCacheStore.get(mxHost);
      cachedPort = portResult !== undefined && portResult !== null ? portResult : undefined;
    } catch (_error) {
      // Cache error, continue
    }
  }

  const portsToTest = cachedPort ? [cachedPort] : ports;

  // Test each port in order
  for (const port of portsToTest) {
    log(`Testing port ${port}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
        log(`Retry ${attempt + 1}, waiting ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await testSMTPConnection({
        mxHost,
        port,
        local,
        domain,
        timeout,
        tlsConfig,
        hostname,
        useVRFY,
        sequence,
        log,
      });

      // Cache the rich result
      if (smtpCacheStore && (result.canConnectSmtp || result.error)) {
        try {
          await smtpCacheStore.set(`${mxHost}:${local}@${domain}`, result);
          log(`Cached SMTP result for ${local}@${domain} via ${mxHost}`);
        } catch (_error) {
          // Cache error, ignore it
        }
      }

      // Cache successful port
      if (result.canConnectSmtp && smtpPortCacheStore && !cachedPort) {
        try {
          await smtpPortCacheStore.set(mxHost, port);
          log(`Cached port ${port} for ${mxHost}`);
        } catch (_error) {
          // Cache error, ignore it
        }
      }

      // If we got a definitive result (connected), return it
      if (result.canConnectSmtp || result.error) {
        return result;
      }
    }
  }

  log('All ports failed');
  return {
    canConnectSmtp: false,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: false,
    isDisabled: false,
    error: 'All SMTP connection attempts failed',
  };
}

interface ConnectionTestParams {
  mxHost: string;
  port: number;
  local: string;
  domain: string;
  timeout: number;
  tlsConfig: boolean | SMTPTLSConfig;
  hostname: string;
  useVRFY: boolean;
  sequence?: SMTPSequence;
  log: (...args: any[]) => void;
}

async function testSMTPConnection(params: ConnectionTestParams): Promise<SmtpVerificationResult> {
  const { mxHost, port, local, domain, timeout, tlsConfig, hostname, useVRFY, sequence, log } = params;

  const portConfig = PORT_CONFIGS[port as keyof typeof PORT_CONFIGS] || { tls: false, starttls: false };
  const useTLS = tlsConfig !== false && (portConfig.tls || portConfig.starttls);

  // Default sequence if not provided
  const defaultSequence: SMTPSequence = {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
  };
  const activeSequence = sequence || defaultSequence;

  // For port 25, use HELO instead of EHLO (original behavior)
  if (port === 25) {
    activeSequence.steps = activeSequence.steps.map((step) => (step === SMTPStep.EHLO ? SMTPStep.HELO : step));
  }

  // Handle empty sequence - consider it successful
  if (activeSequence.steps.length === 0) {
    log(`${port}: Empty sequence - returning success`);
    return {
      canConnectSmtp: true,
      hasFullInbox: false,
      isCatchAll: false,
      isDeliverable: true,
      isDisabled: false,
    };
  }

  try {
    // Create SMTP client with configuration
    const client = new SMTPClient(mxHost, port, {
      timeout,
      tls: tlsConfig,
      hostname,
      useVRFY,
      sequence: activeSequence,
      debug: log,
      onConnect: () => {
        log(`Connected to ${mxHost}:${port}${portConfig.tls ? ' with TLS' : ''}`);
      },
      onError: (err) => {
        log(`Connection error: ${err.message}`);
      },
      onClose: () => {
        log('Connection closed');
      },
    });

    // Connect to the server
    await client.connect();

    // Verify the email address
    const verifyResult = await client.verifyEmail({
      local,
      domain,
      from: activeSequence.from,
      vrfyTarget: activeSequence.vrfyTarget,
    });

    log(`${port}: ${verifyResult.reason || (verifyResult.success ? 'valid' : 'invalid')}`);

    // Clean up the connection
    client.destroy();

    // Build rich result from SMTPVerifyResult
    if (verifyResult.success) {
      return {
        canConnectSmtp: true,
        hasFullInbox: false,
        isCatchAll: false,
        isDeliverable: true,
        isDisabled: false,
      };
    }

    // Parse error for detailed information
    const errorMessage = verifyResult.reason || 'Unknown error';
    const parsed = parseSmtpError(errorMessage);
    const responseCode = extractResponseCode(errorMessage);

    return {
      canConnectSmtp: true,
      hasFullInbox: parsed.hasFullInbox,
      isCatchAll: parsed.isCatchAll,
      isDeliverable: !parsed.isInvalid && !parsed.isDisabled && !parsed.hasFullInbox,
      isDisabled: parsed.isDisabled,
      error: errorMessage,
      responseCode: responseCode,
      providerSpecific: responseCode
        ? {
            errorCode: responseCode.toString(),
            details: errorMessage,
          }
        : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`${port}: Connection failed - ${errorMessage}`);

    // Parse error for detailed information
    const parsed = parseSmtpError(errorMessage);
    const responseCode = extractResponseCode(errorMessage);

    // Determine if this is a connection failure or a protocol error
    const isConnectionFailure =
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('socket hang up');

    if (isConnectionFailure) {
      return {
        canConnectSmtp: false,
        hasFullInbox: false,
        isCatchAll: false,
        isDeliverable: false,
        isDisabled: false,
        error: errorMessage,
      };
    }

    return {
      canConnectSmtp: true,
      hasFullInbox: parsed.hasFullInbox,
      isCatchAll: parsed.isCatchAll,
      isDeliverable: !parsed.isInvalid && !parsed.isDisabled && !parsed.hasFullInbox,
      isDisabled: parsed.isDisabled,
      error: errorMessage,
      responseCode: responseCode,
    };
  }
}
