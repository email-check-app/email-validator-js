// 0032: Socket Mock Tests
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */
//
// Tests for SMTP with mocked socket connections
//
// These tests use a simplified mock approach where we:
// 1. Verify MX record lookup is called
// 2. Verify net.connect is called with correct parameters
// 3. Mock the socket to respond to SMTP commands step-by-step

import { promises as dnsPromises, type MxRecord } from 'node:dns';
import net, { Socket } from 'node:net';
import expect from 'expect';
import sinon, { type SinonSandbox } from 'sinon';
import { clearDefaultCache, verifyEmail } from '../src';
import { resolveMxRecords } from '../src/dns';

type SelfMockType = {
  sandbox?: SinonSandbox;
};

const self: SelfMockType = {};

describe('0032: Socket Mock Tests', () => {
  beforeEach(() => {
    self.sandbox = sinon.createSandbox();
    clearDefaultCache();
  });

  afterEach(() => {
    self.sandbox.restore();
    clearDefaultCache();
  });

  describe('#verify', () => {
    it('should perform all tests', async () => {
      // Step 1: Mock MX record lookup
      const resolveMxStub = self.sandbox
        .stub(dnsPromises, 'resolveMx')
        .resolves([{ exchange: 'mx1.bar.com', priority: 10 }]);

      // Step 2: Create mock socket with all required methods
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Step 3: Reactively respond to SMTP commands as they're written
      // Using setTimeout(0) instead of process.nextTick for different timing
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        setTimeout(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            mockSocket.emit('data', '250 Recipient OK\r\n');
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        }, 10);
        return true;
      });

      // Step 4: Mock net.connect to return our socket and emit greeting
      let connectCallbackCalled = false;
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        // Call the connect callback first (sets up data handlers)
        if (callback) {
          callback();
          connectCallbackCalled = true;
        }
        // Then emit the greeting after a longer delay
        setTimeout(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        }, 20);
        return mockSocket;
      });

      // Step 5: Run verification
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
        debug: true,
      });

      // Step 6: Verify interactions
      expect(connectCallbackCalled).toBe(true);
      sinon.assert.called(resolveMxStub);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
      expect(result.validSmtp).toBe(true);
    });

    it('returns immediately if email is malformed invalid', async () => {
      const result = await verifyEmail({ emailAddress: 'bar.com' });
      expect(result.validFormat).toBe(false);
      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
    });

    it('should return a list of mx records, ordered by priority', async () => {
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([
        { exchange: 'mx2.foo.com', priority: 20 },
        { exchange: 'mx1.foo.com', priority: 10 },
        { exchange: 'mx3.foo.com', priority: 30 },
      ]);

      const records = await resolveMxRecords({ domain: 'bar@foo.com' });
      expect(records).toEqual(['mx1.foo.com', 'mx2.foo.com', 'mx3.foo.com']);
    });
  });

  describe('mailbox verification', () => {
    it('returns true when mailbox exists', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Reactively respond to SMTP commands as they're written
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        process.nextTick(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            mockSocket.emit('data', '250 Recipient OK\r\n');
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        });
        return true;
      });

      // Mock connect and emit greeting
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        });
        return mockSocket;
      });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(true);
    });

    it('returns false on over quota check', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Reactively respond to SMTP commands as they're written
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        process.nextTick(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            // Over quota error (452)
            mockSocket.emit(
              'data',
              '452-4.2.2 The email account that you tried to reach is over quota. Please direct\r\n'
            );
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        });
        return true;
      });

      // Mock connect and emit greeting
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        });
        return mockSocket;
      });

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
      });

      expect(result.validSmtp).toBe(false);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
    });

    it('returns null on socket error', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket that errors immediately
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);
      mockSocket.write = sinon.stub().returns(true);

      // Mock connect - emit error immediately
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('error', new Error('Connection failed'));
        });
        return mockSocket;
      });

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
      });

      expect(result.validSmtp).toBe(null);
      expect(result.validMx).toBe(true);
      expect(result.validFormat).toBe(true);
    });

    it('regression: does not write infinitely if there is a socket error', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket that errors immediately
      const writeSpy = self.sandbox.spy();
      const endSpy = self.sandbox.spy();
      const mockSocket = {
        on: (event: string, callback: (arg0: Error) => void) => {
          if (event === 'error') {
            return setTimeout(() => {
              mockSocket.destroyed = true;
              callback(new Error());
            }, 100);
          }
          return mockSocket;
        },
        write: writeSpy,
        end: endSpy,
        destroyed: false,
        removeAllListeners: () => {},
        destroy: () => {
          mockSocket.destroyed = true;
        },
        setTimeout: () => mockSocket,
      } as any;

      self.sandbox.stub(net, 'connect').returns(mockSocket);

      await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      sinon.assert.notCalled(writeSpy);
      sinon.assert.notCalled(endSpy);
    });

    it('should return null on unknown SMTP errors', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Reactively respond to SMTP commands as they're written
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        process.nextTick(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            // Unknown error (500)
            mockSocket.emit('data', '500 Unknown Error\r\n');
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        });
        return true;
      });

      // Mock connect and emit greeting
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        });
        return mockSocket;
      });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(null);
    });

    it('returns false on bad mailbox errors', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Reactively respond to SMTP commands as they're written
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        process.nextTick(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            // User unknown error (550)
            mockSocket.emit('data', '550 User unknown\r\n');
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        });
        return true;
      });

      // Mock connect and emit greeting
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        });
        return mockSocket;
      });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(false);
    });

    it('returns null on spam errors', async () => {
      // Mock MX
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.foo.com', priority: 10 }]);

      // Create mock socket
      const mockSocket: any = new Socket({});
      mockSocket.setTimeout = sinon.stub().returns(mockSocket);
      mockSocket.setEncoding = sinon.stub().returns(mockSocket);
      mockSocket.setKeepAlive = sinon.stub().returns(mockSocket);
      mockSocket.ref = sinon.stub().returns(mockSocket);
      mockSocket.unref = sinon.stub().returns(mockSocket);

      // Reactively respond to SMTP commands as they're written
      mockSocket.write = self.sandbox.spy((data: Buffer) => {
        const cmd = data.toString().trim();
        process.nextTick(() => {
          if (cmd.includes('EHLO') || cmd.includes('HELO')) {
            mockSocket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
          } else if (cmd.includes('MAIL FROM')) {
            mockSocket.emit('data', '250 Mail OK\r\n');
          } else if (cmd.includes('RCPT TO')) {
            // Spam rejection error (550)
            mockSocket.emit('data', '550-"JunkMail rejected - ec2-54-74-157-229.eu-west-1.compute.amazonaws.com\r\n');
          } else if (cmd.includes('QUIT')) {
            mockSocket.emit('data', '221 Bye\r\n');
            mockSocket.emit('close');
          }
        });
        return true;
      });

      // Mock connect and emit greeting
      self.sandbox.stub(net, 'connect').callsFake((_options, callback) => {
        if (callback) callback();
        process.nextTick(() => {
          mockSocket.emit('data', '220 test.example.com ESMTP\r\n');
        });
        return mockSocket;
      });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(null);
    });
  });

  describe('given no mx records', () => {
    it('should return false on the domain verification', async () => {
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([]);

      const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifyMx: true });
      expect(result.validMx).toBe(false);
      expect(result.validSmtp).toBe(null);
    });
  });

  describe('given a verifyMailbox option false', () => {
    it('should not check via socket', async () => {
      self.sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.bar.com', priority: 10 }]);

      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifySmtp: false,
        verifyMx: true,
      });
      expect(result.validSmtp).toBe(null);
      expect(result.validMx).toBe(true);
    });
  });

  describe('given a verifyDomain option false', () => {
    it('should not check via socket', async () => {
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: false,
        verifySmtp: false,
      });
      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
    });
  });
});
