/**
 * Tests for AWS Lambda serverless adapter
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from '../src/serverless/adapters/aws-lambda';

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

describe('0501 Serverless AWS Lambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'email-validator',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:email-validator',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/email-validator',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with healthy status and timestamp', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/health',
        headers: {},
        body: null,
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body || '{}');
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /validate', () => {
    it('should validate a single email and return validation result', async () => {
      const event = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body || '{}');
      expect(body.valid).toBe(true);
      expect(body.email).toBe('test@example.com');
    });

    it('should return 400 when email field is missing from request body', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Email is required');
    });

    it('should return 400 when request body contains invalid JSON', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        body: 'invalid json',
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Invalid request body');
    });

    it('should decode and handle base64 encoded request body', async () => {
      const bodyContent = JSON.stringify({ email: 'test@example.com' });
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(bodyContent).toString('base64'),
        isBase64Encoded: true,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body || '{}');
      expect(body.email).toBe('test@example.com');
    });
  });

  describe('POST /validate/batch', () => {
    it('should validate an array of emails and return array of results', async () => {
      const emails = ['test1@example.com', 'test2@example.com', 'test3@example.com'];
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate/batch',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body || '{}');
      expect(body.results).toHaveLength(3);
      expect(body.results[0].email).toBe('test1@example.com');
    });

    it('should return 400 when emails array is missing from request', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate/batch',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Emails array is required');
    });

    it('should return 400 when batch exceeds maximum of 100 emails', async () => {
      const emails = Array(101).fill('test@example.com');
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate/batch',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Maximum 100 emails allowed per batch');
    });
  });

  describe('CORS handling', () => {
    it('should return 204 with CORS headers for OPTIONS preflight request', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'OPTIONS',
        path: '/validate',
        headers: { origin: 'https://example.com' },
        body: null,
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(204);
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers?.['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers?.['Access-Control-Allow-Headers']).toContain('Content-Type');
    });

    it('should include Access-Control-Allow-Origin header in all responses', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.com',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Error handling', () => {
    it('should return 404 with error message for unrecognized routes', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/unknown',
        headers: {},
        body: null,
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Not found');
    });

    it('should return 405 when HTTP method is not allowed for the route', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'DELETE',
        path: '/validate',
        headers: {},
        body: null,
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Method not allowed');
    });

    it('should return 500 with error message when internal exception occurs', async () => {
      // Mock an error in validateEmailCore
      const { validateEmailCore } = require('../src/serverless/verifier');
      validateEmailCore.mockRejectedValueOnce(new Error('Internal error'));

      const event = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body || '{}');
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Query parameters and options', () => {
    it('should pass boolean string options from query parameters to validator', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'POST',
        path: '/validate',
        headers: { 'content-type': 'application/json' },
        queryStringParameters: {
          skipCache: 'true',
          validateTypo: 'false',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEvent;

      const result = (await handler(event, mockContext)) as APIGatewayProxyResult;
      const { validateEmailCore } = require('../src/serverless/verifier');

      expect(result.statusCode).toBe(200);
      expect(validateEmailCore).toHaveBeenCalledWith('test@example.com', {
        skipCache: true,
        validateTypo: false,
      });
    });
  });
});
