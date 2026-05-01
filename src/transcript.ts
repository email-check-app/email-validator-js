/**
 * Lightweight transcript collector used by `verifyEmail` to capture a
 * structured trace of every subsystem call (syntax / disposable / free /
 * MX / SMTP / WHOIS / name detection / domain suggestion).
 *
 * Two collectors:
 *   - `ArrayTranscriptCollector` — accumulates steps, exposed in result.
 *   - `NULL_COLLECTOR` — no-op singleton used when capture is disabled, so
 *     the call sites in `verifyEmail` never need an `if (transcript)` branch.
 */
import type { VerificationStep, VerificationStepKind } from './types';

export interface TranscriptCollector {
  /** Run `fn`, time it, push a step record. Re-throws on error after recording. */
  record<T>(
    kind: VerificationStepKind,
    fn: () => Promise<T> | T,
    detailsFor: (value: T) => Record<string, unknown>
  ): Promise<T>;
  /** Push a pre-built step. Useful when timing is owned by the callee. */
  push(step: VerificationStep): void;
}

export class ArrayTranscriptCollector implements TranscriptCollector {
  readonly steps: VerificationStep[] = [];

  async record<T>(
    kind: VerificationStepKind,
    fn: () => Promise<T> | T,
    detailsFor: (value: T) => Record<string, unknown>
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const value = await fn();
      this.steps.push({
        kind,
        startedAt,
        durationMs: Date.now() - startedAt,
        ok: true,
        details: detailsFor(value),
      });
      return value;
    } catch (error) {
      this.steps.push({
        kind,
        startedAt,
        durationMs: Date.now() - startedAt,
        ok: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  push(step: VerificationStep): void {
    this.steps.push(step);
  }
}

/** No-op collector — every method is a no-op. Used when capture is disabled. */
export const NULL_COLLECTOR: TranscriptCollector = {
  async record(_kind, fn) {
    return fn();
  },
  push() {
    // no-op
  },
};
