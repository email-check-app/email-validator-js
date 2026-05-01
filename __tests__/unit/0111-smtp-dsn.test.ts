/**
 * RFC 3463 enhanced status code parsing — the bug-fix that prevents
 * "5.7.1 policy block" from being misclassified as "not_found" (mailbox
 * doesn't exist). This is critical for IP-reputation cases where Gmail and
 * friends return 5xx codes for completely valid mailboxes.
 *
 * Black-box: each public reply pattern → expected ParsedDsn or null.
 * White-box: the integration with isInvalidMailboxError via fake-net SMTP flow.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { parseDsn, verifyMailboxSMTP } from '../../src/smtp-verifier';
import { fakeNet } from '../helpers/fake-net';

describe('0111 parseDsn — RFC 3463 enhanced status codes', () => {
  it('parses a permanent mailbox-not-found code', () => {
    expect(parseDsn('550 5.1.1 user unknown')).toEqual({ class: 5, subject: 1, detail: 1 });
  });

  it('parses a permanent policy block', () => {
    expect(parseDsn('550 5.7.1 policy violation')).toEqual({ class: 5, subject: 7, detail: 1 });
  });

  it('parses a transient timeout', () => {
    expect(parseDsn('421 4.7.0 try again later')).toEqual({ class: 4, subject: 7, detail: 0 });
  });

  it('parses a success status', () => {
    expect(parseDsn('250 2.1.5 recipient ok')).toEqual({ class: 2, subject: 1, detail: 5 });
  });

  it('handles multi-digit subject and detail', () => {
    expect(parseDsn('550 5.123.45 unusual code')).toEqual({ class: 5, subject: 123, detail: 45 });
  });

  it('accepts continuation-line dash separator', () => {
    // Multiline replies use "550-" instead of "550 ".
    expect(parseDsn('550-5.7.1 first line')).toEqual({ class: 5, subject: 7, detail: 1 });
  });

  it('returns null when no DSN code is present', () => {
    expect(parseDsn('250 OK')).toBeNull();
  });

  it('returns null for malformed responses', () => {
    expect(parseDsn('hello there')).toBeNull();
    expect(parseDsn('250 5.x.1 broken')).toBeNull();
    expect(parseDsn('')).toBeNull();
  });

  it('returns null when the SMTP basic code is missing', () => {
    // DSN must follow a 3-digit basic code with space or dash.
    expect(parseDsn('5.1.1 lone DSN')).toBeNull();
  });
});

const HAPPY = ['220 mx.example.com ESMTP', '250 mx.example.com Hello', '250 sender ok'];

describe('0111 isInvalidMailboxError — DSN class-7 carve-out', () => {
  beforeEach(() => fakeNet.reset());
  afterEach(() => fakeNet.reset());

  it('classifies 550 5.1.1 as not_found (real mailbox-doesnt-exist)', async () => {
    fakeNet.script([...HAPPY, '550 5.1.1 user unknown']);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200 },
    });
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('not_found');
  });

  it('does NOT classify 550 5.7.1 as not_found (policy block — could be a real mailbox)', async () => {
    fakeNet.script([...HAPPY, '550 5.7.1 policy violation, message blocked']);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'real-user',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200 },
    });
    // Result must be ambiguous (canConnectSmtp false → null), NOT a hard "not deliverable" verdict.
    expect(smtpResult.error).not.toBe('not_found');
  });

  it('still classifies 550 with junk/spam keyword as ambiguous (existing carve-out)', async () => {
    fakeNet.script([...HAPPY, '550 5.7.0 message rejected as spam']);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'real-user',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200 },
    });
    expect(smtpResult.error).not.toBe('not_found');
  });

  it('classifies 550 5.7.1 [IRR] high-volume as deliverable (provider rate-limit signal)', async () => {
    fakeNet.script([
      ...HAPPY,
      '550 5.7.1 [IRR] Our system has detected unusual activity from your account. Contact your service provider for support',
    ]);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'user',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200 },
    });
    // High-volume heuristic fires before the policy-block guard.
    expect(smtpResult.isDeliverable).toBe(true);
  });

  it('classifies 5xx with no DSN as not_found when it matches the standard prefix', async () => {
    // White-box regression: dropping the DSN parse must not regress the basic
    // 550-prefix classification.
    fakeNet.script([...HAPPY, '550 user unknown']);
    const { smtpResult } = await verifyMailboxSMTP({
      local: 'missing',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: { ports: [587], timeout: 200 },
    });
    expect(smtpResult.isDeliverable).toBe(false);
    expect(smtpResult.error).toBe('not_found');
  });
});
