import { promises as dnsPromises } from 'node:dns';
import net, { Socket } from 'node:net';
import expect from 'expect';
import sinon, { type SinonSandbox } from 'sinon';
import { clearAllCaches, type VerificationResult, verifyEmailBatch } from '../src';

describe('Batch Email Verification', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clearAllCaches();
  });

  afterEach(() => {
    sandbox.restore();
    clearAllCaches();
  });

  describe('#verifyEmailBatch', () => {
    beforeEach(() => {
      // Stub DNS resolution
      sandbox.stub(dnsPromises, 'resolveMx').resolves([
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx2.example.com', priority: 20 },
      ]);
    });

    it('should verify multiple emails in parallel', async () => {
      const emails = [
        'user1@testdomain.com',
        'user2@testdomain.com',
        'user3@testdomain.com',
        'invalid-email',
        'user4@testdomain.com',
      ];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        concurrency: 2,
        verifyMx: true,
        verifySmtp: false,
      });

      expect(result.summary.total).toBe(5);
      expect(result.summary.valid).toBe(4);
      expect(result.summary.invalid).toBe(1);
      expect(result.results.size).toBe(5);
    });

    it('should respect concurrency limit', async () => {
      const emails = Array.from({ length: 10 }, (_, i) => `user${i}@testdomain.com`);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const _originalConnect = net.connect;
      sandbox.stub(net, 'connect').callsFake(() => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        const socket = new Socket({});
        setTimeout(() => {
          currentConcurrent--;
          socket.emit('data', '250 OK');
        }, 50);

        return socket;
      });

      await verifyEmailBatch({
        emailAddresses: emails,
        concurrency: 3,
        verifyMx: true,
        verifySmtp: true,
        timeout: 1000,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle errors gracefully', async () => {
      sandbox.restore();
      sandbox = sinon.createSandbox();

      // Make DNS fail for some domains
      sandbox.stub(dnsPromises, 'resolveMx').callsFake(async (domain: string) => {
        if (domain === 'error.com') {
          throw new Error('DNS lookup failed');
        }
        return [{ exchange: 'mx1.example.com', priority: 10 }];
      });

      const emails = ['user1@testdomain.com', 'user2@error.com', 'user3@testdomain.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        verifyMx: true,
      });

      expect(result.summary.total).toBe(3);
      expect(result.results.get('user2@error.com')).toBeTruthy();
    });

    it('should return detailed results', async () => {
      const emails = ['user1@testdomain.com', 'user2@yopmail.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        verifyMx: true,
        checkDisposable: true,
        checkFree: true,
      });

      const detailedResult = result.results.get('user1@testdomain.com') as VerificationResult;
      expect(detailedResult).toHaveProperty('validFormat');
      expect(detailedResult).toHaveProperty('validMx');
      expect(detailedResult).toHaveProperty('validSmtp');
      expect(detailedResult).toHaveProperty('isDisposable');
      expect(detailedResult).toHaveProperty('isFree');
      expect(detailedResult).toHaveProperty('metadata');

      const disposableResult = result.results.get('user2@yopmail.com') as VerificationResult;
      expect(disposableResult.isDisposable).toBe(true);
    });

    it('should track processing time', async () => {
      const emails = ['user1@testdomain.com', 'user2@testdomain.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        verifyMx: false,
      });

      expect(result.summary.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.summary.processingTime).toBeLessThan(5000);
    });
  });
});
