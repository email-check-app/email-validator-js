// SMTP Port Configuration Tests
//
// Tests different port configurations and behaviors

import { clearDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import { createTestParams, measureTime, TEST_CONFIGS, TEST_DATA, TestUtils } from './smtp.test.config';

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

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
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

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
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

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
        expect(TestUtils.isValidResult(result)).toBe(true);
        console.log(`Port 465 verification completed in ${duration}ms: ${result}`);
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

      const result = await verifyMailboxSMTP(params);
      expect(result).toBeNull();
    });

    it('should handle reserved ports', async () => {
      const params = createTestParams({
        options: {
          ports: [80, 443], // HTTP/HTTPS ports
          timeout: 2000,
        },
      });

      const result = await verifyMailboxSMTP(params);
      expect(result).toBeNull();
    });
  });

  describe('Multiple Port Testing', () => {
    it(
      'should test secure ports only [587, 465]',
      async () => {
        const params = createTestParams({
          options: TEST_CONFIGS.SECURE_PORTS_ONLY,
        });

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
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

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Performance with Port Configurations', () => {
    it(
      'should compare single vs multiple port performance',
      async () => {
        const testCases = [
          { name: 'Port 587 only', ports: [587] },
          { name: 'All ports', ports: [25, 587, 465] },
          { name: 'Secure ports', ports: [587, 465] },
        ];

        const results: Record<string, { result: any; duration: number }> = {};

        for (const testCase of testCases) {
          const params = createTestParams({
            options: {
              ports: testCase.ports,
              timeout: 5000,
              debug: false,
            },
          });

          const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
          results[testCase.name] = { result, duration };
          console.log(`${testCase.name}: ${duration}ms`);
        }

        // Verify all results are valid
        Object.values(results).forEach(({ result }) => {
          expect(TestUtils.isValidResult(result)).toBe(true);
        });
      },
      TestUtils.getTestTimeout('slow')
    );

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

        const { result, duration } = await measureTime(() => verifyMailboxSMTP(params));
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

        const result = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(result)).toBe(true);
      },
      TestUtils.getTestTimeout('slow')
    );

    it('should respect maxRetries limit', async () => {
      const params = createTestParams({
        options: {
          ports: [9999], // Will definitely fail
          timeout: 1000,
          maxRetries: 2,
        },
      });

      const start = Date.now();
      const result = await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      expect(result).toBeNull();
      // Should attempt 3 times (initial + 2 retries)
      // With 1 second timeout each, should take at least 3 seconds
      expect(duration).toBeGreaterThan(2500);
    });

    it('should retry with exponential backoff', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const params = createTestParams({
        options: {
          ports: [587],
          timeout: 1, // Very short to trigger immediate retries
          maxRetries: 3,
          debug: true,
        },
      });

      const start = Date.now();
      await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      // Check that debug logs show retry delays
      const logs = consoleSpy.mock.calls.flat().join(' ');
      expect(logs).toContain('Retry');
      expect(logs).toContain('waiting');

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

          const result = await verifyMailboxSMTP(params);
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

      const result = await verifyMailboxSMTP(params);
      expect(result).toBeNull();
    });

    it('should handle port 0', async () => {
      const params = createTestParams({
        options: {
          ports: [0],
          timeout: 1000,
        },
      });

      const result = await verifyMailboxSMTP(params);
      expect(result).toBeNull();
    });

    it('should handle negative port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [-1, 25],
          timeout: 1000,
        },
      });

      const result = await verifyMailboxSMTP(params);
      expect(result).toBe(false);
    });

    it('should handle very high port numbers', async () => {
      const params = createTestParams({
        options: {
          ports: [65535],
          timeout: 1000,
        },
      });

      const result = await verifyMailboxSMTP(params);
      expect(result).toBe(null);
    });
  });
});
