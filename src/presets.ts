/**
 * Recommended `verifyEmail` / `verifyMailboxSMTP` configuration presets for
 * common deployment shapes.
 *
 * These are not magic — every value is just a `SMTPVerifyOptions` /
 * `VerifyEmailParams` field with a sensible default for that workload.
 * Use them directly, or spread + override:
 *
 *     await verifyEmail({
 *       emailAddress: 'foo@bar.com',
 *       ...VERIFY_EMAIL_PRESETS.serverless,
 *     });
 *
 *     // Or override one field:
 *     await verifyEmail({
 *       emailAddress: 'foo@bar.com',
 *       ...VERIFY_EMAIL_PRESETS.serverless,
 *       smtpTotalDeadlineMs: 3000,
 *     });
 *
 * Two parallel sets are exported:
 *
 *   - `SMTP_PRESETS`        — `SMTPVerifyOptions` shape, for callers using
 *                             `verifyMailboxSMTP` directly.
 *   - `VERIFY_EMAIL_PRESETS` — `VerifyEmailParams` shape, with the `smtp`-
 *                             prefixed field names that `verifyEmail` uses.
 *
 * Presets:
 *
 *   - `serverless` — tight latency budget. Cuts off bad MXes fast.
 *                    Suitable for Lambda / Vercel / Cloudflare-Workers
 *                    request handlers with sub-10s SLAs.
 *   - `dedicated`  — long-running server. Willing to retry once and wait
 *                    longer. Suitable for a dedicated worker / dyno that
 *                    isn't latency-bound.
 *   - `batch`      — running through millions of addresses, accuracy more
 *                    important than per-call latency. Multiple retries with
 *                    exponential backoff, generous timeouts.
 *   - `fast`       — favor speed over coverage. Single MX, single retry,
 *                    short deadlines. For autocomplete / form-validation
 *                    UX where the answer is needed in <2s.
 */

import type { SMTPVerifyOptions, VerifyEmailParams } from './types';

/**
 * Presets for `verifyMailboxSMTP`'s `options` field. Each preset is a
 * subset of `SMTPVerifyOptions` — spread it and override fields as needed.
 */
export const SMTP_PRESETS = {
  /**
   * **Serverless** — Lambda / Vercel / Cloudflare-Workers handlers.
   *
   * Tight latency budget; cuts off bad MXes fast. The total wall-clock
   * is bounded at 5 s so the probe finishes well inside a typical 10 s
   * handler SLA, leaving headroom for everything else the handler does.
   */
  serverless: {
    perAttemptTimeoutMs: 2500,
    totalDeadlineMs: 5000,
    maxConsecutiveFailures: 3,
    maxMxHosts: 2,
  } as const satisfies SMTPVerifyOptions,

  /**
   * **Dedicated** — long-running server / worker.
   *
   * Not latency-bound. Tries every MX, retries connection-class failures
   * once with a 500 ms backoff. Suitable for an always-on backend that
   * processes verification requests as they arrive.
   */
  dedicated: {
    perAttemptTimeoutMs: 5000,
    totalDeadlineMs: 30_000,
    retry: { attempts: 1, delayMs: 500, backoff: 'exponential' },
  } as const satisfies SMTPVerifyOptions,

  /**
   * **Batch** — bulk processing.
   *
   * Each address can take a while; what matters is correctness across
   * the whole batch. Multiple retries with exponential backoff to ride
   * out transient network blips. Generous per-attempt budget so slow
   * MXes get a fair shot.
   */
  batch: {
    perAttemptTimeoutMs: 10_000,
    totalDeadlineMs: 60_000,
    retry: { attempts: 2, delayMs: 1_000, backoff: 'exponential' },
  } as const satisfies SMTPVerifyOptions,

  /**
   * **Fast** — UX-bound (form autocomplete / signup-form validation).
   *
   * Optimize for speed; accept that ambiguous results may be more common.
   * Tries the primary MX only, single retry, sub-3s wall-clock.
   */
  fast: {
    perAttemptTimeoutMs: 1500,
    totalDeadlineMs: 3000,
    maxConsecutiveFailures: 2,
    maxMxHosts: 1,
  } as const satisfies SMTPVerifyOptions,
} as const;

/**
 * Presets for `verifyEmail`'s top-level params. Each preset is a subset of
 * `VerifyEmailParams` — spread it and override fields as needed. The keys
 * use the `smtp`-prefixed names that `verifyEmail` accepts (matching the
 * unprefixed `SMTP_PRESETS` field-for-field).
 */
export const VERIFY_EMAIL_PRESETS = {
  /** See `SMTP_PRESETS.serverless`. */
  serverless: {
    smtpPerAttemptTimeoutMs: 2500,
    smtpTotalDeadlineMs: 5000,
    smtpMaxConsecutiveFailures: 3,
    smtpMaxMxHosts: 2,
    whoisTimeoutMs: 3000,
  } as const satisfies Partial<VerifyEmailParams>,

  /** See `SMTP_PRESETS.dedicated`. */
  dedicated: {
    smtpPerAttemptTimeoutMs: 5000,
    smtpTotalDeadlineMs: 30_000,
    smtpRetry: { attempts: 1, delayMs: 500, backoff: 'exponential' },
    whoisTimeoutMs: 5000,
  } as const satisfies Partial<VerifyEmailParams>,

  /** See `SMTP_PRESETS.batch`. */
  batch: {
    smtpPerAttemptTimeoutMs: 10_000,
    smtpTotalDeadlineMs: 60_000,
    smtpRetry: { attempts: 2, delayMs: 1_000, backoff: 'exponential' },
    whoisTimeoutMs: 8000,
  } as const satisfies Partial<VerifyEmailParams>,

  /** See `SMTP_PRESETS.fast`. */
  fast: {
    smtpPerAttemptTimeoutMs: 1500,
    smtpTotalDeadlineMs: 3000,
    smtpMaxConsecutiveFailures: 2,
    smtpMaxMxHosts: 1,
    whoisTimeoutMs: 2000,
  } as const satisfies Partial<VerifyEmailParams>,
} as const;

/** Type-level sugar for picking a preset by name. */
export type SmtpPresetName = keyof typeof SMTP_PRESETS;
export type VerifyEmailPresetName = keyof typeof VERIFY_EMAIL_PRESETS;
