import type { ValidateEmailOptions } from '../../types';

/** Hard limit on batch size enforced by every adapter. */
export const MAX_BATCH_SIZE = 100;

/** Shape of POST bodies and Lambda invocations across all serverless adapters. */
export interface ValidationRequestBody {
  email?: string;
  emails?: string[];
  options?: ValidateEmailOptions;
}

export type ValidationDispatch =
  | { kind: 'single'; email: string; options?: ValidateEmailOptions }
  | { kind: 'batch'; emails: string[]; options?: ValidateEmailOptions };

export interface ValidationFailure {
  kind: 'invalid';
  status: 400;
  message: string;
}

/**
 * Validation for endpoints that accept ONLY a batch (`emails`). Returns
 * a 400 failure if emails is missing/empty/oversized, or null when valid.
 * Routed `/validate/batch` paths use this so error messages stay batch-specific.
 */
export type BatchValidation = { ok: true; emails: string[] } | { ok: false; status: 400; message: string };

export function validateBatchEmailsField(emails: unknown): BatchValidation {
  if (!Array.isArray(emails) || emails.length === 0) {
    return { ok: false, status: 400, message: 'Emails array is required' };
  }
  if (emails.length > MAX_BATCH_SIZE) {
    return { ok: false, status: 400, message: `Maximum ${MAX_BATCH_SIZE} emails allowed per batch` };
  }
  return { ok: true, emails: emails as string[] };
}

/**
 * Apply the rules every serverless adapter shares:
 *   1. body must request either `email` or `emails`
 *   2. `emails` must be a non-empty array of ≤ MAX_BATCH_SIZE entries
 *
 * Centralising this means a future rule change (say, raising the cap) lands
 * in one place instead of three.
 */
export function classifyRequest(
  body: ValidationRequestBody | null | undefined
): ValidationDispatch | ValidationFailure {
  if (!body || (!body.email && !body.emails)) {
    return { kind: 'invalid', status: 400, message: 'Email or emails array is required' };
  }
  if (body.emails) {
    if (!Array.isArray(body.emails) || body.emails.length === 0) {
      return { kind: 'invalid', status: 400, message: 'Emails array is required' };
    }
    if (body.emails.length > MAX_BATCH_SIZE) {
      return { kind: 'invalid', status: 400, message: `Maximum ${MAX_BATCH_SIZE} emails allowed per batch` };
    }
    return { kind: 'batch', emails: body.emails, options: body.options };
  }
  // body.email must be set per the first guard (which checks both fields).
  if (!body.email) {
    return { kind: 'invalid', status: 400, message: 'Email or emails array is required' };
  }
  return { kind: 'single', email: body.email, options: body.options };
}
