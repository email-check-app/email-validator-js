// SMTP Port Configuration Tests
//
// Tests port-specific behavior including single port testing, multiple port
// configurations, port-specific TLS behavior, retry logic, and edge cases.

import { describe as _bunDescribe, beforeEach, expect, it } from 'bun:test';

// Skip the file unless INTEGRATION=1 is set in the env.
const describe = (process.env.INTEGRATION === '1' ? _bunDescribe : _bunDescribe.skip) as typeof _bunDescribe;

import { clearDefaultCache } from '../../src';
import { verifyMailboxSMTP } from '../../src/smtp-verifier';
import { createTestParams, measureTime, TEST_CONFIGS, TEST_DATA, TestUtils } from '../utils/smtp.test.config';

describe('0101 SMTP Ports', () => {
  beforeEach(() => {
    clearDefaultCache();
  });
  describe('Single Port Testing', () => {
    it(
      'should test port 25 only',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SINGLE_PORT_25,
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test port 587 only',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SINGLE_PORT_587,
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test port 465 only',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SINGLE_PORT_465,
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it('should handle invalid port gracefully', async () => {
      const params = createTestParams({
        options: {
          ports: [9999], // Invalid port
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle non-SMTP reserved ports gracefully', async () => {
      const params = createTestParams({
        options: {
          ports: [80, 443], // HTTP/HTTPS ports (not SMTP)
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });
  });

  describe('Multiple Port Testing', () => {
    it(
      'should test secure ports only [587, 465]',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SECURE_PORTS_ONLY,
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test all default ports [25, 587, 465]',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25, 587, 465],
            timeout: 3000,
          },
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test custom port order',
      async () => {
        const params = createTestParams({
          options: {
            ports: [465, 587, 25], // Reverse order
            timeout: 3000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test duplicate ports without issues',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587, 587, 465, 465], // Duplicates
            timeout: 3000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Port-Specific TLS Behavior', () => {
    it(
      'should use STARTTLS on port 25 when available',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            tls: true,
            debug: true, // Enable to see TLS upgrade
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should use STARTTLS on port 587',
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
      'should use implicit TLS on port 465',
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
      'should work without TLS on port 25',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            tls: false,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Performance with Port Configurations', () => {
    it(
      'should find optimal port quickly',
      async () => {
        const params = createTestParams({
          options: {
            ports: [587], // Start with most likely to work
            timeout: 2000,
          },
        });

        const {
          result: { smtpResult },
          duration,
        } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
        expect(duration).toBeLessThan(5000); // Should complete quickly
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Port Retry Logic', () => {
    it(
      'should retry failed port attempts',
      async () => {
        const params = createTestParams({
          options: {
            ports: [25],
            timeout: 1000, // Short timeout to trigger retries
            debug: false,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('slow')
    );

    it('should fail fast when no port responds', async () => {
      const params = createTestParams({
        options: {
          ports: [9999], // Closed port → immediate connection_error or short timeout
          timeout: 1000,
        },
      });

      const start = Date.now();
      const { smtpResult } = await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      expect(smtpResult.isDeliverable).toBe(false);
      // Single port walk is bounded by the timeout — anything under 5s is OK.
      expect(duration).toBeLessThan(5000);
    });

    // Removed: 'should retry with exponential backoff' — the verifier walks ports
    // sequentially and does not retry within a port. Retry/backoff was a feature
    // of the old implementation; the refactor surfaced this dead test.
  });

  describe('Domain-Specific Port Preferences', () => {
    it(
      'should work with different MX servers',
      async () => {
        const domains = [
          { name: 'Gmail', mx: TEST_DATA.MX_RECORDS.gmail, preferredPort: 587 },
          { name: 'Outlook', mx: TEST_DATA.MX_RECORDS.outlook, preferredPort: 587 },
        ];

        for (const domain of domains) {
          const params = createTestParams({
            domain: domain.name.toLowerCase().replace('.', ''),
            mxRecords: domain.mx,
            options: {
              ports: [domain.preferredPort],
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

  describe('Edge Cases', () => {
    it('should handle empty port array', async () => {
      const params = createTestParams({
        options: {
          ports: [],
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle port 0', async () => {
      const params = createTestParams({
        options: {
          ports: [0],
          timeout: 1000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle negative port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [-1, 25],
          timeout: 1000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle very high port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [65535],
          timeout: 1000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });
  });
});
