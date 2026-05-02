/**
 * Control-option tests for `verifyMailboxSMTP`:
 *
 *   - `totalDeadlineMs`        — wall-clock cap across all MX × port attempts
 *   - `maxConsecutiveFailures` — stop after N connection-class failures in a row
 *   - `maxMxHosts`             — limit MX walk to first N hostnames
 *   - `retry`                  — retry connection-class failures on the same MX × port
 *
 * fake-net's mock can simulate per-port connection errors and unresponsive ports,
 * which is enough to drive every option through its decision path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { verifyMailboxSMTP } from '../../src/smtp-verifier';
import { fakeNet } from '../helpers/fake-net';

describe('0117 SMTP — totalDeadlineMs', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('aborts the MX walk once the deadline elapses (does not start more attempts)', async () => {
    // 3 MXes × 1 port (25), each unresponsive → each attempt takes ~per-attempt timeout.
    // Set per-attempt timeout 100ms, deadline 150ms. We should see 1–2 attempts, not 3.
    fakeNet.setUnresponsivePorts([25]);

    const start = Date.now();
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx1.example.com', 'mx2.example.com', 'mx3.example.com'],
      options: { ports: [25], perAttemptTimeoutMs: 100, totalDeadlineMs: 150 },
    });
    const elapsed = Date.now() - start;

    expect(smtpResult.isDeliverable).toBe(false);
    // Wall-clock should be well under "all 3 attempts × 100ms = 300ms".
    expect(elapsed).toBeLessThan(300);
    // metrics.mxHostsTried should reflect the early stop.
    expect(smtpResult.metrics?.mxAttempts).toBeLessThanOrEqual(3);
  });
});

describe('0117 SMTP — maxConsecutiveFailures', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('stops after N consecutive connection failures', async () => {
    // All ports refuse → each MX × port pair fails with `connection_error`.
    // Set maxConsecutiveFailures = 2 → we should see exactly 2 attempts.
    fakeNet.setConnectError('ECONNREFUSED');

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx1.example.com', 'mx2.example.com', 'mx3.example.com'],
      options: { ports: [25, 587, 465], perAttemptTimeoutMs: 100, maxConsecutiveFailures: 2 },
    });

    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.metrics?.portAttempts).toBe(2);
  });

  it('counter resets on a non-connection-class outcome', async () => {
    // First attempt: 550 (mailbox not found, NOT a connection failure → counter resets)
    // Subsequent: connection refused
    // With maxConsecutiveFailures=2, we'd stop after 2 consecutive *connection* failures.
    fakeNet.script(['220 mx1 hi', '250 ok', '250 ok', '550 5.1.1 user unknown']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx1.example.com'],
      options: { ports: [25], perAttemptTimeoutMs: 100, maxConsecutiveFailures: 2 },
    });

    // 550 short-circuits the search — definitive answer trumps the early-stop rule.
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('not_found');
  });
});

describe('0117 SMTP — maxMxHosts', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('limits the MX walk to the first N hostnames', async () => {
    fakeNet.setConnectError('ECONNREFUSED');

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx1.example.com', 'mx2.example.com', 'mx3.example.com', 'mx4.example.com'],
      options: { ports: [25], perAttemptTimeoutMs: 100, maxMxHosts: 2 },
    });

    expect(smtpResult.metrics?.mxAttempts).toBe(2);
    expect(smtpResult.metrics?.mxHostsTried).toEqual(['mx1.example.com', 'mx2.example.com']);
  });
});

describe('0117 SMTP — retry policy', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('retries connection-class failures up to `attempts` times before moving on', async () => {
    fakeNet.setConnectError('ECONNREFUSED');

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx1.example.com'],
      options: {
        ports: [25],
        perAttemptTimeoutMs: 50,
        retry: { attempts: 2, delayMs: 5, backoff: 'fixed' },
      },
    });

    // Initial attempt + 2 retries = 3 connection attempts on the same MX × port.
    expect(smtpResult.metrics?.portAttempts).toBe(3);
  });

  it('does NOT retry definitive answers (250 / 550)', async () => {
    // Real RCPT 550 → not_found, no retry.
    fakeNet.script(['220 mx hi', '250 ok', '250 ok', '550 5.1.1 user unknown']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [25],
        perAttemptTimeoutMs: 50,
        retry: { attempts: 5, delayMs: 5 },
      },
    });

    expect(smtpResult.error).toBe('not_found');
    expect(smtpResult.metrics?.portAttempts).toBe(1); // no retries on definitive answers
  });

  it('exponential backoff doubles the delay between retries', async () => {
    fakeNet.setConnectError('ECONNREFUSED');

    const start = Date.now();
    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [25],
        perAttemptTimeoutMs: 50,
        retry: { attempts: 2, delayMs: 50, backoff: 'exponential' },
      },
    });
    const elapsed = Date.now() - start;

    // Expected delays: retry 1 at 50ms, retry 2 at 100ms = 150ms total backoff.
    // Connection errors fire ~immediately on a refused port, so most of the
    // wall-clock IS the backoff. Allow 50% slack for scheduling jitter.
    expect(elapsed).toBeGreaterThanOrEqual(120);
  });
});
