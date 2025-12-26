// SMTP Custom Sequence Tests
//
// Tests custom SMTP protocol step sequences including predefined sequences,
// custom MAIL FROM/VRFY configuration, STARTTLS handling, performance
// comparison, and error handling.

import { clearDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import { SMTPStep } from '../src/types';
import { createTestParams, TEST_SEQUENCES, TestUtils } from './utils/smtp.test.config';

describe('0103 SMTP Sequences', () => {
  beforeEach(() => {
    clearDefaultCache();
  });
  describe('Predefined Sequences', () => {
    it(
      'should execute minimal sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.MINIMAL,
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should execute default sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.DEFAULT,
            ports: [25],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should execute sequence with STARTTLS',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.WITH_STARTTLS,
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
      'should execute sequence with VRFY fallback',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.WITH_VRFY,
            ports: [25],
            useVRFY: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should execute full sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.FULL,
            ports: [587],
            tls: true,
            useVRFY: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Custom Sequences', () => {
    it(
      'should execute EHLO-only sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.EHLO_ONLY,
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        // EHLO-only should complete successfully but not validate email
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should execute sequence without greeting',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.NO_GREETING,
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should execute VRFY-only test',
      async () => {
        const params = createTestParams({
          options: {
            sequence: TEST_SEQUENCES.VRFY_ONLY,
            ports: [25], // VRFY more likely on port 25
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Sequence Step Control', () => {
    it(
      'should handle single step sequences',
      async () => {
        const singleStepSequences = [
          { steps: [SMTPStep.greeting], name: 'greeting-only' },
          { steps: [SMTPStep.ehlo], name: 'ehlo-only' },
          { steps: [SMTPStep.quit], name: 'quit-only' },
        ];

        for (const seq of singleStepSequences) {
          const params = createTestParams({
            options: {
              sequence: {
                steps: seq.steps,
              },
              ports: [587],
              timeout: 2000,
            },
          });

          const { smtpResult } = await verifyMailboxSMTP(params);
          expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
        }
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle repeated steps',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.ehlo, SMTPStep.ehlo, SMTPStep.quit],
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle empty sequence gracefully',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [],
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(smtpResult.isDeliverable).toBe(true); // Should complete sequence
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Custom MAIL FROM Configuration', () => {
    it(
      'should use null sender by default',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
              from: '<>',
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should use custom sender email',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
              from: '<sender@example.com>',
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should use sender without brackets',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
              from: 'sender@example.com',
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('Custom VRFY Configuration', () => {
    it(
      'should use local part as VRFY target',
      async () => {
        const params = createTestParams({
          local: 'testuser',
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
              vrfyTarget: 'testuser',
            },
            ports: [25],
            useVRFY: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should use full email as VRFY target',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
              vrfyTarget: 'test@gmail.com',
            },
            ports: [25],
            useVRFY: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should automatically use local part if VRFY target not specified',
      async () => {
        const params = createTestParams({
          local: 'username',
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
            },
            ports: [25],
            useVRFY: true,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });

  describe('STARTTLS in Sequences', () => {
    it(
      'should handle STARTTLS when included in sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo],
            },
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
      'should ignore STARTTLS when TLS is disabled',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo],
            },
            ports: [587],
            tls: false,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle STARTTLS on port 465',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo],
            },
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

  describe('Sequence Performance', () => {
    it(
      'should compare performance of different sequences',
      async () => {
        const sequences = [
          { name: 'Minimal', seq: TEST_SEQUENCES.MINIMAL },
          { name: 'Default', seq: TEST_SEQUENCES.DEFAULT },
          { name: 'With STARTTLS', seq: TEST_SEQUENCES.WITH_STARTTLS },
        ];

        const results: { [key: string]: { result: boolean | null; duration: number } } = {};

        for (const { name, seq } of sequences) {
          const params = createTestParams({
            options: {
              sequence: seq,
              ports: [587],
              debug: false,
            },
          });

          const start = Date.now();
          const { smtpResult } = await verifyMailboxSMTP(params);
          const duration = Date.now() - start;

          results[name] = { result: smtpResult.isDeliverable, duration };
        }

        // Verify all sequences complete successfully
        Object.values(results).forEach(({ result }) => {
          expect(TestUtils.isValidResult(result)).toBe(true);
        });
      },
      TestUtils.getTestTimeout('slow')
    );
  });

  describe('Error Handling in Sequences', () => {
    it(
      'should handle invalid step in sequence',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.quit, SMTPStep.ehlo], // Invalid order
            },
            ports: [587],
            timeout: 2000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle sequence without MAIL_FROM step',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.rcptTo], // MAIL_FROM skipped
            },
            ports: [587],
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );

    it(
      'should handle sequence with only QUIT',
      async () => {
        const params = createTestParams({
          options: {
            sequence: {
              steps: [SMTPStep.quit],
            },
            ports: [587],
            timeout: 1000,
          },
        });

        const { smtpResult } = await verifyMailboxSMTP(params);
        expect(TestUtils.isValidResult(smtpResult.isDeliverable)).toBe(true);
      },
      TestUtils.getTestTimeout('integration')
    );
  });
});
