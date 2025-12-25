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

// Store the connection callback to invoke it later
let connectCallback: (() => void) | null = null;

// The mock socket that will be returned by net.connect
let mockSmtpSocket: MockSmtpSocket | null = null;

// Mock net module
jest.mock('node:net', () => {
  const EventEmitter = require('node:events');
  const actualNet = jest.requireActual('node:net');

  return {
    ...actualNet,
    connect: jest.fn((options: any, callback?: () => void) => {
      // Store the callback to invoke it later
      connectCallback = callback || null;

      // Get the mock socket (if set)
      const socket = mockSmtpSocket || new EventEmitter();

      // IMPORTANT: Real net.connect invokes the callback synchronously when successful
      // But we need to ensure the socket is ready before invoking
      if (connectCallback) {
        // Invoke callback on next tick to ensure proper setup
        setImmediate(() => {
          try {
            connectCallback();
            // After callback (which calls setupSocket), send greeting
            if (mockSmtpSocket) {
              setTimeout(() => {
                mockSmtpSocket.sendGreeting(5);
              }, 10);
            }
          } catch (e) {
            // Ignore errors during callback
          }
        });
      }

      return socket;
    }),
  };
});

const net = require('node:net');

// Helper to create a mock SMTP socket that responds to commands
class MockSmtpSocket extends EventEmitter {
  destroyed = false;
  writable = true;
  readable = true;
  remoteAddress?: string;
  remotePort?: number;

  // Track write calls for debugging
  writeCalls: string[] = [];
  private responses: Map<string, string> = new Map();

  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.remotePort = 25;

    // Set up default responses for SMTP commands
    this.responses.set('EHLO', '250 OK\r\n');
    this.responses.set('HELO', '250 OK\r\n');
    this.responses.set('MAIL FROM', '250 OK\r\n');
    this.responses.set('RCPT TO', '250 OK\r\n');
    this.responses.set('STARTTLS', '220 Ready for TLS\r\n');
  }

  // Override write to track calls
  write = jest.fn((data: string | Buffer): boolean => {
    const dataStr = data.toString();
    this.writeCalls.push(dataStr);

    console.log('[MockSocket] write called:', dataStr.trim());

    // Don't respond to QUIT
    if (dataStr.includes('QUIT')) {
      return true;
    }

    // Emit appropriate response based on the command
    setTimeout(() => {
      if (!this.destroyed) {
        // Find matching response
        for (const [cmd, response] of this.responses.entries()) {
          if (dataStr.includes(cmd)) {
            console.log('[MockSocket] Emitting response for', cmd, ':', response.trim());
            this.emit('data', response);
            return;
          }
        }
        // Default response
        console.log('[MockSocket] Emitting default response');
        this.emit('data', '250 OK\r\n');
      }
    }, 5);

    return true;
  });

  end = jest.fn(() => {
    this.writable = false;
  });

  destroy = jest.fn(() => {
    this.destroyed = true;
    this.emit('close');
  });

  setTimeout = jest.fn((msecs: number, callback?: () => void) => {
    if (callback) {
      setTimeout(callback, msecs);
    }
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

  // Helper method to set custom response for a command
  setResponse(command: string, response: string): void {
    this.responses.set(command, response);
  }

  // Helper to simulate server greeting
  sendGreeting(delay = 10): void {
    setTimeout(() => {
      if (!this.destroyed) {
        console.log('[MockSocket] Sending greeting');
        this.emit('data', '220 test.example.com ESMTP\r\n');
      }
    }, delay);
  }

  // Helper to simulate connection established
  connect(): void {
    console.log('[MockSocket] connect() called, connectCallback:', !!connectCallback);
    setImmediate(() => {
      console.log('[MockSocket] Emitting connect event, connectCallback:', !!connectCallback);
      this.emit('connect');
      // Invoke the connection callback FIRST (before greeting)
      // This triggers setupSocket() in the SMTP client which registers the data handler
      if (connectCallback) {
        console.log('[MockSocket] Invoking connection callback');
        connectCallback();
        // Don't clear yet - might be needed for other tests
        // connectCallback = null;
      } else {
        console.log('[MockSocket] WARNING: connectCallback is null!');
      }
      // Then send greeting after data handler is registered
      this.sendGreeting(5);
    });
  }
}

describe('0032: Socket Mock Tests (Jest)', () => {
  beforeEach(() => {
    clearDefaultCache();
    jest.clearAllMocks();
    connectCallback = null; // Reset connection callback
    mockSmtpSocket = null; // Reset mock socket
  });

  afterEach(() => {
    clearDefaultCache();
    connectCallback = null;
    mockSmtpSocket = null;
  });

  describe('SMTP Protocol Flow', () => {
    it('should perform all verification steps successfully', async () => {
      // Mock MX records
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.bar.com', priority: 10 }]);

      // Create and set mock socket - will automatically handle connection
      const mockSocket = new MockSmtpSocket();
      mockSmtpSocket = mockSocket;

      // Run verification - mock will simulate connection automatically
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
        smtpPort: 587, // Use single port to avoid multiple connection attempts
      } as any);

      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
      expect(result.validSmtp).toBe(true);

      // Verify SMTP commands were sent
      const commands = mockSocket.writeCalls.map((c) => c.toString());
      expect(commands.some((c) => c.includes('EHLO') || c.includes('HELO'))).toBe(true);
      expect(commands.some((c) => c.includes('MAIL FROM'))).toBe(true);
      expect(commands.some((c) => c.includes('RCPT TO'))).toBe(true);
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

      const mockSocket = new MockSmtpSocket();
      mockSmtpSocket = mockSocket;

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(result.validSmtp).toBe(true);
    });

    it('returns false on over quota check', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const mockSocket = new MockSmtpSocket();
      mockSocket.setResponse('RCPT TO', '452-4.2.2 The email account that you tried to reach is over quota\r\n');
      mockSmtpSocket = mockSocket;

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

      const mockSocket = new MockSmtpSocket();
      mockSmtpSocket = mockSocket;

      // Set up to emit error immediately after connection
      setImmediate(() => {
        mockSocket.destroyed = true;
        mockSocket.emit('error', new Error('Connection failed'));
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

      const mockSocket = new MockSmtpSocket();
      mockSmtpSocket = mockSocket;

      // Set up to emit error immediately
      setImmediate(() => {
        mockSocket.destroyed = true;
        mockSocket.emit('error', new Error('Connection failed'));
      });

      await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        smtpPort: 587,
      } as any);

      expect(mockSocket.write.mock.calls.length).toBeLessThan(10);
      expect(mockSocket.end.mock.calls.length).toBeLessThan(5);
    });

    it('should return null on unknown SMTP errors', async () => {
      jest.spyOn(dnsPromises, 'resolveMx').mockResolvedValue([{ exchange: 'mx1.foo.com', priority: 10 }]);

      const mockSocket = new MockSmtpSocket();
      mockSocket.setResponse('RCPT TO', '500 Unknown Error\r\n');
      mockSmtpSocket = mockSocket;

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

      const mockSocket = new MockSmtpSocket();
      mockSocket.setResponse('RCPT TO', '550 User unknown\r\n');
      mockSmtpSocket = mockSocket;

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

      const mockSocket = new MockSmtpSocket();
      mockSocket.setResponse('RCPT TO', '550-"JunkMail rejected\r\n');
      mockSmtpSocket = mockSocket;

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
      // net.connect should not be called
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
