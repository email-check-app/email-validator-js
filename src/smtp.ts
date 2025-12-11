import * as net from 'node:net';
import * as tls from 'node:tls';
import type { SMTPSequence, SMTPTLSConfig, VerifyMailboxSMTPParams } from './types';
import { SMTPStep } from './types';

// Default configuration
const DEFAULT_PORTS = [25, 587, 465]; // Standard SMTP -> STARTTLS -> SMTPS
const DEFAULT_TIMEOUT = 3000;
const DEFAULT_MAX_RETRIES = 1;
const CACHE_TTL = 3600000; // 1 hour

// Domain to successful port configuration cache
const PORT_CACHE = new Map<string, { port: number; timestamp: number }>();

// Port configurations
const PORT_CONFIGS = {
  25: { tls: false, starttls: true },
  587: { tls: false, starttls: true },
  465: { tls: true, starttls: false },
} as const;

export async function verifyMailboxSMTP(params: VerifyMailboxSMTPParams): Promise<boolean | null> {
  const { local, domain, mxRecords = [], options = {} } = params;

  const {
    ports = DEFAULT_PORTS,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    tls: tlsConfig = true,
    hostname = 'localhost',
    useVRFY = true,
    cache = true,
    debug = false,
    sequence,
  } = options;

  const log = debug ? (...args: any[]) => console.log('[SMTP]', ...args) : () => {};

  if (mxRecords.length === 0) {
    log('No MX records found');
    return false;
  }

  const mxHost = mxRecords[0]; // Use highest priority MX
  log(`Verifying ${local}@${domain} via ${mxHost}`);

  // Check cache first
  if (cache) {
    const cached = PORT_CACHE.get(domain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      log(`Using cached port: ${cached.port}`);
      const result = await testSMTPConnection({
        mxHost,
        port: cached.port,
        local,
        domain,
        timeout,
        tlsConfig,
        hostname,
        useVRFY,
        sequence,
        log,
      });
      if (result !== null) return result;
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

      if (result !== null) {
        // Cache successful port
        if (cache) {
          PORT_CACHE.set(domain, { port, timestamp: Date.now() });
        }
        return result;
      }
    }
  }

  log('All ports failed');
  return null;
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

  const tlsOptions: tls.ConnectionOptions = {
    host: mxHost,
    servername: mxHost,
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

    // Create connection
    if (implicitTLS) {
      socket = tls.connect({ ...tlsOptions, port }, () => {
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
