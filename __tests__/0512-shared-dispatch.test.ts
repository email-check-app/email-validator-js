/**
 * Direct unit tests for executeValidation. The adapter tests cover the happy
 * paths via mocks; this suite verifies the dispatch logic itself, including
 * the kind discriminant guarding the call site.
 */
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const validateEmailCore = mock(async (email: string) => ({ valid: true, email, validators: {} }));
const validateEmailBatch = mock(async (emails: string[]) =>
  emails.map((email) => ({ valid: true, email, validators: {} }))
);

const actualVerifier = await import('../src/serverless/verifier');
mock.module('../src/serverless/verifier', () => ({
  ...actualVerifier,
  validateEmailCore,
  validateEmailBatch,
}));

const { executeValidation } = await import('../src/serverless/_shared/dispatch');

afterAll(() => {
  mock.module('../src/serverless/verifier', () => actualVerifier);
});

describe('0512 _shared/dispatch — executeValidation', () => {
  beforeEach(() => {
    validateEmailCore.mockClear();
    validateEmailBatch.mockClear();
  });

  it('routes single dispatch to validateEmailCore', async () => {
    const result = await executeValidation({ kind: 'single', email: 'alice@example.com' });
    expect(validateEmailCore).toHaveBeenCalledTimes(1);
    expect(validateEmailCore).toHaveBeenCalledWith('alice@example.com', undefined);
    expect(validateEmailBatch).not.toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(false);
  });

  it('forwards options to validateEmailCore', async () => {
    await executeValidation({
      kind: 'single',
      email: 'a@b.com',
      options: { skipCache: true, validateMx: true },
    });
    expect(validateEmailCore).toHaveBeenCalledWith('a@b.com', { skipCache: true, validateMx: true });
  });

  it('routes batch dispatch to validateEmailBatch', async () => {
    const result = await executeValidation({
      kind: 'batch',
      emails: ['a@b.com', 'c@d.com'],
    });
    expect(validateEmailBatch).toHaveBeenCalledTimes(1);
    expect(validateEmailBatch).toHaveBeenCalledWith(['a@b.com', 'c@d.com'], undefined);
    expect(validateEmailCore).not.toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) expect(result).toHaveLength(2);
  });

  it('forwards options to validateEmailBatch', async () => {
    await executeValidation({
      kind: 'batch',
      emails: ['a@b.com'],
      options: { batchSize: 5 },
    });
    expect(validateEmailBatch).toHaveBeenCalledWith(['a@b.com'], { batchSize: 5 });
  });

  it('does not coerce a single email into a batch', async () => {
    // White-box: classifyRequest is the only place that picks between the two,
    // so dispatch must trust the discriminant blindly. If a `single` kind ever
    // routes to `validateEmailBatch`, this regression test catches it.
    await executeValidation({ kind: 'single', email: 'lone@x.com' });
    expect(validateEmailBatch).not.toHaveBeenCalled();
  });
});
