import * as net from 'node:net';
import * as tls from 'node:tls';
import type { SMTPSequence, SMTPStep, SMTPTLSConfig } from './types';
import { SMTPStep as Step } from './types';

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

export interface SMTPClientOptions {
  /** Timeout in milliseconds for connection and operations */
  timeout?: number;
  /** TLS configuration */
  tls?: boolean | SMTPTLSConfig;
  /** Hostname to use in EHLO/HELO commands */
  hostname?: string;
  /** Whether to use VRFY command for verification */
  useVRFY?: boolean;
  /** Custom SMTP sequence to execute */
  sequence?: SMTPSequence;
  /** Called when a complete message is received */
  onMessage?: (message: string) => void;
  /** Called when successfully connected */
  onConnect?: () => void;
  /** Called on socket errors */
  onError?: (err: Error) => void;
  /** Called when the connection is closed */
  onClose?: () => void;
  /** Debug logging function */
  debug?: (...args: any[]) => void;
}

export interface SMTPVerifyResult {
  success: boolean;
  reason?: string;
}

export interface SMTPVerifyParams {
  local: string;
  domain: string;
  from?: string;
  vrfyTarget?: string;
}

/**
 * SMTP Client class for handling SMTP connections and protocol operations
 */
export class SMTPClient {
  private host: string;
  private port: number;
  private timeout: number;
  private tls: boolean | SMTPTLSConfig;
  private hostname: string;
  private useVRFY: boolean;
  private sequence: SMTPSequence;
  private debug: (...args: any[]) => void;

  private socket: net.Socket | tls.TLSSocket | null = null;
  private connected = false;
  private buffer = '';
  private isTLS = false;
  private resolved = false;
  private currentStepIndex = 0;
  private supportsSTARTTLS = false;
  private supportsVRFY = false;

  // Store verification parameters
  private verifyParams: SMTPVerifyParams | null = null;

  // Callbacks
  private onMessage: (message: string) => void;
  private onConnect: () => void;
  private onError: (err: Error) => void;
  private onClose: () => void;

  // Data handler that can be overridden
  private dataHandler: (data: Buffer) => void;

  // Timeouts
  private connectionTimeout: NodeJS.Timeout | null = null;
  private stepTimeout: NodeJS.Timeout | null = null;
  private lastActivityTime = 0;

  constructor(host: string, port: number, options: SMTPClientOptions = {}) {
    this.host = host;
    this.port = port;
    this.timeout = options.timeout ?? 3000;
    this.tls = options.tls ?? true;
    this.hostname = options.hostname ?? 'localhost';
    this.useVRFY = options.useVRFY ?? true;

    // Default sequence if not provided
    this.sequence = options.sequence ?? {
      steps: [Step.GREETING, Step.EHLO, Step.MAIL_FROM, Step.RCPT_TO],
    };

    // For port 25, use HELO instead of EHLO (original behavior)
    if (port === 25) {
      this.sequence.steps = this.sequence.steps.map((step) => (step === Step.EHLO ? Step.HELO : step));
    }

    this.debug = options.debug ?? (() => {});
    this.onMessage = options.onMessage ?? this.debug;
    this.onConnect = options.onConnect ?? (() => {});
    this.onError = options.onError ?? console.error;
    this.onClose = options.onClose ?? (() => {});

    // Initialize data handler
    this.dataHandler = this.defaultHandleData.bind(this);
  }

  /**
   * Connect to the SMTP server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Validate port
      if (this.port < 0 || this.port > 65535 || !Number.isInteger(this.port)) {
        reject(new Error(`Invalid port: ${this.port}`));
        return;
      }

      const implicitTLS = this.port === 465;
      this.isTLS = implicitTLS;

      const tlsOptions: tls.ConnectionOptions = {
        host: this.host,
        servername: isIPAddress(this.host) ? undefined : this.host,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        ...(typeof this.tls === 'object' ? this.tls : {}),
      };

      const cleanup = () => {
        if (this.resolved) return;
        this.resolved = true;
        this.clearTimeouts();
        try {
          this.socket?.write('QUIT\r\n');
        } catch {}
        setTimeout(() => this.destroy(), 100);
      };

      const finish = (result: boolean, reason?: string) => {
        if (this.resolved) return;
        cleanup();
        if (result) {
          resolve();
        } else {
          reject(new Error(reason || 'Connection failed'));
        }
      };

      // Create connection
      if (implicitTLS) {
        const connectOptions = {
          ...tlsOptions,
          port: this.port,
          servername: isIPAddress(this.host) ? undefined : this.host,
        };
        this.socket = tls.connect(connectOptions, () => {
          this.debug(`Connected to ${this.host}:${this.port} with TLS`);
          this.setupSocket();
          this.onConnect();
        });
      } else {
        this.socket = net.connect({ host: this.host, port: this.port }, () => {
          this.debug(`Connected to ${this.host}:${this.port}`);
          this.setupSocket();
          this.onConnect();
        });
      }

      // Set up timeout handling
      this.connectionTimeout = setTimeout(() => {
        if (!this.resolved) {
          this.debug(`Connection timeout after ${this.timeout}ms`);
          finish(false, 'connection_timeout');
        }
      }, this.timeout);

      this.socket.setTimeout(this.timeout, () => {
        if (!this.resolved) {
          this.debug(`Socket timeout after ${this.timeout}ms`);
          finish(false, 'socket_timeout');
        }
      });

      // Enhanced error handling
      this.socket.on('error', (error) => {
        this.debug(`Socket error: ${error.message}`);
        this.onError(error);
        if (!this.resolved) finish(false, 'connection_error');
      });

      this.socket.on('close', () => {
        if (!this.resolved) {
          this.debug('Socket closed unexpectedly');
          this.onClose();
          finish(false, 'connection_closed');
        }
      });

      // Start processing if we have a sequence
      if (this.sequence.steps.length > 0) {
        this.currentStepIndex = 0;
        const firstStep = this.sequence.steps[0];
        if (firstStep !== Step.GREETING) {
          // If sequence doesn't start with GREETING, start with the specified step
          this.executeStep(firstStep);
        }
      } else {
        // Empty sequence - consider it complete
        finish(true, 'sequence_complete');
      }
    });
  }

  /**
   * Verify an email address using the current connection
   */
  public async verifyEmail(params: SMTPVerifyParams): Promise<SMTPVerifyResult> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to SMTP server');
    }

    return new Promise((resolve) => {
      this.resolved = false;
      this.currentStepIndex = 0;
      this.verifyParams = params;

      // Override sequence with email verification specific steps
      const verifySequence: SMTPSequence = {
        steps: [Step.GREETING, Step.EHLO, Step.MAIL_FROM, Step.RCPT_TO],
        from: params.from,
        vrfyTarget: params.vrfyTarget,
      };

      // For port 25, use HELO instead of EHLO
      if (this.port === 25) {
        verifySequence.steps = verifySequence.steps.map((step) => (step === Step.EHLO ? Step.HELO : step));
      }

      this.sequence = verifySequence;

      const cleanup = () => {
        if (this.resolved) return;
        this.resolved = true;
        this.clearTimeouts();
        try {
          this.socket?.write('QUIT\r\n');
        } catch {}
        setTimeout(() => this.destroy(), 100);
      };

      const finish = (result: SMTPVerifyResult) => {
        if (this.resolved) return;
        this.debug(`${this.port}: ${result.reason || (result.success ? 'valid' : 'invalid')}`);
        cleanup();
        resolve(result);
      };

      // Override the processResponse method for this verification
      const originalProcessResponse = this.processResponse.bind(this);
      const customProcessResponse = (response: string) => {
        const result = originalProcessResponse(response);
        if (result) {
          finish(result);
        }
      };

      // Override dataHandler to use custom processResponse
      this.dataHandler = (data: Buffer) => {
        if (this.resolved) return;

        this.resetActivityTimeout(); // Reset timeout on each data receipt
        this.buffer += data.toString();

        let pos: number;
        while ((pos = this.buffer.indexOf('\r\n')) !== -1) {
          const line = this.buffer.substring(0, pos);
          this.buffer = this.buffer.substring(pos + 2);
          customProcessResponse(line.trim());
          this.onMessage(line.trim());
        }
      };

      // Update socket to use new data handler
      if (this.socket) {
        this.socket.removeAllListeners('data');
        this.socket.on('data', this.dataHandler);
      }

      // Start verification
      if (this.sequence.steps.length > 0) {
        const firstStep = this.sequence.steps[0];
        if (firstStep !== Step.GREETING) {
          this.executeStep(firstStep);
        }
      } else {
        // Empty sequence - consider verification successful immediately
        finish({ success: true, reason: 'sequence_complete' });
        return;
      }

      // Set activity timeout
      this.resetActivityTimeout();
    });
  }

  private setupSocket(): void {
    if (!this.socket) return;

    this.connected = true;
    this.buffer = '';
    this.socket.on('data', this.dataHandler);
  }

  private defaultHandleData(data: Buffer): void {
    if (this.resolved) return;

    this.resetActivityTimeout(); // Reset timeout on each data receipt
    this.buffer += data.toString();

    let pos: number;
    while ((pos = this.buffer.indexOf('\r\n')) !== -1) {
      const line = this.buffer.substring(0, pos);
      this.buffer = this.buffer.substring(pos + 2);
      this.processResponse(line.trim());
      this.onMessage(line.trim());
    }
  }

  private processResponse(response: string): SMTPVerifyResult | null {
    if (this.resolved) return null;

    const code = response.substring(0, 3);
    const isMultiline = response.length > 3 && response[3] === '-';
    this.debug(`← ${response}`);

    // Handle multiline greetings properly
    if (isMultilineGreet(response)) {
      return null;
    }

    // Apply original logic for over quota and invalid mailbox errors
    if (isOverQuota(response)) {
      return { success: false, reason: 'over_quota' };
    }

    if (isInvalidMailboxError(response)) {
      return { success: false, reason: 'not_found' };
    }

    // Skip multiline continuation for EHLO responses
    if (isMultiline) {
      const currentStep = this.sequence.steps[this.currentStepIndex];
      if (currentStep === Step.EHLO && code === '250') {
        const upper = response.toUpperCase();
        if (upper.includes('STARTTLS')) this.supportsSTARTTLS = true;
        if (upper.includes('VRFY')) this.supportsVRFY = true;
      }
      if (currentStep === Step.HELO && code === '250') {
        const upper = response.toUpperCase();
        if (upper.includes('VRFY')) this.supportsVRFY = true;
      }
      return null;
    }

    // Check for recognized responses
    if (
      !response.includes('220') &&
      !response.includes('250') &&
      !response.includes('550') &&
      !response.includes('552')
    ) {
      return { success: false, reason: 'unrecognized_response' };
    }

    const currentStep = this.sequence.steps[this.currentStepIndex];

    // Process response based on current step
    switch (currentStep) {
      case Step.GREETING:
        if (code.startsWith('220')) {
          this.nextStep();
        } else {
          return { success: false, reason: 'no_greeting' };
        }
        break;

      case Step.EHLO:
        if (code.startsWith('250')) {
          // Check if we need STARTTLS
          const hasSTARTTLS = this.sequence.steps.includes(Step.STARTTLS);
          const useTLS = this.tls !== false;
          if (!this.isTLS && useTLS && this.supportsSTARTTLS && this.port !== 465 && hasSTARTTLS) {
            // Jump to STARTTLS step
            this.currentStepIndex = this.sequence.steps.indexOf(Step.STARTTLS);
            this.executeStep(Step.STARTTLS);
          } else {
            this.nextStep();
          }
        } else {
          return { success: false, reason: 'ehlo_failed' };
        }
        break;

      case Step.HELO:
        if (code.startsWith('250')) {
          this.nextStep();
        } else {
          return { success: false, reason: 'helo_failed' };
        }
        break;

      case Step.STARTTLS:
        if (code.startsWith('220')) {
          // Upgrade to TLS
          this.upgradeToTLS();
        } else {
          // STARTTLS failed, continue to next step
          this.nextStep();
        }
        break;

      case Step.MAIL_FROM:
        if (code.startsWith('250')) {
          this.nextStep();
        } else {
          return { success: false, reason: 'mail_from_rejected' };
        }
        break;

      case Step.RCPT_TO:
        if (code.startsWith('250') || code.startsWith('251')) {
          return { success: true, reason: 'valid' };
        } else if (code.startsWith('552') || code.startsWith('452')) {
          return { success: false, reason: 'over_quota' };
        } else if (code.startsWith('4')) {
          return { success: false, reason: 'temporary_failure' };
        } else if (
          this.useVRFY &&
          this.supportsVRFY &&
          code.startsWith('5') &&
          this.sequence.steps.includes(Step.VRFY)
        ) {
          // Jump to VRFY step
          this.currentStepIndex = this.sequence.steps.indexOf(Step.VRFY);
          this.executeStep(Step.VRFY);
        } else {
          return { success: false, reason: 'ambiguous' };
        }
        break;

      case Step.VRFY:
        if (code.startsWith('250') || code.startsWith('252')) {
          return { success: true, reason: 'vrfy_valid' };
        } else if (code.startsWith('550')) {
          return { success: false, reason: 'vrfy_invalid' };
        } else {
          return { success: false, reason: 'vrfy_failed' };
        }
      //break;

      case Step.QUIT:
        if (code.startsWith('221')) {
          return { success: false, reason: 'quit_received' };
        }
        break;
    }

    return null;
  }

  private executeStep(step: SMTPStep): void {
    if (this.resolved || !this.socket) return;

    switch (step) {
      case Step.EHLO:
        this.sendCommand(`EHLO ${this.hostname}`);
        break;
      case Step.HELO:
        this.sendCommand(`HELO ${this.hostname}`);
        break;
      case Step.GREETING:
        // No command to send, wait for server greeting
        break;
      case Step.STARTTLS:
        this.sendCommand('STARTTLS');
        break;
      case Step.MAIL_FROM: {
        const from = this.sequence.from || '<>';
        this.sendCommand(`MAIL FROM:${from}`);
        break;
      }
      case Step.RCPT_TO:
        if (this.verifyParams) {
          this.sendCommand(`RCPT TO:<${this.verifyParams.local}@${this.verifyParams.domain}>`);
        }
        break;
      case Step.VRFY: {
        const vrfyTarget = this.verifyParams?.vrfyTarget || this.sequence.vrfyTarget || this.verifyParams?.local || '';
        this.sendCommand(`VRFY ${vrfyTarget}`);
        break;
      }
      case Step.QUIT:
        this.sendCommand('QUIT');
        break;
    }
  }

  private sendCommand(cmd: string): void {
    if (this.resolved || !this.socket) return;
    this.debug(`→ ${cmd}`);
    this.socket.write(`${cmd}\r\n`);
  }

  private nextStep(): void {
    this.currentStepIndex++;
    if (this.currentStepIndex >= this.sequence.steps.length) {
      // Sequence completed successfully
      return;
    }
    this.executeStep(this.sequence.steps[this.currentStepIndex]);
  }

  private upgradeToTLS(): void {
    if (!this.socket) return;

    const plainSocket = this.socket as net.Socket;
    const tlsOptions: tls.ConnectionOptions = {
      host: this.host,
      servername: isIPAddress(this.host) ? undefined : this.host,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      socket: plainSocket,
      ...(typeof this.tls === 'object' ? this.tls : {}),
    };

    this.socket = tls.connect(tlsOptions, () => {
      this.isTLS = true;
      this.debug('TLS upgraded');
      this.buffer = '';
      // Continue with next step after STARTTLS
      const starttlsIndex = this.sequence.steps.indexOf(Step.STARTTLS);
      this.currentStepIndex = starttlsIndex;
      this.nextStep();
    });

    this.socket.on('data', this.dataHandler);
    this.socket.on('error', () => {
      // Error handled in main connection logic
    });
  }

  private resetActivityTimeout(): void {
    this.lastActivityTime = Date.now();
    if (this.stepTimeout) {
      clearTimeout(this.stepTimeout);
    }
    this.stepTimeout = setTimeout(() => {
      if (!this.resolved) {
        this.debug(`Step timeout after ${this.timeout}ms of inactivity`);
        // This will be handled by the calling method
      }
    }, this.timeout);
  }

  private clearTimeouts(): void {
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    if (this.stepTimeout) clearTimeout(this.stepTimeout);
    if (this.socket) this.socket.setTimeout(0);
  }

  /**
   * Send a command to the SMTP server
   */
  public send(data: string): void {
    if (!this.connected || !this.socket) {
      this.debug('Not connected - cannot send data');
      return;
    }
    this.sendCommand(data);
  }

  /**
   * Gracefully close the connection
   */
  public close(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Force destroy the socket
   */
  public destroy(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Check current connection state
   */
  public isConnected(): boolean {
    return this.connected;
  }
}
