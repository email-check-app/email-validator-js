/**
 * Socket Mock Tests — uses fake-net (no sinon).
 *
 * Tests SMTP verification with mocked socket connections, simulating various
 * SMTP server responses, errors, and edge cases without real network calls.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearDefaultCache, verifyEmail } from '../../src';
import { resolveMxRecords } from '../../src/mx-resolver';
import { fakeNet } from '../helpers/fake-net';

const FOO_MX = [
  { exchange: 'mx2.foo.com', priority: 10 },
  { exchange: 'mx3.foo.com', priority: 20 },
  { exchange: 'mx1.foo.com', priority: 30 },
];
// Default SMTP envelope: greeting + EHLO multi-line + MAIL FROM + dual-probe
// (real RCPT 250, probe RCPT 550, RSET 250).
const VALID_FLOW = [
  '220 test.example.com ESMTP',
  '250-test.example.com Hello',
  '250-VRFY',
  '250 OK',
  '250 Mail OK',
  '250 Recipient OK', // real RCPT
  '550 5.1.1 unknown user', // probe RCPT (rejected — not catch-all)
  '250 reset', // RSET
];

describe('0107 Socket Mock', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
    fakeNet.setMxRecords('foo.com', FOO_MX);
    fakeNet.setMxRecords('bar.com', FOO_MX); // most tests use bar.com but expect foo.com MX shape
    fakeNet.setMxRecords('yahoo.com', FOO_MX);
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  describe('#verify', () => {
    it('should perform all tests', async () => {
      fakeNet.script(VALID_FLOW);
      const result = await verifyEmail({
        emailAddress: 'foo@bar.com',
        verifyMx: true,
        verifySmtp: true,
        debug: true,
        timeout: 1000,
      });
      expect(fakeNet.mxCalls.length).toBeGreaterThan(0);
      expect(result.validFormat).toBe(true);
      expect(result.validMx).toBe(true);
      expect(result.validSmtp).toBe(true);
    });

    it('returns early if email format is invalid', async () => {
      const result = await verifyEmail({ emailAddress: 'bar.com' });
      expect(fakeNet.mxCalls.length).toBe(0);
      expect(fakeNet.connects.length).toBe(0);
      expect(result.validFormat).toBe(false);
      expect(result.validMx).toBe(null);
      expect(result.validSmtp).toBe(null);
    });

    describe('mailbox verification', () => {
      it('returns true when mailbox exists', async () => {
        fakeNet.script(VALID_FLOW);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(true);
      });

      it('returns true for yahoo (mocked SMTP path)', async () => {
        fakeNet.script(VALID_FLOW);
        const result = await verifyEmail({
          emailAddress: 'bar@yahoo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(true);
      });

      it('returns false on over quota check', async () => {
        fakeNet.script([
          '220 test.example.com ESMTP',
          '250 Hello',
          '250 Mail OK',
          '452-4.2.2 The email account that you tried to reach is over quota. Please direct',
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(false);
        expect(result.validFormat).toBe(true);
        expect(result.validMx).toBe(true);
      });

      it('returns true on high number of invalid recipients (high_volume)', async () => {
        fakeNet.script([
          '220 test.example.com ESMTP',
          '250 Hello',
          '250 Mail OK',
          '550 5.7.1 [IR] Our system has detected an excessively high number of invalid recipients originating from your account.',
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(true);
      });

      it('returns true on unusual activity anti-abuse lockout responses', async () => {
        fakeNet.script([
          '220 test.example.com ESMTP',
          '250 Hello',
          '250 Mail OK',
          '550 5.7.1 [IRR] Our system has detected unusual activity from your account. Contact your service provider for support',
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(true);
      });

      it('returns null when socket connection error occurs', async () => {
        fakeNet.setConnectError('ECONNREFUSED');
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          debug: true,
          timeout: 500,
        });
        expect(result.validSmtp).toBe(null);
        expect(result.validMx).toBe(true);
        expect(result.validFormat).toBe(true);
      });

      it('handles multiline SMTP greetings correctly', async () => {
        fakeNet.script([
          '220-hohoho',
          '220 ho ho ho',
          '250 Hello',
          '250 Mail OK',
          '250 OK', // real RCPT
          '550 5.1.1 unknown user', // probe RCPT
          '250 reset', // RSET
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(true);
      });

      it('should return null on unknown SMTP errors', async () => {
        fakeNet.script(['220 test.example.com ESMTP', '250 Hello', '250 Mail OK', '500 Unknown Error']);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(null);
      });

      it('returns false on bad mailbox errors', async () => {
        fakeNet.script(['220 test.example.com ESMTP', '250 Hello', '250 Mail OK', '550 User unknown']);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(false);
      });

      it('returns null on spam errors (Junk filter)', async () => {
        fakeNet.script([
          '220 test.example.com ESMTP',
          '250 Hello',
          '250 Mail OK',
          '550 "JunkMail rejected - ec2-54-74-157-229.eu-west-1.compute.amazonaws.com',
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(null);
      });

      it('returns null on RBL-blocked spam errors', async () => {
        fakeNet.script([
          '220 test.example.com ESMTP',
          '250 Hello',
          '250 Mail OK',
          '553 5.3.0 flpd575 DNSBL:RBL 521< 54.74.114.115 >_is_blocked.For assistance forward this email to abuse_rbl@abuse-att.net',
        ]);
        const result = await verifyEmail({
          emailAddress: 'bar@foo.com',
          verifySmtp: true,
          verifyMx: true,
          timeout: 1000,
        });
        expect(result.validSmtp).toBe(null);
      });
    });

    describe('given no mx records', () => {
      it('should return false on the domain verification', async () => {
        fakeNet.setMxRecords('bar.com', []);
        const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifyMx: true });
        expect(result.validMx).toBe(false);
        expect(result.validSmtp).toBe(null);
      });
    });

    describe('given a verifyMailbox option false', () => {
      it('should not check via socket', async () => {
        const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifySmtp: false, verifyMx: true });
        expect(fakeNet.mxCalls.length).toBeGreaterThan(0);
        expect(fakeNet.connects.length).toBe(0);
        expect(result.validSmtp).toBe(null);
        expect(result.validMx).toBe(true);
      });
    });

    describe('given a verifyDomain option false', () => {
      it('should not check via socket', async () => {
        const result = await verifyEmail({ emailAddress: 'foo@bar.com', verifyMx: false, verifySmtp: false });
        expect(fakeNet.mxCalls.length).toBe(0);
        expect(fakeNet.connects.length).toBe(0);
        expect(result.validMx).toBe(null);
        expect(result.validSmtp).toBe(null);
      });
    });

    it('should return a list of mx records, ordered by priority', async () => {
      const records = await resolveMxRecords({ domain: 'foo.com' });
      // FOO_MX is priority 10/20/30 → order should be 10, 20, 30 → mx2, mx3, mx1
      expect(records).toEqual(['mx2.foo.com', 'mx3.foo.com', 'mx1.foo.com']);
    });
  });
});
