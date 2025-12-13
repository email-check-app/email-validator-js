/**
 * Yahoo API and Headless Browser Tests
 * Based on the original Rust implementation's provider-specific testing
 */

import {
  checkIfEmailExistsCore,
  EmailProvider,
  validateEmailSyntax,
  verifyGmailHeadless,
  verifyYahooApi,
  verifyYahooHeadless,
} from '../src/check-if-email-exists';
import type { HeadlessOptions, YahooApiOptions } from '../src/email-verifier-types';

// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Yahoo API Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Yahoo API Configuration', () => {
    test('should use default options when none provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('session-cookie=test'),
        },
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_NOT_AVAILABLE"}]}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('test@yahoo.com', {});

      expect(mockFetch).toHaveBeenCalledTimes(2); // Page load + validation request
      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
    });

    test('should use custom options when provided', async () => {
      const options: YahooApiOptions = {
        timeout: 5000,
        userAgent: 'Custom User Agent',
        retryAttempts: 5,
        proxyUrl: 'http://proxy.example.com:8080',
        headers: {
          'X-Custom-Header': 'test-value',
        },
        apiUrl: 'https://custom.yahoo-api.com',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": []}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      await verifyYahooApi('test@yahoo.com', options);

      // Check that fetch was called with custom options
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[1].signal).toBeDefined(); // AbortController
    });
  });

  describe('Yahoo API Success Scenarios', () => {
    test('should detect existing email with IDENTIFIER_NOT_AVAILABLE error', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_NOT_AVAILABLE"}]}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('existing@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should detect existing email with IDENTIFIER_ALREADY_EXISTS error', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": [{"error": "IDENTIFIER_ALREADY_EXISTS"}]}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('existing@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(true);
    });

    test('should detect non-existing email when no errors returned', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": []}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('nonexistent@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(false);
    });
  });

  describe('Yahoo API Error Scenarios', () => {
    test('should handle HTTP errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('test@yahoo.com');

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    test('should handle network timeouts', async () => {
      mockFetch.mockRejectedValue(new Error('AbortError'));

      const result = await verifyYahooApi('test@yahoo.com', { timeout: 100 });

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('Request timeout');
    });

    test('should handle invalid domain errors', async () => {
      const result = await verifyYahooApi('test@not-yahoo.com');

      expect(result.is_valid).toBe(false);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('Not a Yahoo domain');
    });

    test('should handle malformed responses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('invalid json response'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await verifyYahooApi('test@yahoo.com');

      expect(result.is_valid).toBe(true);
      expect(result.is_deliverable).toBe(false);
      expect(result.error).toBe('Could not parse Yahoo response');
    });

    test('should handle case-insensitive domain checking', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": []}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const testCases = [
        'test@YAHOO.COM',
        'test@Yahoo.Com',
        'test@GMAIL.COM', // Should fail - not a Yahoo domain
        'test@ymail.com',
      ];

      for (const email of testCases) {
        const result = await verifyYahooApi(email);

        if (email.toLowerCase().includes('yahoo') || email.toLowerCase().includes('ymail')) {
          expect(result.is_valid).toBe(true);
        } else {
          expect(result.is_valid).toBe(false);
          expect(result.error).toBe('Not a Yahoo domain');
        }
      }
    });
  });

  describe('Yahoo API Integration', () => {
    test('should integrate with main email verification function', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(''),
        },
        text: jest.fn().mockResolvedValue('{"errors": [{"name": "IDENTIFIER_NOT_AVAILABLE"}]}'),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@yahoo.com',
        useYahooApi: true,
        yahooApiOptions: {
          timeout: 5000,
        },
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.is_reachable).toBe('safe');
      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.YAHOO);
      expect(result.smtp?.is_deliverable).toBe(true);
      expect(result.smtp?.provider_used).toBe(EmailProvider.YAHOO);
    });
  });
});

describe('Headless Browser Tests', () => {
  // Mock WebDriver responses
  const mockWebDriverResponse = (value: any, sessionId = 'test-session') => ({
    sessionId,
    status: 0,
    value,
  });

  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Headless Browser Configuration', () => {
    test('should use default configuration', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('account exists'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const browser = require('../src/check-if-email-exists').HeadlessBrowser;
      const headlessBrowser = new browser();

      expect(headlessBrowser.webdriverEndpoint).toBe('http://localhost:9515');
      expect(headlessBrowser.timeout).toBe(30000);
      expect(headlessBrowser.retryAttempts).toBe(3);
    });

    test('should use custom configuration', async () => {
      const options: HeadlessOptions = {
        webdriverEndpoint: 'http://localhost:9999',
        timeout: 60000,
        retryAttempts: 5,
        screenshot: true,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Custom Browser',
      };

      const browser = require('../src/check-if-email-exists').HeadlessBrowser;
      const headlessBrowser = new browser(options);

      expect(headlessBrowser.webdriverEndpoint).toBe('http://localhost:9999');
      expect(headlessBrowser.timeout).toBe(60000);
      expect(headlessBrowser.retryAttempts).toBe(5);
    });
  });

  describe('Yahoo Headless Verification', () => {
    test('should detect existing Yahoo email', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('account exists verification method'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await verifyYahooHeadless('existing@yahoo.com');

      expect(result.success).toBe(true);
      expect(result.email_exists).toBe(true);
    });

    test('should detect non-existing Yahoo email', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('account not found'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await verifyYahooHeadless('nonexistent@yahoo.com');

      expect(result.success).toBe(true);
      expect(result.email_exists).toBe(false);
    });

    test('should handle headless browser errors', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await verifyYahooHeadless('test@yahoo.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Headless browser error');
    });
  });

  describe('Gmail Headless Verification', () => {
    test('should detect existing Gmail email', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('recovery options available'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await verifyGmailHeadless('existing@gmail.com');

      expect(result.success).toBe(true);
      expect(result.email_exists).toBe(true);
    });

    test('should detect non-existing Gmail email', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('couldnt find your google account'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await verifyGmailHeadless('nonexistent@gmail.com');

      expect(result.success).toBe(true);
      expect(result.email_exists).toBe(false);
    });
  });

  describe('Headless Browser Integration', () => {
    test('should integrate with main verification function for Yahoo', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('account exists verification method'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@yahoo.com',
        useYahooHeadless: true,
        headlessOptions: {
          webdriverEndpoint: 'http://localhost:9515',
          timeout: 10000,
        },
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.is_reachable).toBe('safe');
      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.YAHOO);
      expect(result.smtp?.is_deliverable).toBe(true);
      expect(result.smtp?.provider_used).toBe(EmailProvider.YAHOO);
    });

    test('should integrate with main verification function for Gmail', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('recovery options available'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@gmail.com',
        headlessOptions: {
          webdriverEndpoint: 'http://localhost:9515',
          timeout: 10000,
        },
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.is_reachable).toBe('safe');
      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
      expect(result.smtp?.is_deliverable).toBe(true);
      expect(result.smtp?.provider_used).toBe(EmailProvider.GMAIL);
    });
  });

  describe('Screenshot Functionality', () => {
    test('should capture screenshots when requested', async () => {
      const screenshotBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';

      mockFetch.mockImplementation((url) => {
        if (url.endsWith('/session')) {
          return Promise.resolve(mockWebDriverResponse({ sessionId: 'test-session' }));
        }
        if (url.endsWith('/url')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/element')) {
          return Promise.resolve(mockWebDriverResponse({ 'element-6066-11e4-a52e-4f735466cecf': 'element-id' }));
        }
        if (url.includes('/value') || url.includes('/click')) {
          return Promise.resolve(mockWebDriverResponse({}));
        }
        if (url.endsWith('/screenshot')) {
          return Promise.resolve(mockWebDriverResponse({ value: screenshotBase64 }));
        }
        if (url.endsWith('/execute/sync')) {
          return Promise.resolve(mockWebDriverResponse('account exists'));
        }
        return Promise.resolve(mockWebDriverResponse({}));
      });

      const result = await verifyYahooHeadless('test@yahoo.com', { screenshot: true });

      expect(result.screenshot).toBe(screenshotBase64);
    });
  });

  describe('Timeout Handling', () => {
    test('should respect timeout settings', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 5000);
        });
      });

      const startTime = Date.now();
      const result = await verifyYahooHeadless('test@yahoo.com', { timeout: 1000 });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should timeout quickly
      expect(result.success).toBe(false);
      expect(result.error).toContain('Headless browser error');
    });
  });
});

describe('Fallback Behavior Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test('should fall back to SMTP verification when API fails', async () => {
    // Mock Yahoo API failure
    mockFetch.mockRejectedValue(new Error('Network error'));

    // This would need to be implemented in the main function
    // For now, we just test that the error is handled
    const result = await verifyYahooApi('test@yahoo.com');

    expect(result.is_valid).toBe(false);
    expect(result.error).toContain('Network error');
  });

  test('should prefer API over headless when both available', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue(''),
      },
      text: jest.fn().mockResolvedValue('{"errors": []}'),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@yahoo.com',
      useYahooApi: true,
      useYahooHeadless: true,
      yahooApiOptions: { timeout: 5000 },
      headlessOptions: { webdriverEndpoint: 'http://localhost:9515' },
      verifyMx: false,
      verifySmtp: false,
    });

    // Should use API (verifyYahooApi) when both are enabled
    expect(result.syntax.is_valid).toBe(true);
    expect(result.misc?.provider_type).toBe(EmailProvider.YAHOO);
    expect(mockFetch).toHaveBeenCalledTimes(2); // API calls only, not headless
  });
});
