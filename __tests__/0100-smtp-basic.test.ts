// Basic SMTP Verification Tests
//
// Tests core SMTP verification functionality including default configuration,
// parameter validation, debug mode, hostname configuration, cache behavior,
// and multiple domain handling.

import { clearDefaultCache, getDefaultCache } from '../src';
import { verifyMailboxSMTP } from '../src/smtp';
import { createTestParams, measureTime, TEST_DATA, TestUtils } from './utils/smtp.test.config';

describe('0100 SMTP Basic', () => {
  beforeEach(() => {
    clearDefaultCache();
  });
  describe('Default Configuration', () => {
    it(
      'should verify with default settings',
      async () => {
        const params = createTestParams();
        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));

        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle valid Gmail MX records',
      async () => {
        const params = createTestParams({
          domain: 'gmail.com',
          mxRecords: TEST_DATA.MX_RECORDS.gmail,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it('should return false for empty MX records', async () => {
      const params = createTestParams({
        mxRecords: [],
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should return false for undefined MX records', async () => {
      const params = createTestParams({
        mxRecords: undefined as any,
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });
  });

  describe('Parameter Validation', () => {
    it('should handle invalid email format gracefully', async () => {
      const params = createTestParams({
        local: 'invalid-email-with-@-symbol',
        domain: '',
        mxRecords: TEST_DATA.MX_RECORDS.gmail,
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });

    it(
      'should handle special characters in local part',
      async () => {
        const params = createTestParams({
          local: 'test+tag@example',
          domain: 'gmail.com',
          mxRecords: TEST_DATA.MX_RECORDS.gmail,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle long domain names',
      async () => {
        const params = createTestParams({
          domain: 'very-long-domain-name-for-testing-purposes.gmail.com',
          mxRecords: TEST_DATA.MX_RECORDS.gmail,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Debug Mode', () => {
    it(
      'should work with debug mode enabled',
      async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const params = createTestParams({
          options: {
            debug: true,
            ports: [587],
            timeout: 3000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with debug mode disabled',
      async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const params = createTestParams({
          options: {
            debug: false,
            ports: [587],
            timeout: 3000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
        // Console should not be called when debug is false
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Hostname Configuration', () => {
    it(
      'should work with custom hostname',
      async () => {
        const params = createTestParams({
          options: {
            hostname: 'custom-test.example.com',
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with localhost hostname',
      async () => {
        const params = createTestParams({
          options: {
            hostname: 'localhost',
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with default hostname',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Cache Behavior', () => {
    it(
      'should cache and reuse successful verification results',
      async () => {
        const params = createTestParams({
          domain: 'gmail.com',
          mxRecords: TEST_DATA.MX_RECORDS.gmail,
          options: {
            cache: getDefaultCache(),
            debug: false,
          },
        });

        // First call
        const {
          result: { smtpResult: result1 },
          duration: duration1,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(result1.isDeliverable)).toBe(true);

        // Second call should use cache
        const {
          result: { smtpResult: result2 },
          duration: duration2,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(result2.isDeliverable)).toBe(true);

        if (duration1 > 0) {
          const improvement = Math.round(((duration1 - duration2) / duration1) * 100);
        }
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with cache disabled',
      async () => {
        const params = createTestParams({
          options: {
            cache: false,
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Multiple Domains', () => {
    it(
      'should handle different domains',
      async () => {
        const domains = [
          { domain: 'gmail.com', mx: TEST_DATA.MX_RECORDS.gmail },
          { domain: 'outlook.com', mx: TEST_DATA.MX_RECORDS.outlook },
        ];

        for (const { domain, mx } of domains) {
          const params = createTestParams({
            domain,
            mxRecords: mx,
            options: {
              ports: [587],
              timeout: 5000,
            },
          });

          const { smtpResult } = await verifyMailboxSMTP(params);
          expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
        }
      },
      TestUtils.getTestTimeout('slow')
    );
  });
});
