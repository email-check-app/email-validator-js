/**
 * `verifyMailboxSMTP({captureTranscript: true})` exposes the per-port SMTP
 * transcript and command list on the returned `SmtpVerificationResult`. Verifies:
 *   - opt-out (default) — no transcript / commands fields
 *   - opt-in — fields present, properly port-prefixed
 *   - aggregation across multiple port attempts
 *   - ordering preserves command/reply sequence
 *   - returned arrays are snapshots (mutation-safe)
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { verifyMailboxSMTP } from '../src/smtp-verifier';
import { fakeNet } from './helpers/fake-net';

const HAPPY_FLOW = ['220 mx.example.com ESMTP', '250 mx.example.com Hello', '250 sender ok', '250 recipient ok'];

describe('0113 SMTP transcript capture', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('default: no transcript or commands fields on the result', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200 },
    });
    expect(smtpResult.transcript).toBeUndefined();
    expect(smtpResult.commands).toBeUndefined();
  });

  it('captureTranscript=true populates transcript and commands', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    expect(Array.isArray(smtpResult.transcript)).toBe(true);
    expect(Array.isArray(smtpResult.commands)).toBe(true);
    expect(smtpResult.transcript!.length).toBeGreaterThan(0);
    expect(smtpResult.commands!.length).toBeGreaterThan(0);
  });

  it('transcript lines are port-prefixed `<port>|s| <line>`', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    for (const line of smtpResult.transcript ?? []) {
      expect(line.startsWith('25|s| ')).toBe(true);
    }
  });

  it('commands are port-prefixed `<port>|c| <command>`', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    for (const cmd of smtpResult.commands ?? []) {
      expect(cmd.startsWith('25|c| ')).toBe(true);
    }
  });

  it('transcript captures the full server reply sequence', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    const transcript = smtpResult.transcript!;
    // We sent 4 commands → got 4 replies (greeting + 3 step responses).
    expect(transcript.some((l) => l.includes('220 mx.example.com ESMTP'))).toBe(true);
    expect(transcript.some((l) => l.includes('250 mx.example.com Hello'))).toBe(true);
    expect(transcript.some((l) => l.includes('250 sender ok'))).toBe(true);
    expect(transcript.some((l) => l.includes('250 recipient ok'))).toBe(true);
  });

  it('commands include the ordered EHLO → MAIL FROM → RCPT TO sequence', async () => {
    fakeNet.script(HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    const cmds = smtpResult.commands!;
    expect(cmds.some((c) => c.includes('EHLO'))).toBe(true);
    expect(cmds.some((c) => c.includes('MAIL FROM:<alice@example.com>'))).toBe(true);
    expect(cmds.some((c) => c.includes('RCPT TO:<alice@example.com>'))).toBe(true);
    // Order: EHLO comes before MAIL FROM which comes before RCPT TO.
    const ehloIdx = cmds.findIndex((c) => c.includes('EHLO'));
    const mailIdx = cmds.findIndex((c) => c.includes('MAIL FROM'));
    const rcptIdx = cmds.findIndex((c) => c.includes('RCPT TO'));
    expect(ehloIdx).toBeLessThan(mailIdx);
    expect(mailIdx).toBeLessThan(rcptIdx);
  });

  it('aggregates transcripts across multiple port attempts', async () => {
    // Port 25 unresponsive (times out → indeterminate), port 587 succeeds.
    fakeNet.setUnresponsivePorts([25]);
    fakeNet.scriptByPort(587, HAPPY_FLOW);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], timeout: 50, captureTranscript: true },
    });
    const transcript = smtpResult.transcript ?? [];
    const commands = smtpResult.commands ?? [];
    // Port 25 produced no server lines (silent) but we still see transcript
    // entries from port 587. Commands list includes attempts to both ports.
    expect(transcript.some((l) => l.startsWith('587|s|'))).toBe(true);
    expect(commands.some((c) => c.startsWith('587|c|'))).toBe(true);
  });

  it('preserves transcript even when probe ends in not_found', async () => {
    fakeNet.script(['220 mx.example.com ESMTP', '250 mx.example.com Hello', '250 sender ok', '550 5.1.1 user unknown']);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.transcript!.some((l) => l.includes('550 5.1.1 user unknown'))).toBe(true);
  });

  it('returned arrays are snapshots — mutating them does not affect later calls', async () => {
    fakeNet.script(HAPPY_FLOW);
    const first = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    first.smtpResult.transcript!.push('garbage');
    first.smtpResult.commands!.push('garbage');

    fakeNet.script(HAPPY_FLOW);
    const second = await verifyMailboxSMTP({
      local: 'bob',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, captureTranscript: true },
    });
    expect(second.smtpResult.transcript).not.toContain('garbage');
    expect(second.smtpResult.commands).not.toContain('garbage');
  });

  it('all-ports-failed result still carries aggregated transcript when capture is on', async () => {
    fakeNet.setConnectError('ECONNREFUSED');
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25, 587], timeout: 100, captureTranscript: true },
    });
    expect(smtpResult.error).toBe('All SMTP connection attempts failed');
    // Both arrays exist (may be empty since connection errored before any data).
    expect(Array.isArray(smtpResult.transcript)).toBe(true);
    expect(Array.isArray(smtpResult.commands)).toBe(true);
  });
});
