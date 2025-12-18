import { getCacheStore } from './cache';
import { SMTPClient } from './smtp-client';
import type { SMTPSequence, SMTPTLSConfig, VerifyMailboxSMTPParams } from './types';
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

export async function verifyMailboxSMTP(
  params: VerifyMailboxSMTPParams
): Promise<{ result: boolean | null; cached: boolean; port: number; portCached: boolean }> {
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

  if (!mxRecords || mxRecords.length === 0) {
    log('No MX records found');
    return { result: false, cached: false, port: 0, portCached: false };
  }

  const mxHost = mxRecords[0]; // Use highest priority MX
  log(`Verifying ${local}@${domain} via ${mxHost}`);

  // Get cache store from cache parameter
  const smtpCacheStore = cache ? getCacheStore<boolean | null>(cache, 'smtp') : null;

  if (smtpCacheStore) {
    let cachedResult: boolean | null | undefined;
    try {
      cachedResult = await smtpCacheStore.get(`${mxHost}:${local}@${domain}`);
      if (cachedResult !== undefined) {
        log(`Using cached SMTP result: ${cachedResult}`);
        return {
          result: typeof cachedResult === 'boolean' ? cachedResult : null,
          cached: true,
          port: 0,
          portCached: false,
        };
      }
    } catch (_error) {
      // Cache error, continue with processing
      cachedResult = undefined;
    }
  }

  const smtpPortCacheStore = cache ? getCacheStore<number>(cache, 'smtpPort') : null;

  // Check cache first - use mxHost as key to cache per host
  if (smtpPortCacheStore) {
    let cachedPort: number | null | undefined;
    try {
      cachedPort = await smtpPortCacheStore.get(mxHost);
    } catch (_error) {
      // Cache error, continue with processing
      cachedPort = null;
    }

    if (cachedPort) {
      log(`Using cached port: ${cachedPort}`);
      const result = await testSMTPConnection({
        mxHost,
        port: cachedPort,
        local,
        domain,
        timeout,
        tlsConfig,
        hostname,
        useVRFY,
        sequence,
        log,
      });

      // Cache the SMTP result (cache even null results)
      if (smtpCacheStore && result !== undefined) {
        try {
          await smtpCacheStore.set(`${mxHost}:${local}@${domain}`, result);
          log(`Cached SMTP result ${result} for ${local}@${domain} via ${mxHost}`);
        } catch (_error) {
          // Cache error, ignore it
        }
      }

      return { result, cached: false, port: cachedPort, portCached: true };
    }
  }

  // Test each port in order
  for (const port of ports) {
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

      // Cache the SMTP result (cache even null results)
      if (smtpCacheStore && result !== undefined) {
        try {
          await smtpCacheStore.set(`${mxHost}:${local}@${domain}`, result);
          log(`Cached SMTP result ${result} for ${local}@${domain} via ${mxHost}`);
        } catch (_error) {
          // Cache error, ignore it
        }
      }

      if (result !== null) {
        if (smtpPortCacheStore) {
          try {
            await smtpPortCacheStore.set(mxHost, port);
            log(`Cached port ${port} for ${mxHost}`);
          } catch (_error) {
            // Cache error, ignore it
          }
        }
        return { result, cached: false, port, portCached: false };
      }
    }
  }

  log('All ports failed');
  return { result: null, cached: false, port: 0, portCached: false };
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

async function testSMTPConnection(params: ConnectionTestParams): Promise<boolean | null> {
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
    log(`${port}: Empty sequence - returning true`);
    return true;
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
    const result = await client.verifyEmail({
      local,
      domain,
      from: activeSequence.from,
      vrfyTarget: activeSequence.vrfyTarget,
    });

    log(`${port}: ${result.reason || (result.success ? 'valid' : 'invalid')}`);

    // Clean up the connection
    client.destroy();

    // Convert SMTPVerifyResult to boolean|null format expected by caller
    if (result.success) {
      return true;
    } else if (result.reason === 'over_quota' || result.reason === 'not_found') {
      return false;
    } else {
      return null; // For temporary failures, ambiguous results, etc.
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`${port}: Connection failed - ${errorMessage}`);
    return null;
  }
}
