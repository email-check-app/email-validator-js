// 0032: Socket Mock Tests (Jest-based)
//
// Tests for SMTP with mocked socket connections using Jest mocking
//
// This version uses Jest's built-in mocking instead of Sinon for simpler, more
// maintainable tests. The mock socket extends EventEmitter to properly simulate
// the asynchronous behavior of real socket connections.

import { promises as dnsPromises } from 'node:dns';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import expect from 'expect';
import { clearDefaultCache, verifyEmail } from '../src';
import { resolveMxRecords } from '../src/dns';

/**
 * Creates a mock SMTP socket factory with configurable responses
 *
 * ★ Insight ─────────────────────────────────────
 * 1. Factory pattern prevents shared state between tests
 * 2. EventEmitter is cleaner than PassThrough for this use case
 * 3. Each test gets fresh, isolated mock socket instance
 * ─────────────────────────────────────────────────
 */
function createMockSmtpSocketFactory(
  options: { greeting?: string; responses?: Map<string, string>; errorAfter?: string } = {}
) {
  const { greeting = '220 test.example.com ESMTP\r\n', responses, errorAfter } = options;
  let connectCallback: (() => void) | null = null;
  let currentMockSocket: MockSmtpSocket | null = null;

  const defaultResponses = new Map<string, string>([
    ['EHLO', '250 OK\r\n'],
    ['HELO', '250 OK\r\n'],
    ['MAIL FROM', '250 OK\r\n'],
    ['RCPT TO', '250 OK\r\n'],
    ['STARTTLS', '220 Ready for TLS\r\n'],
  ]);

  if (responses) {
    for (const [cmd, resp] of responses.entries()) {
      defaultResponses.set(cmd, resp);
    }
  }

  /**
   * Mock SMTP socket extending EventEmitter
   *
   * The key insight is that we only process commands when they're written,
   * not when we emit responses. This prevents infinite loops.
   */
  class MockSmtpSocket extends EventEmitter {
    destroyed = false;
    writable = true;
    readable = true;
    remoteAddress = '127.0.0.1';
    remotePort = 25;

    // Track write calls for assertions
    writeCalls: string[] = [];
    private writeCount = 0;
    private buffer = '';

    constructor() {
      super();
    }

    // Override write to track calls and send responses
    write = jest.fn((data: string | Buffer): boolean => {
      const dataStr = data.toString();
      this.writeCalls.push(dataStr);
      this.writeCount++;

      console.log('[MockSocket] write called:', dataStr.trim());
      console.log('[MockSocket] Total writes so far:', this.writeCount);

      // Don't respond to QUIT
      if (dataStr.includes('QUIT')) {
        console.log('[MockSocket] QUIT detected, not responding');
        return true;
      }

      // Check for RCPT TO
      if (dataStr.includes('RCPT TO')) {
        console.log('[MockSocket] RCPT TO was sent!');
      }

      // Check if we should emit error
      if (errorAfter && this.writeCount >= parseInt(errorAfter, 10)) {
        setImmediate(() => {
          if (!this.destroyed) {
            this.destroyed = true;
            this.emit('error', new Error('Connection failed'));
            this.emit('close');
          }
        });
        return true;
      }

      // Process commands and respond after delay
      setTimeout(() => {
        if (this.destroyed) return;

        // Build command from buffer (SMTP sends line by line)
        this.buffer += dataStr;

        // Process complete lines
        const lines = this.buffer.split('\r\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          console.log('[MockSocket] Processing command:', line);

          // Find matching response using startsWith for precise detection
          for (const [cmd, response] of defaultResponses.entries()) {
            if (line.startsWith(cmd)) {
              console.log('[MockSocket] Responding to', cmd, ':', response.trim());
              this.emit('data', response);
              return;
            }
          }

          // Default response
          console.log('[MockSocket] Sending default 250 OK');
          this.emit('data', '250 OK\r\n');
        }
      }, 5);

      return true;
    });

    end = jest.fn(() => {
      this.writable = false;
    });

    destroy = jest.fn(() => {
      if (this.destroyed) return;
      this.destroyed = true;
      this.writable = false;
      this.readable = false;
      this.emit('close');
    });

    setTimeout = jest.fn((msecs: number, callback?: () => void) => {
      if (callback) setTimeout(callback, msecs);
      return this;
    });

    setEncoding = jest.fn(() => this);
    setKeepAlive = jest.fn(() => this);
    ref = jest.fn(() => this);
    unref = jest.fn(() => this);
    removeAllListeners = jest.fn((event?: string) => {
      if (event) {
        super.removeAllListeners(event);
      } else {
        super.removeAllListeners();
      }
      return this;
    });
  }

  const mockConnect = jest.fn((options: any, callback?: () => void) => {
    connectCallback = callback || null;
    const socket = new MockSmtpSocket();
    currentMockSocket = socket;

    // Real net.connect invokes callback synchronously
    // But we use setImmediate to ensure socket is ready
    if (connectCallback) {
      setImmediate(() => {
        try {
          // Emit connect event first
          socket.emit('connect');

          // Then invoke callback (calls setupSocket which registers data handler)
          connectCallback!();

          // Finally send greeting after data handler is ready
          setTimeout(() => {
            if (!socket.destroyed) {
              console.log('[MockSocket] Sending greeting');
              socket.emit('data', greeting);
            }
          }, 10);
        } catch (e) {
          console.error('[MockSocket] Error:', e);
        }
      });
    }

    return socket;
  });

  return {
    mockConnect,
    getCurrentMockSocket: () => currentMockSocket,
  };
}

// Mock net module
jest.mock('node:net', () => {
  const actualNet = jest.requireActual('node:net');

  return {
    ...actualNet,
    connect: jest.fn(),
  };
});

const net = require('node:net');

describe('0032: Socket Mock Tests (Jest)', () => {
  beforeEach(() => {
    clearDefaultCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearDefaultCache();
  });

  describe('SMTP Protocol Flow', () => {
    it('should perform all verification steps successfully', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.bar.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory();
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
        smtpPort: 587,
      } as any);

      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
      expect(result.validSmtp).toBe(true);
      expect(net.connect).toHaveBeenCalled();
    });

    it('returns immediately if email is malformed invalid', async () => {
      const result = await verifyEmail({ emailAddress: 'bar.com' });
      expect(result.validFormat).toBe(false);
      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
    });

    it('should return a list of mx records, ordered by priority', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx2.foo.com', priority: 20 },
        { exchange: 'mx1.foo.com', priority: 10 },
        { exchange: 'mx3.foo.com', priority: 30 },
      ]);

      const records = await resolveMxRecords({ domain: 'bar@foo.com' });
      expect(records).toEqual(['mx1.foo.com', 'mx2.foo.com', 'mx3.foo.com']);
    });
  });

  describe('Mailbox Verification', () => {
    it('returns true when mailbox exists', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory();
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
        debug: true, // Enable debug output
      } as any);

      expect(result.validSmtp).toBe(true);
    });

    it('returns false on over quota check', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory({
        responses: new Map([['RCPT TO', '452-4.2.2 The email account that you tried to reach is over quota\r\n']]),
      });
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(false);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
    });

    it('returns null on socket error', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory();
      (net.connect as jest.Mock).mockImplementation((options: any, callback?: () => void) => {
        const socket = mockConnect(options, callback);
        // Immediately emit error to simulate connection failure
        const error = new Error('Connection refused');
        (error as any).code = 'ECONNREFUSED';
        setImmediate(() => {
          socket.emit('error', error);
        });
        return socket;
      });

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(null);
      expect(result.validMx).toBe(true);
      expect(result.validFormat).toBe(true);
    });

    it('regression: does not write infinitely if there is a socket error', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect, getCurrentMockSocket } = createMockSmtpSocketFactory();
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      setImmediate(() => {
        const socket = getCurrentMockSocket();
        if (socket) {
          socket.destroyed = true;
          const error = new Error('Connection failed');
          (error as any).code = 'ECONNREFUSED';
          socket.emit('error', error);
        }
      });

      await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      const socket = getCurrentMockSocket();
      if (socket) {
        expect(socket.write.mock.calls.length).toBeLessThan(10);
      }
    });

    it('should return null on unknown SMTP errors', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory({
        responses: new Map([['RCPT TO', '500 Unknown Error\r\n']]),
      });
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(null);
    });

    it('returns false on bad mailbox errors', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory({
        responses: new Map([['RCPT TO', '550 User unknown\r\n']]),
      });
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(false);
    });

    it('returns null on spam errors', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const { mockConnect } = createMockSmtpSocketFactory({
        responses: new Map([['RCPT TO', '550 JunkMail rejected\r\n']]),
      });
      (net.connect as jest.Mock).mockImplementation(mockConnect);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(null);
    });
  });

  describe('MX Record Edge Cases', () => {
    it('given no mx records, should return false on the domain verification', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([]);

      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
      });

      expect(result.validMx).toBe(false);
      expect(result.validSmtp).toBe(null);
    });
  });

  describe('Verification Options', () => {
    it('given a verifySmtp option false, should not check via socket', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.bar.com', priority: 10 }]);

      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifySmtp: false,
        verifyMx: true,
      });

      expect(result.validSmtp).toBe(null);
      expect(result.validMx).toBe(true);
      expect(net.connect).not.toHaveBeenCalled();
    });

    it('given a verifyMx option false, should not check via socket', async () => {
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
      expect(net.connect).not.toHaveBeenCalled();
    });
  });
});
