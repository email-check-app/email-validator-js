/**
 * Smoke tests for the configuration presets exported from
 * `@emailcheck/email-validator-js` — `SMTP_PRESETS` (for `verifyMailboxSMTP`)
 * and `VERIFY_EMAIL_PRESETS` (for `verifyEmail`).
 *
 * These don't exhaustively re-test the underlying options — `0117-smtp-control-options.test.ts`
 * covers each option's behavior. Here we just confirm:
 *   - presets are exported
 *   - their shapes match the option types
 *   - the field names are spreadable into the relevant params object
 */
import { describe, expect, it } from 'bun:test';
import { SMTP_PRESETS, VERIFY_EMAIL_PRESETS } from '../../src';

describe('0118 presets — SMTP_PRESETS', () => {
  it('exports four named presets', () => {
    expect(Object.keys(SMTP_PRESETS).sort()).toEqual(['batch', 'dedicated', 'fast', 'serverless']);
  });

  it('serverless: tight latency budget — bounded total deadline + max-MX', () => {
    expect(SMTP_PRESETS.serverless.totalDeadlineMs).toBe(5000);
    expect(SMTP_PRESETS.serverless.maxConsecutiveFailures).toBe(3);
    expect(SMTP_PRESETS.serverless.maxMxHosts).toBe(2);
    // No retries — fail fast on tight handlers.
    expect('retry' in SMTP_PRESETS.serverless).toBe(false);
  });

  it('dedicated: not latency-bound, retries connection-class failures once', () => {
    expect(SMTP_PRESETS.dedicated.retry).toEqual({
      attempts: 1,
      delayMs: 500,
      backoff: 'exponential',
    });
    expect(SMTP_PRESETS.dedicated.totalDeadlineMs).toBe(30_000);
  });

  it('batch: longer deadlines, two retries with exponential backoff', () => {
    expect(SMTP_PRESETS.batch.retry?.attempts).toBe(2);
    expect(SMTP_PRESETS.batch.retry?.backoff).toBe('exponential');
    expect(SMTP_PRESETS.batch.totalDeadlineMs).toBe(60_000);
  });

  it('fast: sub-3s wall-clock, single MX', () => {
    expect(SMTP_PRESETS.fast.totalDeadlineMs).toBe(3000);
    expect(SMTP_PRESETS.fast.maxMxHosts).toBe(1);
  });

  it('every preset is spreadable into SMTPVerifyOptions without TS error', () => {
    // Compile-time assertion — if this typechecks, the shape is correct.
    const opts1 = { ...SMTP_PRESETS.serverless, ports: [25, 587] };
    const opts2 = { ...SMTP_PRESETS.fast, debug: true };
    expect(opts1.ports).toEqual([25, 587]);
    expect(opts2.debug).toBe(true);
  });
});

describe('0118 presets — VERIFY_EMAIL_PRESETS', () => {
  it('exports four named presets matching SMTP_PRESETS', () => {
    expect(Object.keys(VERIFY_EMAIL_PRESETS).sort()).toEqual(['batch', 'dedicated', 'fast', 'serverless']);
  });

  it('uses the smtp-prefixed VerifyEmailParams field names', () => {
    expect(VERIFY_EMAIL_PRESETS.serverless.smtpTotalDeadlineMs).toBe(5000);
    expect(VERIFY_EMAIL_PRESETS.serverless.smtpMaxConsecutiveFailures).toBe(3);
    expect(VERIFY_EMAIL_PRESETS.serverless.smtpMaxMxHosts).toBe(2);
    expect(VERIFY_EMAIL_PRESETS.serverless.whoisTimeoutMs).toBe(3000);
  });

  it('values match the unprefixed SMTP_PRESETS field-for-field', () => {
    // serverless
    expect(VERIFY_EMAIL_PRESETS.serverless.smtpPerAttemptTimeoutMs).toBe(SMTP_PRESETS.serverless.perAttemptTimeoutMs);
    expect(VERIFY_EMAIL_PRESETS.serverless.smtpTotalDeadlineMs).toBe(SMTP_PRESETS.serverless.totalDeadlineMs);
    // dedicated
    expect(VERIFY_EMAIL_PRESETS.dedicated.smtpRetry).toEqual(SMTP_PRESETS.dedicated.retry);
    // batch
    expect(VERIFY_EMAIL_PRESETS.batch.smtpRetry).toEqual(SMTP_PRESETS.batch.retry);
    // fast
    expect(VERIFY_EMAIL_PRESETS.fast.smtpMaxMxHosts).toBe(SMTP_PRESETS.fast.maxMxHosts);
  });

  it('every preset is spreadable into VerifyEmailParams without TS error', () => {
    const params = {
      emailAddress: 'alice@example.com',
      ...VERIFY_EMAIL_PRESETS.serverless,
      verifySmtp: true,
    };
    expect(params.emailAddress).toBe('alice@example.com');
    expect(params.verifySmtp).toBe(true);
  });
});
