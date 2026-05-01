/**
 * Netlify Functions adapter — black-box tests over the Lambda-shaped event.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type NetlifyEvent, netlifyFunction, netlifyHandler } from '../../src/serverless/adapters/netlify';
import { clearCache } from '../../src/serverless/verifier';

function event(overrides: Partial<NetlifyEvent> = {}): NetlifyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    body: null,
    headers: {},
    queryStringParameters: null,
    ...overrides,
  };
}

describe('0521 Netlify adapter — netlifyHandler routing', () => {
  beforeEach(() => clearCache());
  afterEach(() => clearCache());

  it('GET /health returns 200', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'GET', path: '/health' }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'healthy', platform: 'netlify' });
  });

  it('strips /.netlify/functions/<name> prefix from path', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'GET', path: '/.netlify/functions/validate/health' }));
    expect(result.statusCode).toBe(200);
  });

  it('strips /api prefix from path', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'GET', path: '/api/health' }));
    expect(result.statusCode).toBe(200);
  });

  it('OPTIONS returns 204 with CORS', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'OPTIONS', path: '/validate' }));
    expect(result.statusCode).toBe(204);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('POST /validate with valid email returns 200', async () => {
    const result = await netlifyHandler(
      event({ httpMethod: 'POST', path: '/validate', body: JSON.stringify({ email: 'alice@gmail.com' }) })
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).email).toBe('alice@gmail.com');
  });

  it('POST /validate without email returns 400', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'POST', path: '/validate', body: '{}' }));
    expect(result.statusCode).toBe(400);
  });

  it('POST /validate with invalid JSON returns 400', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'POST', path: '/validate', body: 'not json' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid request body');
  });

  it('POST /validate/batch with 2 emails returns 200', async () => {
    const result = await netlifyHandler(
      event({
        httpMethod: 'POST',
        path: '/validate/batch',
        body: JSON.stringify({ emails: ['a@gmail.com', 'b@gmail.com'] }),
      })
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).results.length).toBe(2);
  });

  it('decodes base64 body when isBase64Encoded=true', async () => {
    const body = Buffer.from(JSON.stringify({ email: 'alice@gmail.com' })).toString('base64');
    const result = await netlifyHandler(event({ httpMethod: 'POST', path: '/validate', body, isBase64Encoded: true }));
    expect(result.statusCode).toBe(200);
  });

  it('GET /validate returns 405', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'GET', path: '/validate' }));
    expect(result.statusCode).toBe(405);
  });

  it('unknown path returns 404', async () => {
    const result = await netlifyHandler(event({ httpMethod: 'GET', path: '/nope' }));
    expect(result.statusCode).toBe(404);
  });

  it('?skipCache=true is forwarded', async () => {
    const result = await netlifyHandler(
      event({
        httpMethod: 'POST',
        path: '/validate',
        body: JSON.stringify({ email: 'alice@gmail.com' }),
        queryStringParameters: { skipCache: 'true' },
      })
    );
    expect(result.statusCode).toBe(200);
  });
});

describe('0521 Netlify adapter — netlifyFunction (single-route)', () => {
  beforeEach(() => clearCache());

  it('infers single from body.email', async () => {
    const result = await netlifyFunction(
      event({ httpMethod: 'POST', body: JSON.stringify({ email: 'alice@gmail.com' }) })
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('infers batch from body.emails', async () => {
    const result = await netlifyFunction(
      event({ httpMethod: 'POST', body: JSON.stringify({ emails: ['a@gmail.com', 'b@gmail.com'] }) })
    );
    expect(result.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(result.body).data)).toBe(true);
  });

  it('returns 400 with neither field', async () => {
    const result = await netlifyFunction(event({ httpMethod: 'POST', body: '{}' }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 405 for non-POST', async () => {
    const result = await netlifyFunction(event({ httpMethod: 'GET' }));
    expect(result.statusCode).toBe(405);
  });
});
