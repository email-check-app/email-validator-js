/**
 * GCP Cloud Functions adapter — black-box tests over the (req, res) shape.
 * We construct an Express-like fake req/res and assert routing + responses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type GcpRequest, type GcpResponse, gcpFunction, gcpHandler } from '../../src/serverless/adapters/gcp';
import { clearCache } from '../../src/serverless/verifier';

interface CapturedResponse {
  status: number | null;
  headers: Record<string, string>;
  body: unknown;
}

function makeRes(): { res: GcpResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: null, headers: {}, body: null };
  const res: GcpResponse = {
    status(code) {
      captured.status = code;
      return res;
    },
    set(headers) {
      Object.assign(captured.headers, headers);
      return res;
    },
    json(body) {
      captured.body = body;
      return res;
    },
    send(body) {
      captured.body = body ?? null;
      return res;
    },
  };
  return { res, captured };
}

function req(overrides: Partial<GcpRequest> = {}): GcpRequest {
  return { method: 'GET', path: '/', ...overrides };
}

describe('0520 GCP adapter — gcpHandler routing', () => {
  beforeEach(() => clearCache());
  afterEach(() => clearCache());

  it('GET /health returns 200 + healthy body', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'GET', path: '/health' }), res);
    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ status: 'healthy', platform: 'gcp' });
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'OPTIONS', path: '/validate' }), res);
    expect(captured.status).toBe(204);
    expect(captured.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('POST /validate with valid email returns 200 + EmailValidationResult', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'POST', path: '/validate', body: { email: 'alice@gmail.com' } }), res);
    expect(captured.status).toBe(200);
    expect((captured.body as { email: string }).email).toBe('alice@gmail.com');
    expect((captured.body as { valid: boolean }).valid).toBe(true);
  });

  it('POST /validate without email returns 400', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'POST', path: '/validate', body: {} }), res);
    expect(captured.status).toBe(400);
    expect((captured.body as { error: string }).error).toContain('Email is required');
  });

  it('GET /validate returns 405', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'GET', path: '/validate' }), res);
    expect(captured.status).toBe(405);
  });

  it('POST /validate/batch with 3 emails returns 200 + 3 results', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(
      req({
        method: 'POST',
        path: '/validate/batch',
        body: { emails: ['a@gmail.com', 'b@gmail.com', 'c@gmail.com'] },
      }),
      res
    );
    expect(captured.status).toBe(200);
    expect((captured.body as { results: unknown[] }).results.length).toBe(3);
  });

  it('POST /validate/batch with empty array returns 400', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'POST', path: '/validate/batch', body: { emails: [] } }), res);
    expect(captured.status).toBe(400);
  });

  it('unknown path returns 404', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(req({ method: 'GET', path: '/nope' }), res);
    expect(captured.status).toBe(404);
  });

  it('reads stringified JSON body (Functions Framework edge cases)', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(
      req({ method: 'POST', path: '/validate', body: JSON.stringify({ email: 'alice@gmail.com' }) }),
      res
    );
    expect(captured.status).toBe(200);
  });

  it('falls back to req.url when path is absent', async () => {
    const { res, captured } = makeRes();
    // Omit `path` entirely — exercise the req.url fallback path.
    await gcpHandler({ method: 'GET', url: '/health?x=1' }, res);
    expect(captured.status).toBe(200);
  });

  it('?skipCache=true forwards into the validator (smoke test)', async () => {
    const { res, captured } = makeRes();
    await gcpHandler(
      req({
        method: 'POST',
        path: '/validate',
        body: { email: 'alice@gmail.com' },
        query: { skipCache: 'true' },
      }),
      res
    );
    expect(captured.status).toBe(200);
  });
});

describe('0520 GCP adapter — gcpFunction (single-route)', () => {
  beforeEach(() => clearCache());

  it('infers single-email from body', async () => {
    const { res, captured } = makeRes();
    await gcpFunction(req({ method: 'POST', body: { email: 'alice@gmail.com' } }), res);
    expect(captured.status).toBe(200);
    expect((captured.body as { success: boolean }).success).toBe(true);
  });

  it('infers batch from body.emails', async () => {
    const { res, captured } = makeRes();
    await gcpFunction(req({ method: 'POST', body: { emails: ['a@gmail.com', 'b@gmail.com'] } }), res);
    expect(captured.status).toBe(200);
    const data = (captured.body as { data: unknown[] }).data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
  });

  it('returns 400 when neither field is provided', async () => {
    const { res, captured } = makeRes();
    await gcpFunction(req({ method: 'POST', body: {} }), res);
    expect(captured.status).toBe(400);
  });

  it('returns 405 for non-POST', async () => {
    const { res, captured } = makeRes();
    await gcpFunction(req({ method: 'GET', body: { email: 'alice@gmail.com' } }), res);
    expect(captured.status).toBe(405);
  });
});
