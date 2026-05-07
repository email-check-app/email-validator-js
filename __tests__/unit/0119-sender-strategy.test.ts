/**
 * Unit tests for the SMTP sender-strategy resolver.
 *
 * The resolver is a pure function — no fake-net needed. We assert that each
 * `kind` produces the expected `MAIL FROM:` payload, and that randomization
 * uses a recognizable structure so probes can be filtered downstream.
 */

import { describe, expect, it } from 'bun:test';
import { resolveSenderAddress, type SMTPSenderStrategy } from '../../src';

const RECIPIENT = { local: 'alice', domain: 'example.com' };

describe('0119 sender-strategy resolver', () => {
  describe('null-sender', () => {
    it('returns the literal `<>` for null-sender', () => {
      expect(resolveSenderAddress({ kind: 'null-sender' }, RECIPIENT)).toBe('<>');
    });

    it('ignores the recipient — null-sender is unconditional', () => {
      expect(resolveSenderAddress({ kind: 'null-sender' }, { local: 'x', domain: 'y.test' })).toBe('<>');
    });
  });

  describe('fixed', () => {
    it('wraps a bare address in angle brackets', () => {
      const out = resolveSenderAddress({ kind: 'fixed', address: 'verify@x.com' }, RECIPIENT);
      expect(out).toBe('<verify@x.com>');
    });

    it('does not double-wrap when caller already supplied brackets', () => {
      const out = resolveSenderAddress({ kind: 'fixed', address: '<verify@x.com>' }, RECIPIENT);
      expect(out).toBe('<verify@x.com>');
    });

    it('passes through `<>` when supplied as the address', () => {
      // Edge case — `fixed` with `<>` is functionally null-sender; we don't
      // re-route it but we also don't break it. Idempotent wrap means it's
      // returned as-is.
      const out = resolveSenderAddress({ kind: 'fixed', address: '<>' }, RECIPIENT);
      expect(out).toBe('<>');
    });
  });

  describe('random-at-recipient', () => {
    it('produces a randomized local-part on the recipient domain', () => {
      const out = resolveSenderAddress({ kind: 'random-at-recipient' }, RECIPIENT);
      // Format: <probe-{16 hex}@example.com>
      expect(out).toMatch(/^<probe-[0-9a-f]{16}@example\.com>$/);
    });

    it('honours a custom local prefix', () => {
      const out = resolveSenderAddress({ kind: 'random-at-recipient', localPrefix: 'verify' }, RECIPIENT);
      expect(out).toMatch(/^<verify-[0-9a-f]{16}@example\.com>$/);
    });

    it('produces different local-parts on successive calls (sanity)', () => {
      // 8 bytes of randomness — the probability of a collision in two calls
      // is 1/2^64. If this fails we have either a broken PRNG or RNG seeding.
      const a = resolveSenderAddress({ kind: 'random-at-recipient' }, RECIPIENT);
      const b = resolveSenderAddress({ kind: 'random-at-recipient' }, RECIPIENT);
      expect(a).not.toBe(b);
    });
  });

  describe('random-at-domain', () => {
    it('uses the configured domain, not the recipient', () => {
      const out = resolveSenderAddress({ kind: 'random-at-domain', domain: 'sender.test' }, RECIPIENT);
      expect(out).toMatch(/^<probe-[0-9a-f]{16}@sender\.test>$/);
    });

    it('honours a custom local prefix', () => {
      const out = resolveSenderAddress(
        { kind: 'random-at-domain', domain: 'sender.test', localPrefix: 'q' },
        RECIPIENT
      );
      expect(out).toMatch(/^<q-[0-9a-f]{16}@sender\.test>$/);
    });
  });

  describe('custom', () => {
    it('returns whatever the build function produces, verbatim', () => {
      const strategy: SMTPSenderStrategy = {
        kind: 'custom',
        build: ({ domain }) => `<bounce+${domain}@bounce.test>`,
      };
      expect(resolveSenderAddress(strategy, RECIPIENT)).toBe('<bounce+example.com@bounce.test>');
    });

    it('does not wrap or transform the build output (caller is responsible)', () => {
      // `custom` is a full escape hatch — if a user returns `<>` we send `<>`,
      // if they return a bare address we send a bare address. Caller's call.
      const strategy: SMTPSenderStrategy = { kind: 'custom', build: () => '<>' };
      expect(resolveSenderAddress(strategy, RECIPIENT)).toBe('<>');
    });

    it('passes the recipient local + domain to the builder', () => {
      const captured: Array<{ local: string; domain: string }> = [];
      const strategy: SMTPSenderStrategy = {
        kind: 'custom',
        build: (r) => {
          captured.push(r);
          return '<x@y.com>';
        },
      };
      resolveSenderAddress(strategy, { local: 'bob', domain: 'b.test' });
      expect(captured).toEqual([{ local: 'bob', domain: 'b.test' }]);
    });

    it('passes a defensive copy — mutating the recipient inside `build` is harmless', () => {
      // Guard against a buggy `build` mutating shared state.
      const strategy: SMTPSenderStrategy = {
        kind: 'custom',
        build: (r) => {
          (r as { local: string }).local = 'HACKED';
          return '<x@y.com>';
        },
      };
      const original = { local: 'bob', domain: 'b.test' };
      resolveSenderAddress(strategy, original);
      expect(original.local).toBe('bob');
    });
  });
});
