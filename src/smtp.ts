import * as net from 'node:net';
import * as tls from 'node:tls';
import { getCacheStore } from './cache';
import type { SMTPSequence, SMTPTLSConfig, VerifyMailboxSMTPParams } from './types';
import { SMTPStep } from './types';

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

// Default configuration
const DEFAULT_PORTS = [25, 587, 465]; // Standard SMTP -> STARTTLS -> SMTPS
const DEFAULT_TIMEOUT = 2000;
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
      log(`Using cached SMTP result: ${cachedResult}`);
      return {
        result: typeof cachedResult === 'boolean' ? cachedResult : null,
        cached: true,
        port: 0,
        portCached: false,
      };
    } catch (_error) {
      // Cache error, continue with processing
      cachedResult = null;
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
      return { result, cached: false, port: cachedPort, portCached: true };
    }
  }

  // Test each port in order
  for (const port of ports) {
    log(`Testing port ${port}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 3000);
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

      if (smtpCacheStore) {
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
  const implicitTLS = portConfig.tls;

  // Default sequence if not provided
  const defaultSequence: SMTPSequence = {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
  };
  const activeSequence = sequence || defaultSequence;
  // if port 25 replace any HELO with EHLO
  if (port === 25) {
    activeSequence.steps = activeSequence.steps.map((step) => (step === SMTPStep.HELO ? SMTPStep.EHLO : step));
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

    const cleanup = () => {
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

      // Skip multiline continuation
      if (isMultiline) {
        const currentStep = activeSequence.steps[currentStepIndex];
        if (currentStep === SMTPStep.EHLO && code === '250') {
          const upper = response.toUpperCase();
          if (upper.includes('STARTTLS')) supportsSTARTTLS = true;
          if (upper.includes('VRFY')) supportsVRFY = true;
        }
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
          } else if (code.startsWith('550') || code.startsWith('551') || code.startsWith('553')) {
            if (!response.match(/spam|policy|rbl|blocked/i)) {
              finish(false, 'not_found');
            } else {
              finish(null, 'policy_rejection');
            }
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

    const handleData = (data: Buffer) => {
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
    if (firstStep !== SMTPStep.GREETING) {
      // If sequence doesn't start with GREETING, start with the specified step
      executeStep(firstStep);
    }

    socket.setTimeout(timeout, () => finish(null, 'timeout'));
    socket.on('error', () => finish(null, 'connection_error'));
    socket.on('close', () => {
      if (!resolved) finish(null, 'connection_closed');
    });
  });
}
