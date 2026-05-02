/**
 * STARTTLS upgrade tests for `verifyMailboxSMTP`.
 *
 * fake-net's mock returns the same script for every connection, so we can't
 * (yet) simulate a complete TLS handshake mid-stream — these tests cover the
 * pre-handshake decision matrix:
 *
 *   - 'auto' + EHLO advertises STARTTLS → STARTTLS sent
 *   - 'auto' + no advertisement          → STARTTLS NOT sent
 *   - 'never' + advertisement            → STARTTLS NOT sent
 *   - 'force' + no advertisement         → STARTTLS sent
 *   - implicit-TLS port (465)            → STARTTLS NEVER sent
 *   - server rejects STARTTLS with 5xx   → tls_upgrade_failed
 *
 * The actual TLS handshake (and what happens after) is out of fake-net's
 * scope — those paths land on integration tests against a real MX.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { verifyMailboxSMTP } from '../../src/smtp-verifier';
import { fakeNet } from '../helpers/fake-net';

const STARTTLS_ADVERTISED_EHLO = ['220 mx.example.com ESMTP', '250-mx.example.com Hello', '250-STARTTLS', '250 OK'];
const NO_STARTTLS_EHLO = ['220 mx.example.com ESMTP', '250 mx.example.com Hello'];

function envelopeAfterEhlo(): string[] {
  return [
    '250 sender ok',
    '250 recipient ok', // real RCPT
    '550 5.1.1 unknown user', // probe RCPT
    '250 reset', // RSET
  ];
}

describe('0115 SMTP — STARTTLS opt-in / opt-out', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('auto + EHLO advertises STARTTLS → STARTTLS command is sent', async () => {
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, '220 ready', ...envelopeAfterEhlo()]);

    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, startTls: 'auto', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(1);
  });

  it('auto + no advertisement → STARTTLS NOT sent, MAIL FROM goes plain', async () => {
    fakeNet.script([...NO_STARTTLS_EHLO, ...envelopeAfterEhlo()]);

    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, startTls: 'auto', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(0);
    const mailFromCommands = fakeNet.writes.filter((w) => w.data.startsWith('MAIL FROM'));
    expect(mailFromCommands.length).toBe(1);
  });

  it('never + EHLO advertises STARTTLS → STARTTLS NOT sent', async () => {
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, ...envelopeAfterEhlo()]);

    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, startTls: 'never', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(0);
  });

  it('force + EHLO without STARTTLS → STARTTLS sent anyway (testing escape hatch)', async () => {
    // No STARTTLS advertisement, server rejects STARTTLS — verifies the
    // command is sent even without advertisement.
    fakeNet.script([...NO_STARTTLS_EHLO, '502 STARTTLS not supported']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, startTls: 'force', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(1);
    expect(smtpResult.error).toBe('tls_upgrade_failed');
  });

  it('implicit-TLS port 465 → STARTTLS NEVER sent regardless of mode', async () => {
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, ...envelopeAfterEhlo()]);

    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [465], timeout: 200, startTls: 'auto', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(0);
  });

  it('server returns 502 to STARTTLS in auto mode → tls_upgrade_failed', async () => {
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, '502 STARTTLS not supported']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, startTls: 'auto', pipelining: 'never' },
    });

    expect(smtpResult.error).toBe('tls_upgrade_failed');
    expect(smtpResult.canConnectSmtp).toBe(false);
  });

  it('port 25, EHLO advertises STARTTLS, auto → STARTTLS sent (not just for 587)', async () => {
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, '220 ready', ...envelopeAfterEhlo()]);

    await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [25], timeout: 200, startTls: 'auto', pipelining: 'never' },
    });

    const startTlsCommands = fakeNet.writes.filter((w) => w.data.startsWith('STARTTLS'));
    expect(startTlsCommands.length).toBe(1);
  });

  it('STARTTLS is in the default sequence (no caller override needed)', async () => {
    // No `sequence` override — default flow should include startTls.
    fakeNet.script([...STARTTLS_ADVERTISED_EHLO, '502 nope']);

    const { smtpResult } = await verifyMailboxSMTP({
      local: 'alice',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200, pipelining: 'never' },
    });

    // Default behavior should be 'auto' (i.e. attempt the upgrade when advertised).
    expect(smtpResult.error).toBe('tls_upgrade_failed');
  });
});
