/**
 * SMTP verifier unit tests — uses fake-net (no jest.spyOn / no custom FakeSocket).
 * Mocks node:net + node:tls once per process via the shared helper.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearDefaultCache, getDefaultCache, SMTPStep } from '../../src';
import { verifyMailboxSMTP } from '../../src/smtp-verifier';
import { fakeNet } from '../helpers/fake-net';

// Default SMTP envelope: greeting + EHLO multi-line + MAIL FROM + dual-probe
// (real RCPT 250, probe RCPT 550, RSET 250). The probe gets 550 so the test
// asserts isCatchAll === false; tests that need catch-all detection use the
// 6-line script with probe RCPT 250 instead.
const HAPPY_PATH_587 = [
  '220 mx.example.com ESMTP',
  '250-mx.example.com Hello',
  '250 OK',
  '250 sender ok',
  '250 recipient ok', // real RCPT
  '550 5.1.1 unknown user', // probe RCPT (rejected — not catch-all)
  '250 reset', // RSET
];

describe('0110 SMTP Verifier Unit', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  it('returns deliverable for successful default SMTP dialogue', async () => {
    fakeNet.script([
      '220 mx.example.com ESMTP',
      '250 mx.example.com Hello',
      '250 sender ok',
      '250 recipient ok', // real RCPT
      '550 5.1.1 unknown user', // probe RCPT (rejected — not catch-all)
      '250 reset', // RSET
    ]);

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { perAttemptTimeoutMs: 200, ports: [25] },
    });

    expect(port).toBe(25);
    expect(smtpResult.isDeliverable).toBe(true);
    expect(smtpResult.canConnectSmtp).toBe(true);
  });

  it('returns failure when MX records are missing', async () => {
    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: [],
      options: { perAttemptTimeoutMs: 50 },
    });

    expect(port).toBe(0);
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('no_mx_records');
  });

  it('returns not deliverable when RCPT reports mailbox not found', async () => {
    fakeNet.script(['220 mx.example.com ESMTP', '250 mx.example.com Hello', '250 sender ok', '550 5.1.1 User unknown']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { perAttemptTimeoutMs: 200, ports: [587] },
    });

    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('not_found');
  });

  it('treats provider anti-abuse lockout responses as deliverable', async () => {
    fakeNet.script([
      '220 mx.example.com ESMTP',
      '250 mx.example.com Hello',
      '250 sender ok',
      '550 5.7.1 [IRR] Our system has detected unusual activity from your account. Contact your service provider for support',
    ]);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { perAttemptTimeoutMs: 200, ports: [587] },
    });

    expect(smtpResult.isDeliverable).toBe(true);
  });

  it('falls back to next port when first port is unresponsive', async () => {
    fakeNet.setUnresponsivePorts([25]);
    fakeNet.scriptByPort(587, HAPPY_PATH_587);

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], perAttemptTimeoutMs: 100 },
    });

    expect(port).toBe(587);
    expect(smtpResult.isDeliverable).toBe(true);
  });

  it('uses cached SMTP port for same MX host with a different mailbox', async () => {
    // Port 25 fails (500), port 587 succeeds.
    fakeNet.scriptByPort(25, ['220 mx.example.com ESMTP', '250 Hello', '250 sender ok', '500 not accepted']);
    fakeNet.scriptByPort(587, HAPPY_PATH_587);
    const cache = getDefaultCache();

    const first = await verifyMailboxSMTP({
      local: 'first',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], perAttemptTimeoutMs: 200, cache },
    });
    expect(first.port).toBe(587);
    expect(first.portCached).toBe(false);

    const second = await verifyMailboxSMTP({
      local: 'second',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], perAttemptTimeoutMs: 200, cache },
    });
    expect(second.port).toBe(587);
    expect(second.portCached).toBe(true);
    expect(second.smtpResult.isDeliverable).toBe(true);
  });

  it('switches EHLO to HELO for port 25 without mutating caller sequence', async () => {
    fakeNet.script([
      '220 mx.example.com ESMTP',
      '250 Hello',
      '250 sender ok',
      '250 recipient ok', // real RCPT
      '550 5.1.1 unknown user', // probe RCPT
      '250 reset', // RSET
    ]);

    const sequence = {
      steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
    };

    await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], perAttemptTimeoutMs: 200, sequence },
    });

    // The caller's sequence object should be unmutated — the verifier maps EHLO→HELO
    // internally for port 25 without touching the input.
    expect(sequence.steps).toEqual([SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo]);
  });

  it('returns failure when connection fails across all ports', async () => {
    fakeNet.setConnectError('ECONNREFUSED');

    const { smtpResult, port } = await verifyMailboxSMTP({
      local: 'john',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], perAttemptTimeoutMs: 100 },
    });

    expect(port).toBe(0);
    expect(smtpResult.isDeliverable).toBe(false);
    // Last attempt's reason is surfaced — not a generic "all attempts failed".
    expect(smtpResult.error).toBe('connection_error');
  });
});
