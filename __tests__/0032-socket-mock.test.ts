// 0032: Socket Mock Tests
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */
//
// Tests for SMTP with mocked socket connections

import { promises as dnsPromises, type MxRecord } from 'node:dns';
import net, { Socket } from 'node:net';
import expect from 'expect';
import sinon, { type SinonSandbox } from 'sinon';
import { clearDefaultCache, verifyEmail } from '../src';
import { resolveMxRecords } from '../src/dns';

type SelfMockType = {
  resolveMxStub?: sinon.SinonStub;
  connectStub?: sinon.SinonStub;
  socket?: Socket;
  sandbox?: SinonSandbox;
};

// Helper to add all required socket methods for mocking
function setupMockSocket(socket: Socket, sandbox: SinonSandbox): void {
  // Don't stub 'on' - Socket needs it for event handling
  // Don't stub 'setTimeout' - we need the real method to actually schedule timeouts
  socket.setEncoding = sandbox.stub().returns(socket);
  socket.setKeepAlive = sandbox.stub().returns(socket);
  socket.ref = sandbox.stub().returns(socket);
  socket.unref = sandbox.stub().returns(socket);
}

// Helper to set up MX records and socket mock for SMTP tests
function setupSmtpTest(
  sandbox: SinonSandbox,
  options: {
    domain?: string;
    overQuota?: boolean;
    unknownError?: boolean;
    mailboxNotFound?: boolean;
    socketError?: boolean;
    multilineGreeting?: boolean;
    spamError?: string;
    emptyMx?: boolean;
    customMx?: MxRecord[];
  } = {}
) {
  const {
    domain = 'foo.com',
    overQuota = false,
    unknownError = false,
    mailboxNotFound = false,
    socketError = false,
    multilineGreeting = false,
    spamError,
    emptyMx = false,
    customMx,
  } = options;

  // Stub MX records
  const resolveMxStub = sandbox
    .stub(dnsPromises, 'resolveMx')
    .resolves(emptyMx ? [] : customMx || [{ exchange: `mx1.${domain}`, priority: 10 }]);

  // Create socket
  const socket = new Socket({});
  setupMockSocket(socket, sandbox);

  // Stub net.connect
  const connectStub = sandbox.stub(net, 'connect').callsFake((_options, callback) => {
    // Call callback to set up data handlers, then emit greeting
    if (callback) {
      callback();
    }
    // Emit greeting immediately after callback (data handlers are now set up)
    setImmediate(() => {
      if (multilineGreeting) {
        socket.emit('data', '220-hohoho\r\n');
        setTimeout(() => {
          socket.emit('data', '220 ho ho ho\r\n');
        }, 50);
      } else if (socketError) {
        socket.emit('error', new Error('Connection failed'));
      } else {
        socket.emit('data', '220 test.example.com ESMTP\r\n');
      }
    });
    return socket;
  });

  // Stub socket.write - respond to all commands without timing check
  const writeStub = sandbox.stub(socket, 'write').callsFake(function (data) {
    const command = data.toString().trim();
    if (command === 'QUIT') return true;

    setTimeout(() => {
      if (command.includes('EHLO') || command.includes('HELO')) {
        socket.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
      } else if (command.includes('MAIL FROM')) {
        socket.emit('data', '250 Mail OK\r\n');
      } else if (command.includes('RCPT TO')) {
        if (overQuota) {
          socket.emit('data', '452-4.2.2 The email account that you tried to reach is over quota. Please direct\r\n');
        } else if (unknownError) {
          socket.emit('data', '500 Unknown Error\r\n');
        } else if (mailboxNotFound) {
          socket.emit('data', '550 User unknown\r\n');
        } else if (spamError) {
          socket.emit('data', spamError);
        } else {
          socket.emit('data', '250 Recipient OK\r\n');
        }
      }
    }, 10);
    return true;
  });

  return { resolveMxStub, connectStub, writeStub, socket };
}

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
      const { resolveMxStub, connectStub } = setupSmtpTest(self.sandbox);

      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
      });
      sinon.assert.called(resolveMxStub);
      sinon.assert.called(connectStub);
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
      setupSmtpTest(self.sandbox);

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
        debug: true, // Enable debug logging
      });
      console.log('Result:', result);
      expect(result.validSmtp).toBe(true);
    });

    it('returns true if mailbox is yahoo', async () => {
      setupSmtpTest(self.sandbox, { domain: 'yahoo.com' });

      const result = await verifyEmail({ emailAddress: 'bar@yahoo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(true);
    });

    it('returns false on over quota check', async () => {
      setupSmtpTest(self.sandbox, { overQuota: true });

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
      });

      expect(result.validSmtp).toBe(false);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
    });

    it('should return null on socket error', async () => {
      setupSmtpTest(self.sandbox, { socketError: true });

      const result = await verifyEmail({
        emailAddress: 'bar@foo.com',
        verifySmtp: true,
        verifyMx: true,
      });
      expect(result.validSmtp).toBe(null);
      expect(result.validMx).toBe(true);
      expect(result.validFormat).toBe(true);
    });

    it('dodges multiline spam detecting greetings', async () => {
      setupSmtpTest(self.sandbox, { multilineGreeting: true });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(true);
    });

    it('regression: does not write infinitely if there is a socket error', async () => {
      const writeSpy = self.sandbox.spy();
      const endSpy = self.sandbox.spy();

      const socket = {
        on: (event: string, callback: (arg0: Error) => void) => {
          if (event === 'error') {
            return setTimeout(() => {
              socket.destroyed = true;
              callback(new Error());
            }, 100);
          }
        },
        write: writeSpy,
        end: endSpy,
        destroyed: false,
        removeAllListeners: () => {},
        destroy: () => {
          socket.destroyed = true;
        },
      } as any;

      self.sandbox.stub(net, 'connect').returns(socket);

      await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      sinon.assert.notCalled(writeSpy);
      sinon.assert.notCalled(endSpy);
    });

    it('should return null on unknown SMTP errors', async () => {
      setupSmtpTest(self.sandbox, { unknownError: true });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(null);
    });

    it('returns false on bad mailbox errors', async () => {
      setupSmtpTest(self.sandbox, { mailboxNotFound: true });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(false);
    });

    it('returns null on spam errors', async () => {
      const msg = '550-"JunkMail rejected - ec2-54-74-157-229.eu-west-1.compute.amazonaws.com';
      setupSmtpTest(self.sandbox, { spamError: msg });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(null);
    });

    it('returns null on spam errors-#2', async () => {
      const msg =
        '553 5.3.0 flpd575 DNSBL:RBL 521< 54.74.114.115 >_is_blocked.For assistance forward this email to abuse_rbl@abuse-att.net';
      setupSmtpTest(self.sandbox, { spamError: msg });

      const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
      expect(result.validSmtp).toBe(null);
    });
  });

  describe('given no mx records', () => {
    it('should return false on the domain verification', async () => {
      setupSmtpTest(self.sandbox, { emptyMx: true });

      const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifyMx: true });
      expect(result.validMx).toBe(false);
      expect(result.validSmtp).toBe(null);
    });
  });

  describe('given a verifyMailbox option false', () => {
    it('should not check via socket', async () => {
      setupSmtpTest(self.sandbox);

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
