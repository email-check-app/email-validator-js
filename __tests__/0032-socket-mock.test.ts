// 0032: Socket Mock Tests
//
// Tests for SMTP with mocked socket connections

import { promises as dnsPromises, type MxRecord } from 'node:dns';
import net, { Socket } from 'node:net';
import expect from 'expect';
import sinon, { type SinonSandbox, type SinonStub } from 'sinon';
import { clearDefaultCache, verifyEmail } from '../src';
import { resolveMxRecords } from '../src/dns';

type SelfMockType = {
  resolveMxStub?: SinonStub<[string], Promise<MxRecord[]>>;
  connectStub?: SinonStub<[path: string, connectionListener?: () => void], Socket>;
  socket?: Socket;
  sandbox?: SinonSandbox;
};

function stubResolveMx(self: SelfMockType, domain = 'foo.com') {
  self.resolveMxStub = self.sandbox.stub(dnsPromises, 'resolveMx').callsFake(async (_hostname: string) => [
    { exchange: `mx1.${domain}`, priority: 30 },
    { exchange: `mx2.${domain}`, priority: 10 },
    { exchange: `mx3.${domain}`, priority: 20 },
  ]);
}

function stubSocket(self: SelfMockType) {
  self.socket = new Socket({});
  let greetingSent = false;

  // Mock the connect function to emit the socket immediately with a greeting
  self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
    // Emit the socket with a small delay
    setTimeout(() => {
      if (callback) callback();
      // Emit greeting after connection
      setTimeout(() => {
        self.socket.emit('data', '220 test.example.com ESMTP\r\n');
        greetingSent = true;
      }, 10);
    }, 5);
    return self.socket;
  });

  self.sandbox.stub(self.socket, 'write').callsFake(function (data) {
    const command = data.toString().trim();
    if (!command.includes('QUIT') && greetingSent) {
      // Respond to SMTP commands
      setTimeout(() => {
        if (command.includes('EHLO') || command.includes('HELO')) {
          this.emit('data', '250-test.example.com Hello\r\n250 VRFY\r\n250 8BITMIME\r\n250 OK\r\n');
        } else if (command.includes('MAIL FROM')) {
          this.emit('data', '250 Mail OK\r\n');
        } else if (command.includes('RCPT TO')) {
          this.emit('data', '250 Recipient OK\r\n');
        } else {
          this.emit('data', '250 Foo');
        }
      }, 10);
    }
    return true;
  });
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
    beforeEach(async () => {
      stubResolveMx(self);
      stubSocket(self);
    });

    it('should perform all tests', async () => {
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
      });
      sinon.assert.called(self.resolveMxStub);
      sinon.assert.called(self.connectStub);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
      expect(result.validSmtp).toBe(true);
    });

    it('returns immediately if email is malformed invalid', async () => {
      const result = await verifyEmail({ emailAddress: 'bar.com' });
      sinon.assert.notCalled(self.resolveMxStub);
      sinon.assert.notCalled(self.connectStub);
      expect(result.validFormat).toBe(false);
      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
    });

    describe('mailbox verification', () => {
      it('returns true when mailbox exists', async () => {
        const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        expect(result.validSmtp).toBe(true);
      });

      it('returns null if mailbox is yahoo', async () => {
        self.resolveMxStub.restore();
        stubResolveMx(self, 'yahoo.com');

        const result = await verifyEmail({ emailAddress: 'bar@yahoo.com', verifySmtp: true, verifyMx: true });

        expect(result.validSmtp).toBe(true);
      });

      it('returns false on over quota check', async () => {
        self.connectStub.restore(); // Restore previous stub
        const msg = '452-4.2.2 The email account that you tried to reach is over quota. Please direct';
        const socket = new Socket({});
        let greetingSent = false;

        self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
          setTimeout(() => {
            if (callback) callback();
            setTimeout(() => {
              socket.emit('data', '220 test.example.com ESMTP\r\n');
              greetingSent = true;
            }, 10);
          }, 5);
          return socket;
        });

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          const command = data.toString().trim();
          if (!command.includes('QUIT') && greetingSent) {
            setTimeout(() => {
              if (command.includes('EHLO') || command.includes('HELO')) {
                this.emit('data', '250 Hello\r\n');
              } else if (command.includes('MAIL FROM')) {
                this.emit('data', '250 Mail OK\r\n');
              } else if (command.includes('RCPT TO')) {
                this.emit('data', msg + '\r\n');
              }
            }, 10);
          }
          return true;
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

      it('should return null on socket error', async () => {
        self.connectStub.restore(); // Restore previous stub
        const socket = new Socket({});

        self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
          setTimeout(() => {
            if (callback) callback();
            // Emit error immediately without greeting
            socket.emit('error', new Error('Connection failed'));
          }, 5);
          return socket;
        });

        self.sandbox.stub(socket, 'write').callsFake(() => true);

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
        self.connectStub.restore(); // Restore previous stub
        const socket = new Socket({});
        let greeted = false;

        self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
          setTimeout(() => {
            if (callback) callback();
            // the "-" indicates a multi line greeting
            socket.emit('data', '220-hohoho\r\n');

            // wait a bit and send the rest
            setTimeout(() => {
              greeted = true;
              socket.emit('data', '220 ho ho ho\r\n');
            }, 50);
          }, 10);
          return socket;
        });

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          const command = data.toString().trim();
          if (!command.includes('QUIT')) {
            setTimeout(() => {
              if (command.includes('EHLO') || command.includes('HELO')) {
                this.emit('data', '250 Hello\r\n');
              } else if (command.includes('MAIL FROM')) {
                this.emit('data', '250 Mail OK\r\n');
              } else if (command.includes('RCPT TO')) {
                this.emit('data', '250 OK\r\n');
              }
            }, 10);
          }
          return true;
        });

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
        };

        self.connectStub = self.connectStub.returns(socket as unknown as Socket);

        await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        sinon.assert.notCalled(writeSpy);
        sinon.assert.notCalled(endSpy);
      });

      it('should return null on unknown SMTP errors', async () => {
        self.connectStub.restore(); // Restore previous stub
        const socket = new Socket({});
        let greetingSent = false;

        self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
          setTimeout(() => {
            if (callback) callback();
            setTimeout(() => {
              socket.emit('data', '220 test.example.com ESMTP\r\n');
              greetingSent = true;
            }, 10);
          }, 5);
          return socket;
        });

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          const command = data.toString().trim();
          if (!command.includes('QUIT') && greetingSent) {
            setTimeout(() => {
              if (command.includes('EHLO') || command.includes('HELO')) {
                this.emit('data', '250 Hello\r\n');
              } else if (command.includes('MAIL FROM')) {
                this.emit('data', '250 Mail OK\r\n');
              } else if (command.includes('RCPT TO')) {
                this.emit('data', '500 Unknown Error\r\n');
              }
            }, 10);
          }
          return true;
        });

        const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        expect(result.validSmtp).toBe(null);
      });

      it('returns false on bad mailbox errors', async () => {
        self.connectStub.restore(); // Restore previous stub
        const socket = new Socket({});
        let greetingSent = false;

        self.connectStub = self.sandbox.stub(net, 'connect').callsFake((options, callback) => {
          setTimeout(() => {
            if (callback) callback();
            setTimeout(() => {
              socket.emit('data', '220 test.example.com ESMTP\r\n');
              greetingSent = true;
            }, 10);
          }, 5);
          return socket;
        });

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          const command = data.toString().trim();
          if (!command.includes('QUIT') && greetingSent) {
            setTimeout(() => {
              if (command.includes('EHLO') || command.includes('HELO')) {
                this.emit('data', '250 Hello\r\n');
              } else if (command.includes('MAIL FROM')) {
                this.emit('data', '250 Mail OK\r\n');
              } else if (command.includes('RCPT TO')) {
                this.emit('data', '550 User unknown\r\n');
              }
            }, 10);
          }
          return true;
        });

        const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        expect(result.validSmtp).toBe(false);
      });

      it('returns null on spam errors', async () => {
        const msg = '550-"JunkMail rejected - ec2-54-74-157-229.eu-west-1.compute.amazonaws.com';
        const socket = new Socket({});

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          if (!data.toString().includes('QUIT')) this.emit('data', msg);
          return true;
        });

        self.connectStub.returns(socket);

        setTimeout(() => socket.emit('data', '220 Welcome'), 10);

        const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        expect(result.validSmtp).toBe(null);
      });

      it('returns null on spam errors-#2', async () => {
        const msg =
          '553 5.3.0 flpd575 DNSBL:RBL 521< 54.74.114.115 >_is_blocked.For assistance forward this email to abuse_rbl@abuse-att.net';
        const socket = new Socket({});

        self.sandbox.stub(socket, 'write').callsFake(function (data) {
          if (!data.toString().includes('QUIT')) this.emit('data', msg);
          return true;
        });

        self.connectStub.returns(socket);

        setTimeout(() => socket.emit('data', '220 Welcome'), 10);

        const result = await verifyEmail({ emailAddress: 'bar@foo.com', verifySmtp: true, verifyMx: true });
        expect(result.validSmtp).toBe(null);
      });
    });

    describe('given no mx records', () => {
      beforeEach(() => {
        self.resolveMxStub.resolves([]);
      });

      it('should return false on the domain verification', async () => {
        const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifyMx: true });
        expect(result.validMx).toBe(false);
        expect(result.validSmtp).toBe(null);
      });
    });

    describe('given a verifyMailbox option false', () => {
      it('should not check via socket', async () => {
        const result = await verifyEmail({
          emailAddress: 'foo@bar.com',
          verifySmtp: false,
          verifyMx: true,
        });
        sinon.assert.called(self.resolveMxStub);
        sinon.assert.notCalled(self.connectStub);
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
        sinon.assert.notCalled(self.resolveMxStub);
        sinon.assert.notCalled(self.connectStub);
        expect(result.validMx).toBe(null);
        expect(result.validSmtp).toBe(null);
      });
    });
    it('should return a list of mx records, ordered by priority', async () => {
      const records = await resolveMxRecords({ domain: 'bar@foo.com' });
      expect(records).toEqual(['mx2.foo.com', 'mx3.foo.com', 'mx1.foo.com']);
    });
  });
});
