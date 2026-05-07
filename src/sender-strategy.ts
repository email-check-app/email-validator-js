/**
 * `MAIL FROM:` payload resolution from a `SMTPSenderStrategy` policy.
 *
 * Pure functions — no I/O, no shared state. The randomness comes from
 * `crypto.randomBytes` (same primitive used by the catch-all probe local
 * generator in `smtp-verifier.ts`) so probes can't be fingerprinted by a
 * predictable PRNG.
 */

import { randomBytes } from 'node:crypto';
import type { SMTPSenderStrategy } from './types';

const DEFAULT_LOCAL_PREFIX = 'probe';

/**
 * Resolve a sender strategy into the literal `MAIL FROM:` payload (including
 * angle brackets). Output is ready to drop into `MAIL FROM:${result}`.
 *
 * Examples (with random=`a3x9b7c2deadbeef`):
 *   `{ kind: 'null-sender' }`                            → `<>`
 *   `{ kind: 'fixed', address: 'verify@x.com' }`         → `<verify@x.com>`
 *   `{ kind: 'fixed', address: '<verify@x.com>' }`       → `<verify@x.com>` (already wrapped)
 *   `{ kind: 'random-at-recipient' }` → recipient `alice@gmail.com`
 *                                                        → `<probe-a3x9b7c2deadbeef@gmail.com>`
 *   `{ kind: 'random-at-domain', domain: 'x.com' }`      → `<probe-a3x9b7c2deadbeef@x.com>`
 *   `{ kind: 'custom', build: r => `<x@${r.domain}>` }` → whatever `build` returns
 */
export function resolveSenderAddress(
  strategy: SMTPSenderStrategy,
  recipient: { local: string; domain: string }
): string {
  switch (strategy.kind) {
    case 'null-sender':
      return '<>';
    case 'fixed':
      return wrap(strategy.address);
    case 'random-at-recipient':
      return wrap(`${randomLocal(strategy.localPrefix)}@${recipient.domain}`);
    case 'random-at-domain':
      return wrap(`${randomLocal(strategy.localPrefix)}@${strategy.domain}`);
    case 'custom':
      // Trust the caller — but pass a defensive copy so a buggy `build` can't
      // mutate our internal recipient object via an accidental shared reference.
      return strategy.build({ local: recipient.local, domain: recipient.domain });
  }
}

/** Wrap an address in `<>` unless the caller already did. Idempotent. */
function wrap(address: string): string {
  if (address.startsWith('<') && address.endsWith('>')) return address;
  return `<${address}>`;
}

/** 16-hex-char random local-part with a recognizable prefix. */
function randomLocal(prefix: string | undefined): string {
  // 8 bytes → 16 hex chars: long enough that birthday-collision probability is
  // negligible across realistic probe volumes, short enough to fit comfortably
  // inside the 64-char local-part limit even with the prefix attached.
  const random = randomBytes(8).toString('hex');
  const safePrefix = prefix ?? DEFAULT_LOCAL_PREFIX;
  return `${safePrefix}-${random}`;
}
