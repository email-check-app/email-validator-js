// 0032: Socket Mock Tests
//
// Tests for SMTP client with mocked socket connections
// Focus: Ensuring code executes correctly based on socket responses

import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import { verifyMailboxSMTP } from '../src/smtp';
import { SMTPStep } from '../src/types';

// Debug flag - set to true to see detailed logs
const DEBUG = true;

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log('[SMTP-DEBUG]', ...args);
  }
}

// MockSmtpSocket class - defined outside jest.mock for type accessibility
class MockSmtpSocket extends EventEmitter {
  destroyed = false;
  connecting = false;
  remoteAddress = '127.0.0.1';
  remotePort = 25;
  writable = true;
  readable = true;
  localPort = 12345;
  localAddress = '127.0.0.1';

  // Track all write calls
  writes: string[] = [];

  // Event queue to simulate async responses
  private responseQueue: string[] = [];

  // Store timeout callback to actually trigger it
  private timeoutCallback?: () => void;
  private timeoutTimer?: NodeJS.Timeout;

  constructor() {
    super();
    debugLog('MockSmtpSocket created');
  }

  write(data: string | Buffer, callback?: () => void): boolean {
    const dataStr = Buffer.isBuffer(data) ? data.toString() : data;
    this.writes.push(dataStr);
    debugLog('Socket.write:', dataStr.trim());
    if (callback) callback();
    return true;
  }

  end(data?: string | Buffer, callback?: () => void): this {
    debugLog('Socket.end called');
    if (data) {
      const dataStr = Buffer.isBuffer(data) ? data.toString() : data;
      this.writes.push(dataStr);
    }
    if (callback) callback();
    return this;
  }

  destroy(): void {
    debugLog('Socket.destroy called');
    this.destroyed = true;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }
    this.removeAllListeners();
  }

  setTimeout(timeout: number, callback?: () => void): void {
    debugLog('Socket.setTimeout:', timeout);
    if (callback) {
      this.timeoutCallback = callback;
      // Actually trigger the timeout after the specified time
      this.timeoutTimer = setTimeout(() => {
        if (!this.destroyed) {
          debugLog('Socket timeout callback firing');
          callback();
        }
      }, timeout);
    }
  }

  removeAllListeners(event?: string): this {
    debugLog('Socket.removeAllListeners', event || 'all');
    if (event) {
      super.removeAllListeners(event);
    } else {
      super.removeAllListeners();
    }
    return this;
  }

  // Queue a response to be emitted later
  queueResponse(response: string): void {
    this.responseQueue.push(response);
    debugLog('Queued response:', response.trim());
  }

  // Emit all queued responses with a delay
  emitQueuedResponses(): void {
    debugLog('Emitting', this.responseQueue.length, 'queued responses');
    let delay = 0;
    for (const response of this.responseQueue) {
      setTimeout(() => {
        debugLog('Emitting data:', response.trim());
        this.emit('data', response);
      }, delay);
      delay += 10; // Small delay between responses
    }
    this.responseQueue = [];
  }

  // Get all writes as strings
  getWrites(): string[] {
    return this.writes;
  }

  // Get last write
  getLastWrite(): string | undefined {
    return this.writes[this.writes.length - 1];
  }
}

// Manual mock of 'node:net' - Jest will hoist this
jest.mock('node:net', () => {
  return {
    ...jest.requireActual('node:net'),
    connect: jest.fn((options: net.TcpSocketConnectOpts, callback?: () => void) => {
      const socket = new MockSmtpSocket();
      setTimeout(() => {
        debugLog('net.connect callback firing');
        if (callback) callback();
      }, 0);
      return socket as unknown as net.Socket;
    }),
  };
});

describe('0032: Socket Mock Tests', () => {
  let mockSocket: MockSmtpSocket | null = null;

  // Helper to get the mock socket from the net.connect call
  function getMockSocket(): MockSmtpSocket | undefined {
    const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
    const lastResult = connectMock.mock.results[connectMock.mock.results.length - 1];
    if (lastResult && lastResult.value) {
      return lastResult.value as unknown as MockSmtpSocket;
    }
    return undefined;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = null;
  });

  afterEach(() => {
    if (mockSocket) {
      mockSocket.destroy();
    }
  });

  describe('SMTPClient.connect()', () => {
    it('should send EHLO after receiving 220 greeting on port 587', async () => {
      debugLog('\n=== Test: EHLO on port 587 ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        debugLog('net.connect called');
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          // Full SMTP conversation
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('250 Recipient OK\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      const socket = getMockSocket();
      expect(socket?.getWrites()[0]).toContain('EHLO');
      debugLog('EHLO found in writes:', socket?.getWrites()[0]);
    });

    it('should send HELO instead of EHLO on port 25', async () => {
      debugLog('\n=== Test: HELO on port 25 ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        debugLog('net.connect called');
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('250 Recipient OK\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [25],
          timeout: 5000,
          debug: true,
        },
      });

      const socket = getMockSocket();
      expect(socket?.getWrites()[0]).toContain('HELO');
      expect(socket?.getWrites()[0]).not.toContain('EHLO');
    });

    it('should handle multiline greeting correctly', async () => {
      debugLog('\n=== Test: Multiline greeting ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          // Multiline greeting + full conversation
          actualSocket.queueResponse('220-mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('220-PIPELINING\r\n');
          actualSocket.queueResponse('220 8BITMIME\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('250 Recipient OK\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      const socket = getMockSocket();
      expect(socket?.getWrites()[0]).toContain('EHLO');
    });

    it('should reject connection on timeout', async () => {
      debugLog('\n=== Test: Connection timeout ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        // Don't call callback - let the connection hang to trigger timeout
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 100, // Very short timeout
          debug: true,
        },
      });

      expect(result.canConnectSmtp).toBe(false);
    });

    it('should reject connection on socket error', async () => {
      debugLog('\n=== Test: Socket error ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        // Emit error before callback fires (connection failure)
        setTimeout(() => {
          debugLog('Emitting error event');
          (socket as any).emit('error', new Error('ECONNREFUSED'));
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      expect(result.canConnectSmtp).toBe(false);
    });
  });

  describe('SMTP verification scenarios', () => {
    it('should complete verification successfully with valid mailbox', async () => {
      debugLog('\n=== Test: Valid mailbox ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          // Full SMTP conversation
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250-mx.example.com\r\n250 STARTTLS\r\n250 VRFY\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('250 Recipient OK\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      expect(result.isDeliverable).toBe(true);
    });

    it('should detect over quota mailbox (452 response)', async () => {
      debugLog('\n=== Test: Over quota ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('452-4.2.2 The email account is over quota\r\n452 Please try later\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      // Should be marked as deliverable but with over quota
      expect(result.hasFullInbox).toBe(true);
    });

    it('should detect invalid mailbox (550 response)', async () => {
      debugLog('\n=== Test: Invalid mailbox ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('550 User unknown\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      expect(result.isDeliverable).toBe(false);
      expect(result.isDisabled).toBe(true);
    });

    it('should return temporary failure on 4xx responses', async () => {
      debugLog('\n=== Test: Temporary failure ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('450 Try again later\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      // 450 is a temporary error - should be deliverable (could succeed later)
      expect(result.canConnectSmtp).toBe(true);
    });

    it('should fail on no greeting response', async () => {
      debugLog('\n=== Test: No greeting ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          // Send invalid response instead of greeting
          actualSocket.queueResponse('500 Command unrecognized\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      const result = await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
        },
      });

      // Should get a connection error result
      expect(result.canConnectSmtp).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle custom MAIL FROM address when provided', async () => {
      debugLog('\n=== Test: Custom MAIL FROM ===');

      const connectMock = net.connect as jest.MockedFunction<typeof net.connect>;
      connectMock.mockImplementation((options, callback) => {
        const socket = new MockSmtpSocket() as unknown as net.Socket;
        setTimeout(() => {
          if (callback) callback();
          const actualSocket = socket as unknown as MockSmtpSocket;
          actualSocket.queueResponse('220 mx.example.com ESMTP\r\n');
          actualSocket.queueResponse('250 mx.example.com\r\n');
          actualSocket.queueResponse('250 Mail OK\r\n');
          actualSocket.queueResponse('250 Recipient OK\r\n');
          actualSocket.emitQueuedResponses();
        }, 0);
        return socket;
      });

      await verifyMailboxSMTP({
        local: 'user',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [587],
          timeout: 5000,
          debug: true,
          sequence: {
            steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
            from: '<test@example.org>',
          },
        },
      });

      const socket = getMockSocket();
      const mailFromCall = socket?.getWrites().find((w) => w.includes('MAIL FROM'));
      expect(mailFromCall).toContain('<test@example.org>');
    });
  });
});
