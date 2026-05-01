/**
 * Azure Functions v4 adapter — black-box tests over a Web-API-shaped request.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type AzureHttpRequest, azureFunction, azureHandler } from '../../src/serverless/adapters/azure';
import { clearCache } from '../../src/serverless/verifier';

function buildReq(opts: {
  method?: string;
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  bodyThrow?: boolean;
}): AzureHttpRequest {
  const url = `https://func.azurewebsites.net${opts.path ?? '/'}`;
  return {
    method: opts.method ?? 'GET',
    url,
    headers: new Headers(),
    query: opts.query
      ? {
          get: (k: string) => opts.query?.[k] ?? null,
        }
      : { get: () => null },
    json: async () => {
      if (opts.bodyThrow) throw new Error('boom');
      return opts.body ?? {};
    },
  };
}

describe('0522 Azure adapter — azureHandler routing', () => {
  beforeEach(() => clearCache());
  afterEach(() => clearCache());

  it('GET /api/health returns 200', async () => {
    const result = await azureHandler(buildReq({ method: 'GET', path: '/api/health' }));
    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({ status: 'healthy', platform: 'azure' });
  });

  it('OPTIONS returns 204 with CORS', async () => {
    const result = await azureHandler(buildReq({ method: 'OPTIONS', path: '/api/validate' }));
    expect(result.status).toBe(204);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('POST /api/validate with valid email returns 200', async () => {
    const result = await azureHandler(
      buildReq({ method: 'POST', path: '/api/validate', body: { email: 'alice@gmail.com' } })
    );
    expect(result.status).toBe(200);
    expect((result.jsonBody as { email: string }).email).toBe('alice@gmail.com');
  });

  it('POST /api/validate without email returns 400', async () => {
    const result = await azureHandler(buildReq({ method: 'POST', path: '/api/validate', body: {} }));
    expect(result.status).toBe(400);
  });

  it('POST /api/validate with bad JSON returns 400', async () => {
    const result = await azureHandler(buildReq({ method: 'POST', path: '/api/validate', bodyThrow: true }));
    expect(result.status).toBe(400);
    expect((result.jsonBody as { error: string }).error).toContain('Invalid request body');
  });

  it('POST /api/validate/batch with 2 emails returns 200', async () => {
    const result = await azureHandler(
      buildReq({
        method: 'POST',
        path: '/api/validate/batch',
        body: { emails: ['a@gmail.com', 'b@gmail.com'] },
      })
    );
    expect(result.status).toBe(200);
    expect((result.jsonBody as { results: unknown[] }).results.length).toBe(2);
  });

  it('GET /api/validate returns 405', async () => {
    const result = await azureHandler(buildReq({ method: 'GET', path: '/api/validate' }));
    expect(result.status).toBe(405);
  });

  it('unknown path returns 404', async () => {
    const result = await azureHandler(buildReq({ method: 'GET', path: '/api/nope' }));
    expect(result.status).toBe(404);
  });

  it('?skipCache=true is read via Headers-style query', async () => {
    const result = await azureHandler(
      buildReq({
        method: 'POST',
        path: '/api/validate',
        body: { email: 'alice@gmail.com' },
        query: { skipCache: 'true' },
      })
    );
    expect(result.status).toBe(200);
  });
});

describe('0522 Azure adapter — azureFunction (single-route)', () => {
  beforeEach(() => clearCache());

  it('infers single from body.email', async () => {
    const result = await azureFunction(buildReq({ method: 'POST', body: { email: 'alice@gmail.com' } }));
    expect(result.status).toBe(200);
    expect((result.jsonBody as { success: boolean }).success).toBe(true);
  });

  it('infers batch from body.emails', async () => {
    const result = await azureFunction(buildReq({ method: 'POST', body: { emails: ['a@gmail.com', 'b@gmail.com'] } }));
    expect(result.status).toBe(200);
    expect(Array.isArray((result.jsonBody as { data: unknown[] }).data)).toBe(true);
  });

  it('returns 400 with neither field', async () => {
    const result = await azureFunction(buildReq({ method: 'POST', body: {} }));
    expect(result.status).toBe(400);
  });

  it('returns 405 for non-POST', async () => {
    const result = await azureFunction(buildReq({ method: 'GET' }));
    expect(result.status).toBe(405);
  });
});
