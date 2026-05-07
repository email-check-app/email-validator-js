/**
 * Wire-level assertions: the chosen `SMTPSenderStrategy` actually changes the
 * `MAIL FROM:` bytes sent to the MX. Uses the shared fake-net helper to
 * capture every `socket.write()` call without opening a real connection.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearDefaultCache, SMTPStep, verifyEmail } from '../../src';
import { verifyMailboxSMTP } from '../../src/smtp-verifier';
import { fakeNet } from '../helpers/fake-net';

// Default scripted SMTP envelope — passes through MAIL FROM and the dual-RCPT
// probe so the wire capture includes the MAIL FROM line.
const HAPPY_SCRIPT = [
  '220 mx.example.com ESMTP',
  '250 mx.example.com Hello',
  '250 sender ok', // MAIL FROM accepted
  '250 recipient ok', // real RCPT
  '550 5.1.1 unknown user', // probe RCPT (rejected — not catch-all)
  '250 reset', // RSET
];

function findMailFromLine(): string | undefined {
  return fakeNet.writes.find((w) => w.data.startsWith('MAIL FROM:'))?.data.trim();
}

describe('0120 SMTP MAIL FROM wire format (sender strategies)', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
    fakeNet.script(HAPPY_SCRIPT);
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  describe('verifyMailboxSMTP — direct usage', () => {
    it('sends MAIL FROM:<> when sender strategy is null-sender', async () => {
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: { ports: [25], perAttemptTimeoutMs: 200, sender: { kind: 'null-sender' } },
      });

      expect(findMailFromLine()).toBe('MAIL FROM:<>');
    });

    it('sends MAIL FROM:<verify@x.com> for fixed strategy', async () => {
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: { ports: [25], perAttemptTimeoutMs: 200, sender: { kind: 'fixed', address: 'verify@x.com' } },
      });

      expect(findMailFromLine()).toBe('MAIL FROM:<verify@x.com>');
    });

    it('sends a random-at-recipient envelope on the recipient domain', async () => {
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: { ports: [25], perAttemptTimeoutMs: 200, sender: { kind: 'random-at-recipient' } },
      });

      // Format pinned to <probe-{16 hex}@example.com> — same domain as the recipient.
      expect(findMailFromLine()).toMatch(/^MAIL FROM:<probe-[0-9a-f]{16}@example\.com>$/);
    });

    it('sends a random-at-domain envelope on the configured domain', async () => {
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: { ports: [25], perAttemptTimeoutMs: 200, sender: { kind: 'random-at-domain', domain: 'sender.test' } },
      });

      // Different domain than the recipient — the *configured* sender domain.
      expect(findMailFromLine()).toMatch(/^MAIL FROM:<probe-[0-9a-f]{16}@sender\.test>$/);
    });

    it('sender strategy overrides legacy `sequence.from`', async () => {
      // Both set: high-level `sender` wins. Confirms the precedence chain
      // documented on `SMTPVerifyOptions.sender`.
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: {
          ports: [25],
          perAttemptTimeoutMs: 200,
          sender: { kind: 'null-sender' },
          sequence: {
            steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo],
            from: '<should-be-ignored@x.com>',
          },
        },
      });

      expect(findMailFromLine()).toBe('MAIL FROM:<>');
    });

    it('preserves backwards-compat default (recipient address) when no strategy is set', async () => {
      // Anti-regression guard: existing callers who never set `sender` keep
      // getting `<recipient@domain>` so we don't break them on a minor bump.
      await verifyMailboxSMTP({
        local: 'alice',
        domain: 'example.com',
        mxRecords: ['mx.example.com'],
        options: { ports: [25], perAttemptTimeoutMs: 200 },
      });

      expect(findMailFromLine()).toBe('MAIL FROM:<alice@example.com>');
    });
  });

  describe('verifyEmail — high-level forwarding', () => {
    it('forwards smtpSender from VerifyEmailParams to the SMTP probe', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
      fakeNet.script(HAPPY_SCRIPT);

      await verifyEmail({
        emailAddress: 'alice@example.com',
        verifyMx: true,
        verifySmtp: true,
        smtpPort: 25,
        smtpPerAttemptTimeoutMs: 200,
        smtpSender: { kind: 'null-sender' },
        // Avoid the WHOIS / domain-suggestion / disposable-list noise.
        suggestDomain: false,
        checkDisposable: false,
        checkFree: false,
      });

      expect(findMailFromLine()).toBe('MAIL FROM:<>');
    });

    it('forwards smtpHeloHostname from VerifyEmailParams to the SMTP probe', async () => {
      fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
      fakeNet.script(HAPPY_SCRIPT);

      await verifyEmail({
        emailAddress: 'alice@example.com',
        verifyMx: true,
        verifySmtp: true,
        smtpPort: 25,
        smtpPerAttemptTimeoutMs: 200,
        smtpHeloHostname: 'verify.my-app.com',
        suggestDomain: false,
        checkDisposable: false,
        checkFree: false,
      });

      const ehloLine = fakeNet.writes.find((w) => w.data.startsWith('EHLO '))?.data.trim();
      expect(ehloLine).toBe('EHLO verify.my-app.com');
    });
  });
});
