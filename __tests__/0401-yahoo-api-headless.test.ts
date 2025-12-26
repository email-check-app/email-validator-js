/**
 * Simple Yahoo API Tests - focusing on the core functionality
 */

import { EmailProvider, verifyYahooApi } from '../src/check-if-email-exists';
import type { YahooApiOptions } from '../src/email-verifier-types';

// Mock fetch for Yahoo API tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('0401 Yahoo API Headless', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Basic Functionality', () => {
    test('should detect existing Yahoo email', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with error indicating email exists
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_NOT_AVAILABLE"}]}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('existing@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should detect non-existing Yahoo email', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with no errors (email doesn't exist)
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": []}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('available@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBeUndefined();
    });

    test('should reject non-Yahoo domains', async () => {
      const result = await verifyYahooApi('test@gmail.com');

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('Not a Yahoo domain');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should handle HTTP errors', async () => {
      // Mock HTTP error response
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await verifyYahooApi('test@yahoo.com');

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('HTTP 500: Internal Server Error');
    });

    test('should handle network timeouts', async () => {
      // Mock a timeout
      mockFetch.mockRejectedValue(new DOMException('Request timeout', 'AbortError'));

      const result = await verifyYahooApi('test@yahoo.com', { timeout: 1000 });

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('Request timeout');
    });
  });

  describe('Error Codes', () => {
    test('should handle IDENTIFIER_ALREADY_EXISTS error', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with error indicating email exists
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": [{"error": "IDENTIFIER_ALREADY_EXISTS"}]}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('taken@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
    });

    test('should handle IDENTIFIER_EXISTS error', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with error indicating email exists
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_EXISTS"}]}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('exists@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
    });

    test('should handle unknown error codes', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with unknown error
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "UNKNOWN_ERROR", "description": "Some error"}]}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('test@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toContain('UNKNOWN_ERROR');
    });
  });

  describe('Response Parsing', () => {
    test('should handle malformed JSON responses', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with malformed JSON
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('invalid json response'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('test@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(false); // Default to false for malformed responses
    });

    test('should handle text-based error responses', async () => {
      // Mock the signup page response
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      // Mock the validation response with text-based error
      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('This Yahoo ID is already taken'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      const result = await verifyYahooApi('taken@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true); // Should detect the text error
    });
  });

  describe('Configuration', () => {
    test('should use custom user agent', async () => {
      const options: YahooApiOptions = {
        userAgent: 'Custom Test Agent',
        timeout: 5000,
      };

      // Mock successful responses
      const signupPageResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
          ),
      };

      const validationResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_NOT_AVAILABLE"}]}'),
      };

      mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

      await verifyYahooApi('test@yahoo.com', options);

      // Verify custom user agent was used
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[1].headers['User-Agent']).toBe('Custom Test Agent');
      expect(firstCall[1].signal).toBeDefined(); // AbortController
    });

    test('should use custom timeout', async () => {
      const options: YahooApiOptions = {
        timeout: 2000,
      };

      // Mock timeout
      mockFetch.mockRejectedValue(new DOMException('Request timeout', 'AbortError'));

      const result = await verifyYahooApi('test@yahoo.com', options);

      expect(result.error).toBe('Request timeout');
    });
  });

  describe('Domain Validation', () => {
    test('should accept various Yahoo domains', async () => {
      const yahooDomains = ['test@yahoo.com', 'admin@ymail.com', 'contact@rocketmail.com'];

      for (const email of yahooDomains) {
        // Mock successful response
        const signupPageResponse = {
          ok: true,
          status: 200,
          headers: {
            get: jest.fn().mockReturnValue('session-cookie=test'),
          },
          text: jest
            .fn()
            .mockResolvedValue(
              '<html><form name="u" action="/create" method="post"><input name="acrumb" value="test-token"></form></html>'
            ),
        };

        const validationResponse = {
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('{"errors": []}'),
        };

        mockFetch.mockResolvedValueOnce(signupPageResponse).mockResolvedValueOnce(validationResponse);

        const result = await verifyYahooApi(email);

        // Should not reject based on domain
        expect(result.error).not.toBe('Not a Yahoo domain');
      }
    });

    test('should reject invalid email formats', async () => {
      const invalidEmails = ['invalid-email', '@yahoo.com', 'test@', '', 'test@@yahoo.com'];

      for (const email of invalidEmails) {
        const result = await verifyYahooApi(email);
        expect(result.is_valid).toBe(false);
        expect(result.is_deliverable).toBe(false);
        // Invalid emails without proper domain should return "Not a Yahoo domain" error
        if (!email.includes('@') || email.split('@')[1] === '') {
          expect(result.error).toBe('Not a Yahoo domain');
        }
      }
    });
  });
});

describe('Email Provider Constants', () => {
  test('should have correct Yahoo provider enum', () => {
    expect(EmailProvider.YAHOO).toBe('yahoo');
  });

  test('should have all required email provider enums', () => {
    expect(EmailProvider.GMAIL).toBe('gmail');
    expect(EmailProvider.HOTMAIL_B2C).toBe('hotmail_b2c');
    expect(EmailProvider.HOTMAIL_B2B).toBe('hotmail_b2b');
    expect(EmailProvider.PROOFPOINT).toBe('proofpoint');
    expect(EmailProvider.MIMECAST).toBe('mimecast');
    expect(EmailProvider.EVERYTHING_ELSE).toBe('everything_else');
  });
});
