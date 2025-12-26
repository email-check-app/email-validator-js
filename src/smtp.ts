import * as net from 'node:net';
import * as tls from 'node:tls';
import { getCacheStore } from './cache';
import type { SMTPSequence, SMTPTLSConfig, SmtpVerificationResult, VerifyMailboxSMTPParams } from './types';
import { EmailProvider, parseSmtpError, SMTPStep } from './types';

/**
 * Check if a string is an IP address
 */
function isIPAddress(host: string): boolean {
  // IPv4 pattern
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(host)) {
    // Check if all octets are <= 255
    const octets = host.split('.');
    return octets.every((octet) => parseInt(octet, 10) <= 255);
  }

  // IPv6 pattern (simplified)
  const ipv6Regex =
    /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})$|^::1(?::(?::[0-9a-fA-F]{1,4}){1,7})|$|:(?:(?::[0-9a-fA-F]{1,4}){1,7}:)$/;

  return ipv6Regex.test(host);
}

/**
 * @param  {String} smtpReply A message from the SMTP server.
 * @return {Boolean} True if over quota.
 */
function isOverQuota(smtpReply: string): boolean {
  return Boolean(smtpReply && /(over quota)/gi.test(smtpReply));
}

/**
 * @see https://support.google.com/a/answer/3221692?hl=en
 * @see http://www.greenend.org.uk/rjk/tech/smtpreplies.html
 * @param {String} smtpReply A response from the SMTP server.
 * @return {boolean} True if the error is recognized as a mailbox missing error.
 */
function isInvalidMailboxError(smtpReply: string): boolean {
  return Boolean(
    smtpReply &&
      /^(510|511|513|550|551|553)/.test(smtpReply) &&
      !/(junk|spam|openspf|spoofing|host|rbl.+blocked)/gi.test(smtpReply)
  );
}

/**
 * @see https://www.ietf.org/mail-archive/web/ietf-smtp/current/msg06344.html
 * @param {String} smtpReply A message from the SMTP server.
 * @return {Boolean} True if this is a multiline greet.
 */
function isMultilineGreet(smtpReply: string): boolean {
  return Boolean(smtpReply && /^(250|220)-/.test(smtpReply));
}

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
): Promise<{ smtpResult: SmtpVerificationResult; cached: boolean; port: number; portCached: boolean }> {
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

  // Helper function to create SmtpVerificationResult from internal result
  const createSmtpResult = (
    result: boolean | null,
    port: number,
    tlsUsed: boolean,
    mxHost: string
  ): SmtpVerificationResult => {
    const reason = result === true ? 'valid' : result === null ? 'ambiguous' : 'not_found';
    const parsedError = parseSmtpError(reason);

    return {
      canConnectSmtp: result !== null,
      hasFullInbox: parsedError.hasFullInbox,
      isCatchAll: parsedError.isCatchAll,
      isDeliverable: result === true,
      isDisabled: result === false && parsedError.isDisabled,
      error: result === null ? reason : result === false ? reason : undefined,
      providerUsed: EmailProvider.EVERYTHING_ELSE,
      checkedAt: Date.now(),
    };
  };

  const createFailureResult = (error: string): SmtpVerificationResult => ({
    canConnectSmtp: false,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: false,
    isDisabled: false,
    error,
    providerUsed: EmailProvider.EVERYTHING_ELSE,
    checkedAt: Date.now(),
  });

  if (!mxRecords || mxRecords.length === 0) {
    log('No MX records found');
    return {
      smtpResult: createFailureResult('No MX records found'),
      cached: false,
      port: 0,
      portCached: false,
    };
  }

  const mxHost = mxRecords[0]; // Use highest priority MX
  log(`Verifying ${local}@${domain} via ${mxHost}`);

  // Get cache store from cache parameter - now uses SmtpVerificationResult
  const smtpCacheStore = cache ? getCacheStore<SmtpVerificationResult>(cache, 'smtp') : null;

  if (smtpCacheStore) {
    let cachedResult: SmtpVerificationResult | null | undefined;
    try {
      cachedResult = await smtpCacheStore.get(`${mxHost}:${local}@${domain}`);
      if (cachedResult !== undefined && cachedResult !== null) {
        log(`Using cached SMTP result: ${cachedResult.isDeliverable}`);
        return {
          smtpResult: cachedResult,
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

      const smtpResult = createSmtpResult(result, cachedPort, tlsConfig !== false, mxHost);

      // Cache the SMTP result
      if (smtpCacheStore) {
        try {
          await smtpCacheStore.set(`${mxHost}:${local}@${domain}`, smtpResult);
          log(`Cached SMTP result ${result} for ${local}@${domain} via ${mxHost}`);
        } catch (_error) {
          // Cache error, ignore it
        }
      }

      return { smtpResult, cached: false, port: cachedPort, portCached: true };
    }
  }

  // Test each port in order
  for (const port of ports) {
    log(`Testing port ${port}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 1000);
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

      const smtpResult = createSmtpResult(result, port, tlsConfig !== false, mxHost);

      // Cache the SMTP result
      if (smtpCacheStore) {
        try {
          await smtpCacheStore.set(`${mxHost}:${local}@${domain}`, smtpResult);
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
        return { smtpResult, cached: false, port, portCached: false };
      }
    }
  }

  log('All ports failed');
  return {
    smtpResult: createFailureResult('All SMTP connection attempts failed'),
    cached: false,
    port: 0,
    portCached: false,
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

async function testSMTPConnection(params: ConnectionTestParams): Promise<boolean | null> {
  const { mxHost, port, local, domain, timeout, tlsConfig, hostname, useVRFY, sequence, log } = params;

  const portConfig = PORT_CONFIGS[port as keyof typeof PORT_CONFIGS] || { tls: false, starttls: false };
  const useTLS = tlsConfig !== false && (portConfig.tls || portConfig.starttls);
  const implicitTLS = portConfig.tls;

  // Default sequence if not provided
  const defaultSequence: SMTPSequence = {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
  };
  const activeSequence = sequence || defaultSequence;

  // For port 25, use HELO instead of EHLO (original behavior)
  if (port === 25) {
    activeSequence.steps = activeSequence.steps.map((step) => (step === SMTPStep.EHLO ? SMTPStep.HELO : step));
  }

  const tlsOptions: tls.ConnectionOptions = {
    host: mxHost,
    servername: isIPAddress(mxHost) ? undefined : mxHost, // Don't set servername for IP addresses
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    ...(typeof tlsConfig === 'object' ? tlsConfig : {}),
  };

  return new Promise((resolve) => {
    let socket: net.Socket | tls.TLSSocket;
    let buffer = '';
    let isTLS = implicitTLS;
    let currentStepIndex = 0;
    let resolved = false;
    let supportsSTARTTLS = false;
    let supportsVRFY = false;

    let cleanup = () => {
      if (resolved) return;
      resolved = true;

      try {
        socket?.write('QUIT\r\n');
      } catch {}

      setTimeout(() => socket?.destroy(), 100);
    };

    const finish = (result: boolean | null, reason?: string) => {
      if (resolved) return;
      log(`${port}: ${reason || (result ? 'valid' : 'invalid')}`);
      cleanup();
      resolve(result);
    };

    const sendCommand = (cmd: string) => {
      if (resolved) return;
      log(`→ ${cmd}`);
      socket?.write(`${cmd}\r\n`);
    };

    const nextStep = () => {
      currentStepIndex++;
      if (currentStepIndex >= activeSequence.steps.length) {
        finish(true, 'sequence_complete');
        return;
      }
      executeStep(activeSequence.steps[currentStepIndex]);
    };

    const executeStep = (step: SMTPStep) => {
      if (resolved) return;

      switch (step) {
        case SMTPStep.EHLO:
          sendCommand(`EHLO ${hostname}`);
          break;
        case SMTPStep.HELO:
          sendCommand(`HELO ${domain}`);
          break;
        case SMTPStep.GREETING:
          // No command to send, wait for server greeting
          break;
        case SMTPStep.STARTTLS:
          sendCommand('STARTTLS');
          break;
        case SMTPStep.MAIL_FROM: {
          const from = activeSequence.from || '<>';
          sendCommand(`MAIL FROM:${from}`);
          break;
        }
        case SMTPStep.RCPT_TO:
          sendCommand(`RCPT TO:<${local}@${domain}>`);
          break;
        case SMTPStep.VRFY: {
          const vrfyTarget = activeSequence.vrfyTarget || local;
          sendCommand(`VRFY ${vrfyTarget}`);
          break;
        }
        case SMTPStep.QUIT:
          sendCommand('QUIT');
          break;
      }
    };

    const processResponse = (response: string) => {
      if (resolved) return;

      const code = response.substring(0, 3);
      const isMultiline = response.length > 3 && response[3] === '-';
      log(`← ${response}`);

      // Handle multiline greetings properly (original behavior)
      if (isMultilineGreet(response)) {
        return;
      }

      // Apply original logic for over quota and invalid mailbox errors (check before multiline handling)
      if (isOverQuota(response)) {
        finish(false, 'over_quota');
        return;
      }

      if (isInvalidMailboxError(response)) {
        finish(false, 'not_found');
        return;
      }

      // Skip multiline continuation for EHLO responses
      if (isMultiline) {
        const currentStep = activeSequence.steps[currentStepIndex];
        if (currentStep === SMTPStep.EHLO && code === '250') {
          const upper = response.toUpperCase();
          if (upper.includes('STARTTLS')) supportsSTARTTLS = true;
          if (upper.includes('VRFY')) supportsVRFY = true;
        }
        if (currentStep === SMTPStep.HELO && code === '250') {
          const upper = response.toUpperCase();
          if (upper.includes('VRFY')) supportsVRFY = true;
        }
        return;
      }

      // Check for recognized responses
      if (
        !response.includes('220') &&
        !response.includes('250') &&
        !response.includes('550') &&
        !response.includes('552')
      ) {
        finish(null, 'unrecognized_response');
        return;
      }

      const currentStep = activeSequence.steps[currentStepIndex];

      // Process response based on current step
      switch (currentStep) {
        case SMTPStep.GREETING:
          if (code.startsWith('220')) {
            nextStep();
          } else {
            finish(null, 'no_greeting');
          }
          break;

        case SMTPStep.EHLO:
          if (code.startsWith('250')) {
            // Check if we need STARTTLS
            const hasSTARTTLS = activeSequence.steps.includes(SMTPStep.STARTTLS);
            if (!isTLS && useTLS && supportsSTARTTLS && !implicitTLS && hasSTARTTLS) {
              // Jump to STARTTLS step
              currentStepIndex = activeSequence.steps.indexOf(SMTPStep.STARTTLS);
              executeStep(SMTPStep.STARTTLS);
            } else {
              nextStep();
            }
          } else {
            finish(null, 'ehlo_failed');
          }
          break;

        case SMTPStep.HELO:
          if (code.startsWith('250')) {
            nextStep();
          } else {
            finish(null, 'helo_failed');
          }
          break;

        case SMTPStep.STARTTLS:
          if (code.startsWith('220')) {
            // Upgrade to TLS
            const plainSocket = socket as net.Socket;
            socket = tls.connect(
              {
                ...tlsOptions,
                socket: plainSocket,
                servername: isIPAddress(mxHost) ? undefined : mxHost,
              },
              () => {
                isTLS = true;
                log('TLS upgraded');
                buffer = '';
                // Continue with next step after STARTTLS
                const starttlsIndex = activeSequence.steps.indexOf(SMTPStep.STARTTLS);
                currentStepIndex = starttlsIndex;
                nextStep();
              }
            );
            socket.on('data', handleData);
            socket.on('error', () => finish(null, 'tls_error'));
          } else {
            // STARTTLS failed, continue to next step
            nextStep();
          }
          break;

        case SMTPStep.MAIL_FROM:
          if (code.startsWith('250')) {
            nextStep();
          } else {
            finish(null, 'mail_from_rejected');
          }
          break;

        case SMTPStep.RCPT_TO:
          if (code.startsWith('250') || code.startsWith('251')) {
            finish(true, 'valid');
          } else if (code.startsWith('552') || code.startsWith('452')) {
            finish(false, 'over_quota');
          } else if (code.startsWith('4')) {
            finish(null, 'temporary_failure');
          } else if (useVRFY && supportsVRFY && code.startsWith('5') && activeSequence.steps.includes(SMTPStep.VRFY)) {
            // Jump to VRFY step
            currentStepIndex = activeSequence.steps.indexOf(SMTPStep.VRFY);
            executeStep(SMTPStep.VRFY);
          } else {
            finish(null, 'ambiguous');
          }
          break;

        case SMTPStep.VRFY:
          if (code.startsWith('250') || code.startsWith('252')) {
            finish(true, 'vrfy_valid');
          } else if (code.startsWith('550')) {
            finish(false, 'vrfy_invalid');
          } else {
            finish(null, 'vrfy_failed');
          }
          break;

        case SMTPStep.QUIT:
          if (code.startsWith('221')) {
            finish(null, 'quit_received');
          }
          break;
      }
    };

    let handleData = (data: Buffer) => {
      if (resolved) return;

      buffer += data.toString();
      let pos: number;
      while ((pos = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.substring(0, pos);
        buffer = buffer.substring(pos + 2);
        processResponse(line.trim());
      }
    };

    // Validate port
    if (port < 0 || port > 65535 || !Number.isInteger(port)) {
      finish(null, 'invalid_port');
      return;
    }

    // Create connection
    if (implicitTLS) {
      const connectOptions = {
        ...tlsOptions,
        port,
        servername: isIPAddress(mxHost) ? undefined : mxHost,
      };
      socket = tls.connect(connectOptions, () => {
        log(`Connected to ${mxHost}:${port} with TLS`);
        socket.on('data', handleData);
      });
    } else {
      socket = net.connect({ host: mxHost, port }, () => {
        log(`Connected to ${mxHost}:${port}`);
        socket.on('data', handleData);
      });
    }

    // Start with the first step
    if (activeSequence.steps.length === 0) {
      // Empty sequence - consider it complete
      finish(true, 'sequence_complete');
      return;
    }

    const firstStep = activeSequence.steps[0];

    // Set up comprehensive timeout handling
    let connectionTimeout: NodeJS.Timeout;
    let stepTimeout: NodeJS.Timeout;
    let lastActivityTime = Date.now();

    const resetActivityTimeout = () => {
      lastActivityTime = Date.now();
      if (stepTimeout) {
        clearTimeout(stepTimeout);
      }
      stepTimeout = setTimeout(() => {
        if (!resolved) {
          log(`Step timeout after ${timeout}ms of inactivity`);
          finish(null, 'step_timeout');
        }
      }, timeout);
    };

    // Set initial connection timeout
    connectionTimeout = setTimeout(() => {
      if (!resolved) {
        log(`Connection timeout after ${timeout}ms`);
        finish(null, 'connection_timeout');
      }
    }, timeout);

    if (firstStep !== SMTPStep.GREETING) {
      // If sequence doesn't start with GREETING, start with the specified step
      executeStep(firstStep);
    }

    // Socket-level timeout (fallback)
    socket.setTimeout(timeout, () => {
      if (!resolved) {
        log(`Socket timeout after ${timeout}ms`);
        finish(null, 'socket_timeout');
      }
    });

    // Enhanced error handling
    socket.on('error', (error) => {
      log(`Socket error: ${error.message}`);
      if (!resolved) finish(null, 'connection_error');
    });

    socket.on('close', () => {
      if (!resolved) {
        log('Socket closed unexpectedly');
        finish(null, 'connection_closed');
      }
    });

    // Override data handler to track activity
    const originalHandleData = handleData;
    handleData = (data: Buffer) => {
      resetActivityTimeout(); // Reset timeout on each data receipt
      originalHandleData(data);
    };

    // Store original cleanup before replacing
    const originalCleanup = cleanup;

    // Enhanced cleanup function
    const enhancedCleanup = () => {
      if (resolved) return;
      resolved = true;

      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (stepTimeout) clearTimeout(stepTimeout);
      socket.setTimeout(0); // Disable socket timeout

      try {
        socket?.write('QUIT\r\n');
      } catch {}

      setTimeout(() => socket?.destroy(), 100);
    };

    // Replace cleanup with enhanced version
    cleanup = enhancedCleanup;
  });
}
