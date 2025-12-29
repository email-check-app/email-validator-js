/**
 * Tests for Vercel Edge Functions adapter
 */

// Mock the serverless verifier module
jest.mock('../src/serverless/verifier', () => ({
  validateEmailCore: jest.fn().mockImplementation(async (email: string) => ({
    valid: email.includes('@'),
    email,
    local: email.split('@')[0],
    domain: email.split('@')[1] || '',
    validators: {
      syntax: { valid: email.includes('@') },
      typo: { valid: true },
      disposable: { valid: true },
      free: { valid: !email.includes('gmail.com') },
    },
  })),
  validateEmailBatch: jest.fn().mockImplementation(async (emails: string[]) =>
    emails.map((email) => ({
      valid: email.includes('@'),
      email,
      local: email.split('@')[0],
      domain: email.split('@')[1] || '',
      validators: {
        syntax: { valid: email.includes('@') },
      },
    }))
  ),
  clearCache: jest.fn(),
}));

import { handler } from '../src/serverless/adapters/vercel';

// Mock Vercel Request and Response
class MockRequest {
  method: string;
  url: string;
  headers: Headers;
  private bodyContent: string | null;

  constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers);
    this.bodyContent = (init?.body as string) || null;
  }

  async json() {
    if (!this.bodyContent) throw new Error('No body');
    return JSON.parse(this.bodyContent);
  }

  async text() {
    return this.bodyContent || '';
  }
}

describe('0502 Serverless Vercel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return 200 with healthy status, platform, and timestamp', async () => {
      const request = new MockRequest('https://example.vercel.app/api/health', {
        method: 'GET',
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body.platform).toBe('vercel');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/validate', () => {
    it('should validate a single email and return validation result', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      expect(body.email).toBe('test@example.com');
    });

    it('should pass query parameter options to the validation function', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate?skipCache=true&validateTypo=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@gmial.com' }),
      }) as unknown as Request;

      const response = await handler(request);
      const { validateEmailCore } = require('../src/serverless/verifier');

      expect(response.status).toBe(200);
      expect(validateEmailCore).toHaveBeenCalledWith('user@gmial.com', {
        skipCache: true,
        validateTypo: false,
      });
    });

    it('should return 400 when email field is missing from request body', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Email is required');
    });

    it('should return 400 when request body contains invalid JSON', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Invalid request body');
    });
  });

  describe('POST /api/validate/batch', () => {
    it('should validate an array of emails and return array of results', async () => {
      const emails = ['test1@example.com', 'test2@example.com', 'invalid-email'];
      const request = new MockRequest('https://example.vercel.app/api/validate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(3);
      expect(body.results[0].email).toBe('test1@example.com');
      expect(body.results[0].valid).toBe(true);
      expect(body.results[2].valid).toBe(false);
    });

    it('should return 400 when batch exceeds maximum of 100 emails', async () => {
      const emails = Array(101).fill('test@example.com');
      const request = new MockRequest('https://example.vercel.app/api/validate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Maximum 100 emails allowed per batch');
    });

    it('should return 400 when emails array is empty', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [] }),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Emails array is required');
    });

    it('should pass batch size option from query parameter to validator', async () => {
      const emails = ['test1@example.com', 'test2@example.com'];
      const request = new MockRequest('https://example.vercel.app/api/validate/batch?batchSize=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      }) as unknown as Request;

      const response = await handler(request);
      const { validateEmailBatch } = require('../src/serverless/verifier');

      expect(response.status).toBe(200);
      expect(validateEmailBatch).toHaveBeenCalledWith(emails, { batchSize: 1 });
    });
  });

  describe('CORS handling', () => {
    it('should return 204 with CORS headers for OPTIONS preflight request', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com' },
      }) as unknown as Request;

      const response = await handler(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should include Access-Control-Allow-Origin header in all responses', async () => {
      const request = new MockRequest('https://example.vercel.app/api/health', {
        method: 'GET',
        headers: { Origin: 'https://example.com' },
      }) as unknown as Request;

      const response = await handler(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Error handling', () => {
    it('should return 404 with error message for unrecognized routes', async () => {
      const request = new MockRequest('https://example.vercel.app/api/unknown', {
        method: 'GET',
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe('Not found');
    });

    it('should return 405 when HTTP method is not allowed for the route', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'DELETE',
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(405);
      expect(body.error).toBe('Method not allowed');
    });

    it('should return 500 with error message when internal exception occurs', async () => {
      const { validateEmailCore } = require('../src/serverless/verifier');
      validateEmailCore.mockRejectedValueOnce(new Error('Internal error'));

      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Edge runtime optimizations', () => {
    it('should set Cache-Control header to no-store for POST requests', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }) as unknown as Request;

      const response = await handler(request);

      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });

    it('should include X-Powered-By header indicating Vercel Edge Functions', async () => {
      const request = new MockRequest('https://example.vercel.app/api/health', {
        method: 'GET',
      }) as unknown as Request;

      const response = await handler(request);

      expect(response.headers.get('X-Powered-By')).toBe('Vercel Edge Functions');
    });
  });

  describe('Request validation', () => {
    it('should return 400 when Content-Type is not application/json', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'test@example.com',
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Content-Type must be application/json');
    });

    it('should return 400 when request body is missing', async () => {
      const request = new MockRequest('https://example.vercel.app/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Request;

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Invalid request body');
    });
  });
});
