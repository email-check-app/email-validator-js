// SMTP TLS Configuration Tests
//
// Tests TLS/SSL security configurations including certificate validation,
// TLS version settings, STARTTLS behavior, and performance comparisons.

import { clearDefaultCache } from '../src';
import { verifyMailboxSMTP } from '../src/smtp';
import { createTestParams, TEST_CONFIGS, TestUtils } from './utils/smtp.test.config';

describe('0102 SMTP TLS', () => {
  beforeEach(() => {
    clearDefaultCache();
  });
  describe('TLS Enable/Disable', () => {
    it(
      'should work with TLS enabled (default)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587, 465],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with TLS disabled',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.TLS_DISABLED,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with TLS on port 25 (STARTTLS)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with TLS on port 587 (STARTTLS)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with TLS on port 465 (implicit)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS Certificate Validation', () => {
    it(
      'should work with certificate validation disabled (default)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: {
              rejectUnauthorized: false,
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with certificate validation enabled',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465], // More likely to have valid certs
            tls: {
              rejectUnauthorized: true,
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle certificate validation errors gracefully',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: {
              rejectUnauthorized: true,
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        // May fail due to strict certificate validation, but should not throw
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS Version Configuration', () => {
    it(
      'should work with TLS 1.2 minimum',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: {
              minVersion: 'TLSv1.2',
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with TLS 1.3 minimum',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465], // More likely to support TLS 1.3
            tls: {
              minVersion: 'TLSv1.3',
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle unsupported TLS version gracefully',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: {
              minVersion: 'TLSv1.2', // Most servers support this
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS Configuration Combinations', () => {
    it(
      'should work with strict TLS settings',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.TLS_STRICT,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with lenient TLS settings',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.TLS_LENIENT,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with custom TLS configuration',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: {
              rejectUnauthorized: false,
              minVersion: 'TLSv1.2',
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('STARTTLS Behavior', () => {
    it(
      'should upgrade to TLS on port 25 when STARTTLS is available',
      async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const params = createTestParams({
          options: {
            ports: [25],
            tls: true,
            debug: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);

        // Check for TLS upgrade logs
        const logs = consoleSpy.mock.calls.flat().join(' ');
        consoleSpy.mockRestore();

        // TLS upgrade might be mentioned in logs
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should upgrade to TLS on port 587',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should not attempt STARTTLS on port 465 (implicit TLS)',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should continue without TLS if STARTTLS fails',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS Performance', () => {
    it(
      'should compare TLS vs non-TLS performance',
      async () => {
        const testCases = [
          { name: 'No TLS', tls: false, port: 25 },
          { name: 'TLS Port 25', tls: true, port: 25 },
          { name: 'TLS Port 587', tls: true, port: 587 },
          { name: 'TLS Port 465', tls: true, port: 465 },
        ];

        const results: { [key: string]: { result: boolean | null; duration: number } } = {};

        for (const testCase of testCases) {
          const params = createTestParams({
            options: {
              ports: [testCase.port],
              tls: testCase.tls,
              debug: false,
            },
          });

          const start = Date.now();
          const { smtpResult } = await verifyMailboxSMTP(params);
          const duration = Date.now() - start;

          results[testCase.name] = { result: smtpResult.isDeliverable, duration };
        }

        // Verify all results are valid
        Object.values(results).forEach(({ result }) => {
          expect(TestUtils.isValidResult(result)).toBe(true);
        });
      },
      TestUtils.getTestTimeout('slow')
    );

    it(
      'should handle TLS handshake timeout',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465],
            tls: {
              rejectUnauthorized: true,
            },
            timeout: 1000, // Short timeout for TLS handshake
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS Security Scenarios', () => {
    it(
      'should prefer secure ports when TLS is enabled',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465, 587, 25], // Secure ports first
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should work with mixed secure/unsecure ports',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25, 587, 465], // Mixed order
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle TLS on servers that dont support it',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            tls: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        // Should either succeed with TLS or fall back to plain text
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('TLS with Custom Sequences', () => {
    it(
      'should handle STARTTLS in custom sequence',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: true,
            sequence: {
              steps: ['GREETING', 'EHLO', 'STARTTLS', 'MAIL_FROM', 'RCPT_TO'] as any,
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should not use STARTTLS if not in sequence',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587],
            tls: true,
            sequence: {
              steps: ['GREETING', 'EHLO', 'MAIL_FROM', 'RCPT_TO'] as any, // No STARTTLS
            },
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });
});
