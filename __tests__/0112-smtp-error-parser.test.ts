/**
 * Tests for `parseSmtpError` — the public utility that classifies free-form
 * SMTP error strings (the kind you get from `result.smtp.error`, a thrown
 * exception's `.message`, or a logged bounce). The package's own SMTP probe
 * does its classification at the wire level and does NOT call this helper;
 * this is for external consumers who already have a flattened message in hand.
 *
 * The function returns four orthogonal flags — a single message can match
 * multiple categories (e.g. a 552 quota response is both `hasFullInbox` and
 * `isInvalid: false`).
 */
import { describe, expect, it } from 'bun:test';
import { parseSmtpError } from '../src/smtp-error-parser';

describe('0112 parseSmtpError — empty / null inputs', () => {
  it('returns isInvalid for empty string (no signal to classify)', () => {
    expect(parseSmtpError('')).toEqual({
      isDisabled: false,
      hasFullInbox: false,
      isCatchAll: false,
      isInvalid: true,
    });
  });

  it('handles null-ish input via `?? ""` guard', () => {
    // The function nulls-coalesces; this test pins down the contract.
    expect(parseSmtpError(undefined as unknown as string).isInvalid).toBe(true);
    expect(parseSmtpError(null as unknown as string).isInvalid).toBe(true);
  });
});

describe('0112 parseSmtpError — network errors short-circuit', () => {
  // Network errors get the canonical "isInvalid only" shape — we don't have
  // recipient-level info, so all the recipient signals are forced false.
  for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET']) {
    it(`treats ${code} as network → isInvalid only`, () => {
      const out = parseSmtpError(`Error: ${code} 1.2.3.4:25`);
      expect(out).toEqual({
        isDisabled: false,
        hasFullInbox: false,
        isCatchAll: false,
        isInvalid: true,
      });
    });
  }

  it('treats "socket hang up" as network', () => {
    expect(parseSmtpError('socket hang up').isInvalid).toBe(true);
  });

  it('treats internal sentinel "connection_timeout" as network', () => {
    expect(parseSmtpError('connection_timeout').isInvalid).toBe(true);
  });

  it('network-error short-circuit overrides quota-looking text', () => {
    // White-box: even if a network message contains "over quota" verbatim,
    // the network branch returns first.
    const out = parseSmtpError('ETIMEDOUT while reporting over quota');
    expect(out.hasFullInbox).toBe(false);
    expect(out.isInvalid).toBe(true);
  });
});

describe('0112 parseSmtpError — disabled / non-existent recipient', () => {
  for (const message of [
    '550 user unknown',
    '551 not local',
    '553 mailbox name not allowed',
    'recipient address rejected',
    'no such user',
    'user does not exist',
    'mailbox unavailable',
    'account is disabled',
    'account locked',
    'user blocked',
  ]) {
    it(`flags isDisabled=true for: "${message}"`, () => {
      expect(parseSmtpError(message).isDisabled).toBe(true);
    });
  }

  it('case-insensitive — "USER UNKNOWN" still hits', () => {
    expect(parseSmtpError('550 USER UNKNOWN').isDisabled).toBe(true);
  });

  it('keeps isCatchAll false when recipient is rejected (not accepted)', () => {
    expect(parseSmtpError('recipient address rejected').isCatchAll).toBe(false);
  });

  it('isInvalid is false when isDisabled fires (covered by a stronger signal)', () => {
    const out = parseSmtpError('550 user unknown');
    expect(out.isDisabled).toBe(true);
    expect(out.isInvalid).toBe(false);
  });
});

describe('0112 parseSmtpError — full inbox / over quota', () => {
  for (const message of [
    '552 mailbox over quota',
    '452 4.2.2 quota exceeded',
    'mailbox full',
    'inbox full',
    'storage limit exceeded',
    'insufficient storage',
    'overquota',
  ]) {
    it(`flags hasFullInbox=true for: "${message}"`, () => {
      expect(parseSmtpError(message).hasFullInbox).toBe(true);
    });
  }

  it('552 prefix triggers hasFullInbox even without keywords', () => {
    expect(parseSmtpError('552 some custom mailbox text').hasFullInbox).toBe(true);
  });

  it('452 prefix triggers hasFullInbox', () => {
    expect(parseSmtpError('452 try later').hasFullInbox).toBe(true);
  });
});

describe('0112 parseSmtpError — catch-all', () => {
  for (const message of [
    'accept all mail',
    'catch-all enabled',
    'catchall',
    'wildcard recipient',
    'recipient address accepted',
  ]) {
    it(`flags isCatchAll=true for: "${message}"`, () => {
      expect(parseSmtpError(message).isCatchAll).toBe(true);
    });
  }
});

describe('0112 parseSmtpError — rate limiting / temporary', () => {
  for (const message of [
    '421 try again later',
    '450 greylisted',
    '451 temporarily deferred',
    'rate limit exceeded',
    'greylisted',
    'too many messages',
  ]) {
    it(`marks "${message}" isInvalid=false (transient, not a hard reject)`, () => {
      const out = parseSmtpError(message);
      // Rate-limit messages should NOT be classified as invalid by default —
      // callers can choose to retry. None of disabled/full/catch-all should fire.
      expect(out.isInvalid).toBe(false);
      expect(out.isDisabled).toBe(false);
      expect(out.hasFullInbox).toBe(false);
      expect(out.isCatchAll).toBe(false);
    });
  }

  it('421 prefix without keyword still triggers rate-limit treatment', () => {
    const out = parseSmtpError('421 something');
    expect(out.isInvalid).toBe(false);
  });
});

describe('0112 parseSmtpError — orthogonality (multiple signals)', () => {
  it('a "552 mailbox unavailable" reply fires both hasFullInbox AND isDisabled', () => {
    // 552 → hasFullInbox; "mailbox unavailable" → isDisabled.
    // The function reports both independently.
    const out = parseSmtpError('552 mailbox unavailable');
    expect(out.hasFullInbox).toBe(true);
    expect(out.isDisabled).toBe(true);
  });

  it('isInvalid is suppressed by ANY other positive signal', () => {
    // White-box regression: isInvalid should be false when any of disabled/
    // full/catch-all fire, otherwise the caller would double-count the address.
    const disabled = parseSmtpError('user unknown');
    const full = parseSmtpError('mailbox full');
    const ca = parseSmtpError('catch-all');
    expect(disabled.isInvalid).toBe(false);
    expect(full.isInvalid).toBe(false);
    expect(ca.isInvalid).toBe(false);
  });
});

describe('0112 parseSmtpError — false-positive guards', () => {
  it('a benign 250 OK response is classified as isInvalid (no positive signal)', () => {
    // Note: this function classifies ERROR strings; if a caller passes a 250
    // OK by accident, we report isInvalid=true because nothing else fires.
    // Black-box documentation of this default.
    const out = parseSmtpError('250 OK');
    expect(out.isInvalid).toBe(true);
    expect(out.isDisabled).toBe(false);
    expect(out.hasFullInbox).toBe(false);
  });

  it('does NOT mistake "Storage Inc." in a domain for isFullInbox', () => {
    // "storage" alone is NOT in the patterns; we look for "storage space" /
    // "storage limit exceeded" specifically.
    const out = parseSmtpError('Email rejected: contact Storage Inc.');
    expect(out.hasFullInbox).toBe(false);
  });

  it('does NOT match "550" inside the body if it does not start the line', () => {
    // White-box: the code-prefix check is `startsWith`, not `includes`. A
    // server quoting "see RFC 5550" should NOT be classified as disabled.
    const out = parseSmtpError('see RFC 5550 for details');
    expect(out.isDisabled).toBe(false);
  });
});

describe('0112 parseSmtpError — re-export through main entry', () => {
  it('is reachable from `@emailcheck/email-validator-js` root', async () => {
    const { parseSmtpError: fromIndex } = await import('../src');
    expect(fromIndex('550 user unknown').isDisabled).toBe(true);
  });
});
