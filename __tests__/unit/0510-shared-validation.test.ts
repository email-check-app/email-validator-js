/**
 * Direct unit tests for the validation helpers used by every serverless adapter.
 * These ran via the AWS/Vercel adapter tests before, but a contract this central
 * deserves its own focused suite — black-box (input → outcome) plus the explicit
 * MAX_BATCH_SIZE boundary.
 */
import { describe, expect, it } from 'bun:test';
import { classifyRequest, MAX_BATCH_SIZE, validateBatchEmailsField } from '../../src/serverless/_shared/validation';

describe('0510 _shared/validation — classifyRequest', () => {
  it('returns invalid when body is null', () => {
    const out = classifyRequest(null);
    expect(out.kind).toBe('invalid');
    if (out.kind === 'invalid') expect(out.message).toBe('Email or emails array is required');
  });

  it('returns invalid when body is undefined', () => {
    expect(classifyRequest(undefined).kind).toBe('invalid');
  });

  it('returns invalid when neither email nor emails is set', () => {
    const out = classifyRequest({});
    expect(out.kind).toBe('invalid');
    if (out.kind === 'invalid') expect(out.status).toBe(400);
  });

  it('returns single dispatch for body.email', () => {
    const out = classifyRequest({ email: 'a@b.com' });
    expect(out.kind).toBe('single');
    if (out.kind === 'single') expect(out.email).toBe('a@b.com');
  });

  it('preserves options on single dispatch', () => {
    const out = classifyRequest({ email: 'a@b.com', options: { skipCache: true } });
    if (out.kind !== 'single') throw new Error('expected single');
    expect(out.options?.skipCache).toBe(true);
  });

  it('returns batch dispatch for body.emails', () => {
    const out = classifyRequest({ emails: ['a@b.com', 'c@d.com'] });
    expect(out.kind).toBe('batch');
    if (out.kind === 'batch') expect(out.emails).toHaveLength(2);
  });

  it('rejects empty emails array', () => {
    const out = classifyRequest({ emails: [] });
    expect(out.kind).toBe('invalid');
    if (out.kind === 'invalid') expect(out.message).toBe('Emails array is required');
  });

  it(`rejects emails array over MAX_BATCH_SIZE (${MAX_BATCH_SIZE})`, () => {
    const oversized = Array(MAX_BATCH_SIZE + 1).fill('a@b.com');
    const out = classifyRequest({ emails: oversized });
    if (out.kind !== 'invalid') throw new Error('expected invalid');
    expect(out.message).toBe(`Maximum ${MAX_BATCH_SIZE} emails allowed per batch`);
  });

  it(`accepts exactly MAX_BATCH_SIZE emails`, () => {
    const exact = Array(MAX_BATCH_SIZE).fill('a@b.com');
    const out = classifyRequest({ emails: exact });
    expect(out.kind).toBe('batch');
  });

  it('rejects non-array emails value (false-positive guard)', () => {
    // Caller could pass a string by accident — must be rejected, not coerced.
    const out = classifyRequest({ emails: 'a@b.com' as unknown as string[] });
    expect(out.kind).toBe('invalid');
  });

  it('prefers batch over single when both are present', () => {
    // Documents the precedence: emails wins. If we ever flip this, the test fails.
    const out = classifyRequest({ email: 'single@x.com', emails: ['batch@x.com'] });
    expect(out.kind).toBe('batch');
  });
});

describe('0510 _shared/validation — validateBatchEmailsField', () => {
  it('returns ok=true with the validated emails for a valid array', () => {
    const r = validateBatchEmailsField(['a@b.com']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.emails).toEqual(['a@b.com']);
  });

  it('rejects null', () => {
    const r = validateBatchEmailsField(null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.message).toBe('Emails array is required');
    }
  });

  it('rejects undefined', () => {
    const r = validateBatchEmailsField(undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects empty array', () => {
    const r = validateBatchEmailsField([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Emails array is required');
  });

  it('rejects strings (false-positive guard for misshapen input)', () => {
    const r = validateBatchEmailsField('a@b.com' as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Emails array is required');
  });

  it('rejects objects', () => {
    const r = validateBatchEmailsField({ length: 1 } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Emails array is required');
  });

  it('rejects oversize batch', () => {
    const oversize = Array(MAX_BATCH_SIZE + 1).fill('a@b.com');
    const r = validateBatchEmailsField(oversize);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(`Maximum ${MAX_BATCH_SIZE} emails allowed per batch`);
  });

  it('accepts exactly MAX_BATCH_SIZE', () => {
    const r = validateBatchEmailsField(Array(MAX_BATCH_SIZE).fill('a@b.com'));
    expect(r.ok).toBe(true);
  });
});
