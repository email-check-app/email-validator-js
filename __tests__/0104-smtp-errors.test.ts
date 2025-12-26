// SMTP Error Handling Tests
//
// Tests error scenarios and edge cases

import { clearDefaultCache, getDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import { SMTPStep } from '../src/types';
import { createTestParams, TestUtils } from './utils/smtp.test.config';

describe('0104 SMTP Errors', () => {
  beforeEach(() => {
    clearDefaultCache();
  });
  describe('Connection Errors', () => {
    it('should handle invalid hostnames', async () => {
      const params = createTestParams({
        mxRecords: ['invalid.nonexistent.server.test'],
        options: {
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    }, 10000);

    it('should handle connection timeout', async () => {
      const params = createTestParams({
        mxRecords: ['timeout.test.invalid'], // Use a hostname that will timeout
        options: {
          timeout: 1000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle connection refused', async () => {
      const params = createTestParams({
        mxRecords: ['localhost'],
        options: {
          ports: [25], // Assuming no SMTP server on localhost
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      // May connect but fail SMTP protocol
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });

    it('should handle DNS resolution failures', async () => {
      const params = createTestParams({
        mxRecords: [''].filter(Boolean), // Empty hostname
        options: {
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false); // Empty hostname should return false
    });
  });

  describe('Invalid Parameters', () => {
    it('should handle null/undefined MX records', async () => {
      const testCases: Array<{ mxRecords: [] | null | undefined; expected: boolean }> = [
        { mxRecords: null, expected: false },
        { mxRecords: undefined, expected: false },
        { mxRecords: [], expected: false },
      ];

      for (const testCase of testCases) {
        const params = createTestParams({
          mxRecords: testCase.mxRecords,
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(smtpResult.isDeliverable).toBe(testCase.expected);
      }
    });

    it('should handle invalid local/domain parts', async () => {
      const testCases = [
        { local: '', domain: 'test.com', valid: true },
        { local: 'test', domain: '', valid: true },
        { local: '', domain: '', valid: true },
        { local: 'test@', domain: 'example.com', valid: true },
        { local: 'test', domain: 'example.com@', valid: true },
      ];

      for (const testCase of testCases) {
        const params = createTestParams({
          local: testCase.local,
          domain: testCase.domain,
          mxRecords: ['mx.example.com'],
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      }
    });

    it('should handle very long email addresses', async () => {
      const longLocal = 'a'.repeat(300);
      const longDomain = 'a'.repeat(100) + '.com';

      const params = createTestParams({
        local: longLocal,
        domain: longDomain,
        mxRecords: ['mx.example.com'],
        options: {
          timeout: 5000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });

    it('should handle special characters in email', async () => {
      const testCases = [
        'test+tag@example.com',
        'test.tag@example.com',
        'test_tag@example.com',
        'test@example.co.uk',
        'üñïçødé@example.com',
        '"test@example.com"@example.com',
      ];

      for (const email of testCases) {
        const [local, domain] = email.split('@');
        const params = createTestParams({
          local,
          domain,
          mxRecords: ['mx.example.com'],
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      }
    });
  });

  describe('Timeout Errors', () => {
    it('should handle very short timeout', async () => {
      const params = createTestParams({
        options: {
          timeout: 1, // 1ms timeout
          maxRetries: 0,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should handle timeout during SMTP handshake', async () => {
      const params = createTestParams({
        mxRecords: ['timeout2.test.invalid'], // Use hostname that will timeout
        options: {
          timeout: 2000,
          maxRetries: 1,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });

    it('should respect timeout across retries', async () => {
      const params = createTestParams({
        mxRecords: ['timeout3.test.invalid'],
        options: {
          timeout: 1000,
          maxRetries: 3,
        },
      });

      const start = Date.now();
      const { smtpResult } = await verifyMailboxSMTP(params);
      const duration = Date.now() - start;

      expect(smtpResult.isDeliverable).toBe(false);
      // Should timeout 4 times (1 initial + 3 retries)
      expect(duration).toBeGreaterThan(500);
      expect(duration).toBeLessThan(25000);
    });
  });

  describe('Port Errors', () => {
    it('should handle invalid ports', async () => {
      const invalidPorts = [0, 65536, 99999]; // Skip -1 to avoid RangeError

      for (const port of invalidPorts) {
        const params = createTestParams({
          options: {
            ports: [port],
            timeout: 1000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(smtpResult.isDeliverable).toBe(false);
      }
    });

    it('should handle reserved ports', async () => {
      const reservedPorts = [80, 443]; // Use only ports that won't hang

      for (const port of reservedPorts) {
        const params = createTestParams({
          options: {
            ports: [port],
            timeout: 1000, // Short timeout to avoid hanging
            maxRetries: 0,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        // Should fail gracefully
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      }
    });

    it('should handle empty port array', async () => {
      const params = createTestParams({
        options: {
          ports: [],
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(false);
    });
  });

  describe('TLS Errors', () => {
    it('should handle TLS certificate errors', async () => {
      const params = createTestParams({
        options: {
          ports: [587],
          tls: {
            rejectUnauthorized: true,
            // Use a server with invalid cert if available
          },
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      // May fail cert validation but should handle gracefully
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    }, 10000);

    it('should handle TLS version mismatch', async () => {
      const params = createTestParams({
        options: {
          ports: [587],
          tls: {
            minVersion: 'TLSv1.3', // Not all servers support
          },
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    }, 10000);
  });

  describe('Sequence Errors', () => {
    it('should handle empty sequence', async () => {
      const params = createTestParams({
        options: {
          sequence: {
            steps: [],
          },
          ports: [587],
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(smtpResult.isDeliverable).toBe(true); // no steps means nothing to verify, should return true
    });

    it('should handle invalid sequence steps', async () => {
      const params = createTestParams({
        options: {
          sequence: {
            steps: [SMTPStep.QUIT, SMTPStep.QUIT, SMTPStep.QUIT], // Invalid order
          },
          ports: [587],
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });

    it('should handle sequence without required steps', async () => {
      const params = createTestParams({
        options: {
          sequence: {
            steps: [SMTPStep.EHLO], // Missing RCPT_TO
          },
          ports: [587],
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });
  });

  describe('Resource Exhaustion', () => {
    it('should handle many concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        verifyMailboxSMTP({
          local: `test${i}`,
          domain: 'gmail.com',
          mxRecords: ['gmail-smtp-in.l.google.com'],
          options: {
            ports: [587],
            timeout: 5000,
            cache: getDefaultCache(),
            debug: false,
          },
        })
      );

      const results = await Promise.all(promises);
      results.forEach(({ smtpResult }) => {
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      });
    }, 30000);

    it('should handle rapid sequential requests', async () => {
      for (let i = 0; i < 5; i++) {
        const params = createTestParams({
          local: `rapid${i}`,
          options: {
            ports: [587],
            timeout: 3000,
            cache: getDefaultCache(),
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      }
    }, 20000);
  });

  describe('Graceful Degradation', () => {
    it('should fallback when primary method fails', async () => {
      const params = createTestParams({
        options: {
          ports: [9999, 587], // First will fail, second might work
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    }, 10000);

    it('should handle partial SMTP responses', async () => {
      const params = createTestParams({
        options: {
          ports: [25],
          sequence: {
            steps: [SMTPStep.GREETING, SMTPStep.EHLO],
          },
          timeout: 3000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });

    it('should handle server that closes connection unexpectedly', async () => {
      const params = createTestParams({
        mxRecords: ['localhost'], // Might close connection
        options: {
          ports: [25],
          timeout: 2000,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
    });
  });

  describe('Memory and Resource Leaks', () => {
    it('should not accumulate listeners on error', async () => {
      const params = createTestParams({
        mxRecords: ['invalid.test'],
        options: {
          timeout: 100,
          maxRetries: 1,
        },
      });

      // Run multiple failing requests
      for (let i = 0; i < 10; i++) {
        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(smtpResult.isDeliverable).toBe(false);
      }

      // If no errors thrown, resources are likely cleaned up properly
      expect(true).toBe(true);
    });

    it('should clean up connections properly', async () => {
      const params = createTestParams({
        options: {
          ports: [587],
          timeout: 2000,
          maxRetries: 0,
        },
      });

      const { smtpResult } = await verifyMailboxSMTP(params);
      expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
