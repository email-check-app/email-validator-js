/**
 * Test suite for detailed email verification with comprehensive error reporting
 */

import { promises as dnsPromises } from 'node:dns';
import net, { Socket } from 'node:net';
import expect from 'expect';
import sinon, { type SinonSandbox } from 'sinon';
import { clearDefaultCache, getDefaultCache, VerificationErrorCode, verifyEmail } from '../src';

describe('0006 Detailed Email Verification', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clearDefaultCache();
  });

  afterEach(() => {
    sandbox.restore();
    clearDefaultCache();
  });

  describe('#verifyEmail', () => {
    it('should return detailed validation error for invalid email format', async () => {
      const result = await verifyEmail({
        emailAddress: 'invalid-email',
        verifyMx: true,
        verifySmtp: false,
      });

      expect(result.validFormat).toBe(false);
      expect(result.metadata?.error).toBe(VerificationErrorCode.INVALID_FORMAT);
      expect(result.metadata?.verificationTime).toBeGreaterThanOrEqual(0);
    });

    it('should detect disposable email providers when checkDisposable is enabled', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx.yopmail.com', priority: 10 }]);

      const result = await verifyEmail({
        emailAddress: 'test@yopmail.com',
        checkDisposable: true,
        verifyMx: true,
      });

      expect(result.validFormat).toBe(true);
      expect(result.isDisposable).toBe(true);
      expect(result.metadata?.error).toBe(VerificationErrorCode.DISPOSABLE_EMAIL);
    });

    it('should detect free email providers when checkFree is enabled', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'gmail-smtp-in.l.google.com', priority: 10 }]);

      const result = await verifyEmail({
        emailAddress: 'test@gmail.com',
        checkFree: true,
        verifyMx: true,
      });

      expect(result.isFree).toBe(true);
      expect(result.validFormat).toBe(true);
    });

    it('should return MX records in the verification result', async () => {
      const mxRecords = [
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx2.example.com', priority: 20 },
      ];
      sandbox.stub(dnsPromises, 'resolveMx').resolves(mxRecords);

      const result = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
      });

      expect(result.validMx).toBe(true);
    });

    it('should handle domains with no MX records', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([]);

      const result = await verifyEmail({
        emailAddress: 'test@nomx.com',
        verifyMx: true,
      });

      expect(result.validMx).toBe(false);
      expect(result.metadata?.error).toBe(VerificationErrorCode.NO_MX_RECORDS);
    });

    it('should handle SMTP verification failure with proper error reporting', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.example.com', priority: 10 }]);

      const socket = new Socket({});
      sandbox.stub(socket, 'write').callsFake(function (data) {
        if (!data.toString().includes('QUIT')) {
          this.emit('data', '550 User not found');
        }
        return true;
      });
      sandbox.stub(net, 'connect').returns(socket);

      setTimeout(() => socket.emit('data', '220 Welcome'), 10);

      const result = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        debug: true,
      });

      expect(result.validSmtp).toBe(null);
      expect(result.metadata?.error).toBe(VerificationErrorCode.SMTP_CONNECTION_FAILED);
    });

    it('should handle SMTP connection failure with proper error reporting', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.example.com', priority: 10 }]);

      const socket = {
        on: (event: string, callback: (error?: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Connection failed')), 10);
          }
        },
        write: () => true,
        end: () => {},
        destroyed: false,
        removeAllListeners: () => {},
        destroy: () => {},
      };
      sandbox.stub(net, 'connect').returns(socket as unknown as Socket);

      const result = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
      });

      expect(result.validSmtp).toBe(null);
      expect(result.metadata?.error).toBe(VerificationErrorCode.NO_MX_RECORDS);
    });

    it('should indicate when verification results are retrieved from cache', async () => {
      sandbox.stub(dnsPromises, 'resolveMx').resolves([{ exchange: 'mx1.example.com', priority: 10 }]);

      const socket = new Socket({});
      sandbox.stub(socket, 'write').callsFake(function (data) {
        if (!data.toString().includes('QUIT')) {
          this.emit('data', '250 OK');
        }
        return true;
      });
      sandbox.stub(net, 'connect').returns(socket);

      setTimeout(() => socket.emit('data', '220 Welcome'), 10);

      // Create a shared cache instance for testing cache behavior
      const sharedCache = getDefaultCache();

      // First call - should not be cached
      const result1 = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        cache: sharedCache,
        timeout: 2000,
      });
      expect(result1.metadata?.cached).toBe(false);

      // Second call - should return cached result
      const result2 = await verifyEmail({
        emailAddress: 'test@example.com',
        verifyMx: true,
        verifySmtp: true,
        cache: sharedCache,
        timeout: 2000,
      });
      expect(result2.metadata?.cached).toBe(true);
    });

    it('should validate email length constraints per RFC 5321', async () => {
      const longLocal = 'a'.repeat(65);
      const result1 = await verifyEmail({
        emailAddress: `${longLocal}@example.com`,
      });
      expect(result1.validFormat).toBe(false);

      const longDomain = 'a'.repeat(254);
      const result2 = await verifyEmail({
        emailAddress: `test@${longDomain}.com`,
      });
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
        const result = await verifyEmail({
          emailAddress: email,
        });
        expect(result.validFormat).toBe(false);
        expect(result.metadata?.error).toBe(VerificationErrorCode.INVALID_FORMAT);
      }
    });
  });
});
