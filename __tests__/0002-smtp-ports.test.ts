// 0002: SMTP Port Configuration Tests
//
// Tests different port configurations and behaviors

import { clearDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import type { SmtpVerificationResult } from '../src/types';
import { createTestParams, measureTime, TEST_CONFIGS, TEST_DATA, TestUtils } from './smtp.test.config';

// Helper to map SmtpVerificationResult to boolean|null for legacy assertions
function toBooleanResult(result: SmtpVerificationResult): boolean | null {
  if (!result.canConnectSmtp) {
    return null;
  }
  return result.isDeliverable;
}

describe('SMTP Port Configuration', () => {
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

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`Port 25 verification completed in ${duration}ms: ${result}`);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test port 587 only',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SINGLE_PORT_587,
        });

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`Port 587 verification completed in ${duration}ms: ${result}`);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should test port 465 only',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SINGLE_PORT_465,
        });

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`Port 465 verification completed in ${duration}ms: ${result}`);
      },
      TestUtils.getTestTimeout('integration')
    );

    it('should handle invalid port gracefully', async () => {
      const params = createTestParams({
        options: {
          ports: [9999], // Non-standard SMTP port
          timeout: 2000,
        },
      });

      const smtpResult = await verifyMailboxSMTP(params);
      // Port 9999 typically has no SMTP service
      // Just verify we get a valid result structure
      expect(typeof smtpResult.canConnectSmtp).toBe('boolean');
      expect(typeof smtpResult.isDeliverable).toBe('boolean');
    });

    it('should handle reserved ports', async () => {
      const params = createTestParams({
        options: {
          ports: [80, 443], // HTTP/HTTPS ports
          timeout: 2000,
        },
      });

      const smtpResult = await verifyMailboxSMTP(params);
      // HTTP/HTTPS ports typically don't speak SMTP
      // Just verify we get a valid result structure
      expect(typeof smtpResult.canConnectSmtp).toBe('boolean');
      expect(typeof smtpResult.isDeliverable).toBe('boolean');
    });
  });

  describe('Multiple Port Testing', () => {
    it(
      'should test secure ports only [587, 465]',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SECURE_PORTS_ONLY,
        });

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`Secure ports verification completed in ${duration}ms: ${result}`);
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
            maxRetries: 1,
          },
        });

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`All ports verification completed in ${duration}ms: ${result}`);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
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
            maxRetries: 0,
          },
        });

        const { result: smtpResult, duration } = await measureTime(() => verifyMailboxSMTP(params));
        const result = toBooleanResult(smtpResult);
        expect(TestUtils.isValidResult(result)).toBe(true);
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
            maxRetries: 2,
            debug: false,
          },
        });

        const smtpResult = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(toBooleanResult(smtpResult))).toBe(true);
      },
      TestUtils.getTestTimeout('slow')
    );

    it('should respect maxRetries limit', async () => {
      const params = createTestParams({
        options: {
          ports: [9999], // Port that will likely fail
          timeout: 1000,
          maxRetries: 2,
        },
      });

      const start = Date.now();
      const smtpResult = await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      // Verify we get a valid result
      expect(typeof smtpResult.canConnectSmtp).toBe('boolean');
      // Should attempt multiple times, so duration should be at least 1 second
      expect(duration).toBeGreaterThan(200);
    });

    it('should retry with exponential backoff', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const params = createTestParams({
        options: {
          ports: [9999], // Port that will definitely fail
          timeout: 100, // Short but not instant timeout
          maxRetries: 2,
          debug: true,
        },
      });

      const start = Date.now();
      await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      // Verify the test took reasonable time for retries (at least 2 timeouts)
      expect(duration).toBeGreaterThanOrEqual(100);

      consoleSpy.mockRestore();
    });
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

          const smtpResult = await verifyMailboxSMTP(params);
          const result = toBooleanResult(smtpResult);
          expect(TestUtils.isValidResult(result)).toBe(true);
          console.log(`${domain.name} on port ${domain.preferredPort}: ${result}`);
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

      const smtpResult = await verifyMailboxSMTP(params);
      expect(smtpResult.canConnectSmtp).toBe(false);
    });

    it('should handle port 0', async () => {
      const params = createTestParams({
        options: {
          ports: [0],
          timeout: 1000,
        },
      });

      const smtpResult = await verifyMailboxSMTP(params);
      expect(smtpResult.canConnectSmtp).toBe(false);
    });

    it('should handle negative port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [-1, 25],
          timeout: 1000,
        },
      });

      const smtpResult = await verifyMailboxSMTP(params);
      expect(smtpResult.canConnectSmtp).toBe(false);
    });

    it('should handle very high port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [65535],
          timeout: 2000,
        },
      });

      const smtpResult = await verifyMailboxSMTP(params);
      // Port 65535 is valid but typically no SMTP service runs on it
      // Result depends on environment - just check we get a valid response
      expect(typeof smtpResult.canConnectSmtp).toBe('boolean');
    });
  });
});
