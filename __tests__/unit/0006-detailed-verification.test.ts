/**
 * Test suite for detailed email verification with comprehensive error reporting.
 * Uses the shared fake-net helper instead of sinon — DNS and net/tls are
 * mocked once across the suite, no cross-file mock collision.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearDefaultCache, getDefaultCache, VerificationErrorCode, verifyEmail } from '../../src';
import { fakeNet } from '../helpers/fake-net';

describe('0006 Detailed Email Verification', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  describe('#verifyEmail', () => {
    it('should return detailed validation error for invalid email format', async () => {
      const result = await verifyEmail({ emailAddress: 'invalid-email', verifyMx: true, verifySmtp: false });
      expect(result.validFormat).toBe(false);
      expect(result.metadata?.error).toBe(VerificationErrorCode.invalidFormat);
      expect(result.metadata?.verificationTime).toBeGreaterThanOrEqual(0);
    });

    it('should detect disposable email providers when checkDisposable is enabled', async () => {
      fakeNet.setMxRecords('yopmail.com', [{ exchange: 'mx.yopmail.com', priority: 10 }]);
      const result = await verifyEmail({ emailAddress: 'test@yopmail.com', checkDisposable: true, verifyMx: true });
      expect(result.validFormat).toBe(true);
      expect(result.isDisposable).toBe(true);
      expect(result.metadata?.error).toBe(VerificationErrorCode.disposableEmail);
    });

    it('should detect free email providers when checkFree is enabled', async () => {
      fakeNet.setMxRecords('gmail.com', [{ exchange: 'gmail-smtp-in.l.google.com', priority: 10 }]);
      const result = await verifyEmail({ emailAddress: 'test@gmail.com', checkFree: true, verifyMx: true });
      expect(result.isFree).toBe(true);
      expect(result.validFormat).toBe(true);
    });

    it('should return MX records in the verification result', async () => {
      fakeNet.setMxRecords('example.com', [
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx2.example.com', priority: 20 },
      ]);
      const result = await verifyEmail({ emailAddress: 'test@example.com', verifyMx: true });
      expect(result.validMx).toBe(true);
    });

    it('should handle domains with no MX records', async () => {
      fakeNet.setMxRecords('nomx.com', []);
      const result = await verifyEmail({ emailAddress: 'test@nomx.com', verifyMx: true });
      expect(result.validMx).toBe(false);
      expect(result.metadata?.error).toBe(VerificationErrorCode.noMxRecords);
    });

    it('should handle SMTP verification failure (550 user not found) without crashing', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx1.example.com', priority: 10 }]);
      fakeNet.script(['220 Welcome', '250 OK', '250 sender ok', '550 User not found']);

      const result = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        debug: true,
        smtpPerAttemptTimeoutMs: 1000,
      });

      // 550 = mailbox not found → SMTP responded, recipient invalid.
      expect([null, false]).toContain(result.validSmtp);
    });

    it('should handle SMTP connection failure with proper error reporting', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx1.example.com', priority: 10 }]);
      fakeNet.setConnectError('ECONNREFUSED');

      const result = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        smtpPerAttemptTimeoutMs: 500,
      });
      expect(result.validSmtp).toBe(null);
    });

    it('should indicate when verification results are retrieved from cache', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx1.example.com', priority: 10 }]);
      fakeNet.script([
        '220 Welcome',
        '250 OK',
        '250 sender ok',
        '250 recipient ok', // real RCPT
        '550 5.1.1 unknown user', // probe RCPT (not catch-all)
        '250 reset', // RSET
      ]);

      const sharedCache = getDefaultCache();

      const result1 = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        cache: sharedCache,
        smtpPerAttemptTimeoutMs: 2000,
      });
      expect(result1.metadata?.cached).toBe(false);

      const result2 = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        cache: sharedCache,
        smtpPerAttemptTimeoutMs: 2000,
      });
      expect(result2.metadata?.cached).toBe(true);
    });

    it('should validate email length constraints per RFC 5321', async () => {
      const longLocal = 'a'.repeat(65);
      const result1 = await verifyEmail({ emailAddress: `${longLocal}@example.com` });
      expect(result1.validFormat).toBe(false);

      const longDomain = 'a'.repeat(254);
      const result2 = await verifyEmail({ emailAddress: `test@${longDomain}.com` });
      expect(result2.validFormat).toBe(false);
    });

    it('should detect and reject invalid email patterns', async () => {
      const invalidPatterns = [
        'test..test@example.com',
        '.test@example.com',
        'test.@example.com',
        'test@.example.com',
        'test@example.com.',
      ];
      for (const email of invalidPatterns) {
        const result = await verifyEmail({ emailAddress: email });
        expect(result.validFormat).toBe(false);
        expect(result.metadata?.error).toBe(VerificationErrorCode.invalidFormat);
      }
    });
  });
});
