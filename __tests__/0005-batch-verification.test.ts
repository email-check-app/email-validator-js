/**
 * Test suite for batch email verification — uses fake-net (no sinon).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearDefaultCache, type VerificationResult, verifyEmailBatch } from '../src';
import { fakeNet } from './helpers/fake-net';

describe('0005 Batch Email Verification', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
    // Default MX setup — most tests use these.
    fakeNet.setMxRecords('testdomain.com', [
      { exchange: 'mx1.example.com', priority: 10 },
      { exchange: 'mx2.example.com', priority: 20 },
    ]);
    fakeNet.setMxRecords('yopmail.com', [{ exchange: 'mx.yopmail.com', priority: 10 }]);
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  describe('#verifyEmailBatch', () => {
    it('should verify multiple email addresses in parallel with concurrency control', async () => {
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

    it('should handle DNS errors gracefully and continue processing other emails', async () => {
      // Custom MX behavior: error.com fails, everything else succeeds.
      fakeNet.setMxRecords('error.com', []);
      const emails = ['user1@testdomain.com', 'user2@error.com', 'user3@testdomain.com'];

      const result = await verifyEmailBatch({ emailAddresses: emails, verifyMx: true });

      expect(result.summary.total).toBe(3);
      expect(result.results.get('user2@error.com')).toBeTruthy();
    });

    it('should return detailed verification results including disposable and free email detection', async () => {
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

    it('should track and report total batch processing time', async () => {
      const emails = ['user1@testdomain.com', 'user2@testdomain.com'];
      const result = await verifyEmailBatch({ emailAddresses: emails, verifyMx: false });
      expect(result.summary.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.summary.processingTime).toBeLessThan(5000);
    });
  });
});
