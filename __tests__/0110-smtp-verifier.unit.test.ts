import { EventEmitter } from 'node:events';
import net, { type Socket } from 'node:net';
import tls from 'node:tls';
import { clearDefaultCache, getDefaultCache, SMTPStep } from '../src';
import { verifyMailboxSMTP } from '../src/smtp-verifier';

type Scenario = {
  greeting?: string | null;
  greetingByPort?: Record<number, string | null>;
  connectError?: Error;
  connectErrorByPort?: Record<number, Error>;
  unresponsivePorts?: number[];
  ehloLines?: string[];
  heloLines?: string[];
  rcptResponse?: string;
  rcptByPort?: Record<number, string>;
  vrfyResponse?: string;
  startTlsResponse?: string;
};

class FakeSocket extends EventEmitter {
  destroyed = false;
  private timeoutHandler?: () => void;

  constructor(
    public readonly port: number,
    private readonly onCommand: (command: string, socket: FakeSocket) => void
  ) {
    super();
  }

  write(data: string | Buffer): boolean {
    const command = String(data).trim();
    if (command.length > 0) {
      this.onCommand(command, this);
    }
    return true;
  }

  end(): this {
    this.destroyed = true;
    this.emit('close');
    return this;
  }

  destroy(): this {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit('close');
    }
    return this;
  }

  setTimeout(_timeout: number, callback?: () => void): this {
    if (callback) {
      this.timeoutHandler = callback;
    }
    return this;
  }

  triggerSocketTimeout(): void {
    this.timeoutHandler?.();
  }

  emitResponse(response: string): void {
    const payload = response.endsWith('\r\n') ? response : `${response}\r\n`;
    queueMicrotask(() => this.emit('data', Buffer.from(payload)));
  }

  emitResponses(lines: string[]): void {
    const payload = `${lines.join('\r\n')}\r\n`;
    queueMicrotask(() => this.emit('data', Buffer.from(payload)));
  }
}

function installSmtpMocks(scenario: Scenario = {}) {
  const commands: string[] = [];
  const sockets: FakeSocket[] = [];

  const defaultEhlo = ['250-test.mock Hello', '250-STARTTLS', '250-VRFY', '250 OK'];
  const defaultHelo = ['250 test.mock Hello'];

  const handleCommand = (socket: FakeSocket, command: string) => {
    const upper = command.toUpperCase();
    const unresponsive = scenario.unresponsivePorts?.includes(socket.port);
    if (unresponsive) return;

    if (upper.startsWith('EHLO')) {
      socket.emitResponses(scenario.ehloLines || defaultEhlo);
      return;
    }
    if (upper.startsWith('HELO')) {
      socket.emitResponses(scenario.heloLines || defaultHelo);
      return;
    }
    if (upper.startsWith('STARTTLS')) {
      socket.emitResponse(scenario.startTlsResponse || '220 Ready to start TLS');
      return;
    }
    if (upper.startsWith('MAIL FROM')) {
      socket.emitResponse('250 MAIL FROM OK');
      return;
    }
    if (upper.startsWith('RCPT TO')) {
      const rcpt = scenario.rcptByPort?.[socket.port] || scenario.rcptResponse || '250 RCPT OK';
      socket.emitResponse(rcpt);
      return;
    }
    if (upper.startsWith('VRFY')) {
      socket.emitResponse(scenario.vrfyResponse || '252 Cannot VRFY user but will accept message');
      return;
    }
    if (upper.startsWith('QUIT')) {
      socket.emitResponse('221 Bye');
    }
  };

  const netSpy = jest.spyOn(net, 'connect').mockImplementation((opts: any, cb?: () => void) => {
    const port = Number(opts?.port || 25);
    const socket = new FakeSocket(port, (command, instance) => {
      commands.push(`${port}:${command}`);
      handleCommand(instance, command);
    });
    sockets.push(socket);

    const error = scenario.connectErrorByPort?.[port] || scenario.connectError;
    if (error) {
      queueMicrotask(() => socket.emit('error', error));
      return socket as unknown as Socket;
    }

    queueMicrotask(() => {
      cb?.();
      const greeting =
        scenario.greetingByPort?.[port] ??
        (scenario.greeting === undefined ? '220 test.mock ESMTP' : scenario.greeting);
      if (greeting) {
        socket.emitResponse(greeting);
      }
    });

    return socket as unknown as Socket;
  });

  const tlsSpy = jest.spyOn(tls, 'connect').mockImplementation((arg1: any, arg2?: any, arg3?: any) => {
    const callback = typeof arg2 === 'function' ? arg2 : typeof arg3 === 'function' ? arg3 : undefined;
    const existing = arg1 && typeof arg1 === 'object' ? (arg1.socket as FakeSocket | undefined) : undefined;

    if (existing) {
      queueMicrotask(() => callback?.());
      return existing as any;
    }

    const port = Number(arg1?.port || 465);
    const socket = new FakeSocket(port, (command, instance) => {
      commands.push(`${port}:${command}`);
      handleCommand(instance, command);
    });
    sockets.push(socket);

    queueMicrotask(() => {
      callback?.();
      const greeting =
        scenario.greetingByPort?.[port] ??
        (scenario.greeting === undefined ? '220 test.mock ESMTP TLS' : scenario.greeting);
      if (greeting) {
        socket.emitResponse(greeting);
      }
    });

    return socket as any;
  });

  return {
    commands,
    sockets,
    restore: () => {
      netSpy.mockRestore();
      tlsSpy.mockRestore();
    },
  };
}

describe('0110 SMTP Verifier Unit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearDefaultCache();
  });

  it('returns deliverable for successful default SMTP dialogue', async () => {
    installSmtpMocks();

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { timeout: 50, debug: false },
    });

    expect(port).toBe(25);
    expect(smtpResult.isDeliverable).toBe(true);
    expect(smtpResult.canConnectSmtp).toBe(true);
  });

  it('returns failure when MX records are missing', async () => {
    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: [],
      options: { timeout: 50 },
    });

    expect(port).toBe(0);
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toContain('No MX records found');
  });

  it('returns not deliverable when RCPT reports mailbox not found', async () => {
    installSmtpMocks({
      rcptResponse: '550 5.1.1 User unknown',
    });

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { timeout: 50, ports: [587] },
    });

    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('not_found');
  });

  it('treats provider anti-abuse lockout responses as deliverable', async () => {
    installSmtpMocks({
      rcptResponse:
        '550 5.7.1 [IRR] Our system has detected unusual activity from your account. Contact your service provider for support',
    });

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { timeout: 50, ports: [587] },
    });

    expect(smtpResult.isDeliverable).toBe(true);
  });

  it('falls back to next port when first port is unresponsive', async () => {
    installSmtpMocks({
      unresponsivePorts: [25],
      rcptByPort: {
        587: '250 RCPT OK',
      },
    });

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [25, 587],
        timeout: 25,
        maxRetries: 0,
      },
    });

    expect(port).toBe(587);
    expect(smtpResult.isDeliverable).toBe(true);
  });

  it('uses cached SMTP port for same MX host with a different mailbox', async () => {
    installSmtpMocks({
      rcptByPort: {
        25: '500 not accepted',
        587: '250 RCPT OK',
      },
    });
    const cache = getDefaultCache();

    const first = await verifyMailboxSMTP({
      local: 'first',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], timeout: 40, maxRetries: 0, cache },
    });
    expect(first.port).toBe(587);
    expect(first.portCached).toBe(false);

    const second = await verifyMailboxSMTP({
      local: 'second',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], timeout: 40, maxRetries: 0, cache },
    });

    expect(second.port).toBe(587);
    expect(second.portCached).toBe(true);
    expect(second.smtpResult.isDeliverable).toBe(true);
  });

  it('switches EHLO to HELO for port 25 without mutating caller sequence', async () => {
    const mock = installSmtpMocks();
    const sequence = {
      steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
    };

    await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 40, sequence },
    });

    expect(mock.commands.some((line) => line.includes('HELO example.com'))).toBe(true);
    expect(sequence.steps).toEqual([SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo]);
    mock.restore();
  });

  it('supports explicit VRFY step in custom sequence', async () => {
    const mock = installSmtpMocks({
      vrfyResponse: '250 2.1.5 User OK',
    });

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [587],
        timeout: 50,
        useVRFY: true,
        sequence: {
          steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.vrfy],
        },
      },
    });

    expect(mock.commands.some((line) => line.includes('VRFY john'))).toBe(true);
    expect(smtpResult.isDeliverable).toBe(true);
    mock.restore();
  });

  it('returns failure when connection fails across all ports', async () => {
    installSmtpMocks({
      connectError: new Error('connect ECONNREFUSED'),
    });

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [25, 587],
        timeout: 40,
        maxRetries: 0,
      },
    });

    expect(port).toBe(0);
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toContain('All SMTP connection attempts failed');
  });
});
