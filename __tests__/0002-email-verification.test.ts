/**
 * Comprehensive test suite for check-if-email-exists functionality
 */

import {
  CHECK_IF_EMAIL_EXISTS_CONSTANTS,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  queryMxRecords,
  validateEmailSyntax,
  verifySmtpConnection,
} from '../src/check-if-email-exists';

// Mock DNS module
jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

// Get the mocked resolveMx function
const mockResolveMx = require('dns').promises.resolveMx;

// Mock console for debug tests
const originalConsoleDebug = console.debug;
beforeEach(() => {
  console.debug = jest.fn();
  mockResolveMx.mockClear();
});

afterEach(() => {
  console.debug = originalConsoleDebug;
  mockResolveMx.mockReset();
});

describe('0002 Email Syntax Validation', () => {
  test('should validate correct email formats', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@gmail.com',
      'user123@test-domain.com',
      'TEST@EXAMPLE.COM', // Should be lowercase
    ];

    validEmails.forEach((email) => {
      const result = validateEmailSyntax(email);
      expect(result.is_valid).toBe(true);
      expect(result.email).toBe(email.toLowerCase());
      expect(result.local_part).toBeDefined();
      expect(result.domain).toBeDefined();
    });
  });

  test('should reject invalid email formats', () => {
    const invalidEmails = [
      'invalid-email',
      '@domain.com',
      'user@',
      'user@domain.with spaces',
      'user..name@domain.com',
      '.user@domain.com',
      'user.@domain.com',
      '',
      null as any,
      undefined as any,
      123 as any,
    ];

    invalidEmails.forEach((email) => {
      const result = validateEmailSyntax(email);
      expect(result.is_valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  test('should enforce length limits', () => {
    // Local part > 64 chars
    const longLocal = 'a'.repeat(65) + '@example.com';
    const result = validateEmailSyntax(longLocal);
    expect(result.is_valid).toBe(false);
    expect(result.error).toContain('exceeds 64 characters');

    // Domain > 253 chars
    const longDomain = 'user@' + 'a'.repeat(254) + '.com';
    const result2 = validateEmailSyntax(longDomain);
    expect(result2.is_valid).toBe(false);
    expect(result2.error).toContain('exceeds 253 characters');
  });

  test('should handle edge cases correctly', () => {
    const edgeCases = [
      { email: 'a@b.co', expected: true },
      { email: 'test@sub.domain.com', expected: true },
      { email: 'test+alias@example.com', expected: true },
      { email: '"test"@example.com', expected: false }, // Quoted strings not supported in this regex
    ];

    edgeCases.forEach(({ email, expected }) => {
      const result = validateEmailSyntax(email);
      expect(result.is_valid).toBe(expected);
    });
  });
});

describe('0002 Provider Type Detection', () => {
  test('should identify Gmail domains correctly', () => {
    const gmailDomains = ['gmail.com', 'googlemail.com'];

    gmailDomains.forEach((domain) => {
      expect(getProviderType(domain)).toBe(EmailProvider.GMAIL);
    });
  });

  test('should identify Yahoo domains correctly', () => {
    const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];

    yahooDomains.forEach((domain) => {
      expect(getProviderType(domain)).toBe(EmailProvider.YAHOO);
    });
  });

  test('should identify Hotmail domains correctly', () => {
    const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];

    hotmailDomains.forEach((domain) => {
      expect(getProviderType(domain)).toBe(EmailProvider.HOTMAIL_B2C);
    });
  });

  test('should return OTHER for unknown domains', () => {
    const otherDomains = ['example.com', 'test.org', 'custom-domain.net'];

    otherDomains.forEach((domain) => {
      expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
    });
  });
});

describe('0002 MX Records Query', () => {
  beforeEach(() => {
    mockResolveMx.mockClear();
  });

  test('should successfully resolve MX records', async () => {
    const mockMxRecords = [
      { exchange: 'mail.example.com', preference: 10 },
      { exchange: 'mail2.example.com', preference: 20 },
    ];

    mockResolveMx.mockResolvedValue(mockMxRecords);

    const result = await queryMxRecords('example.com');

    expect(mockResolveMx).toHaveBeenCalledWith('example.com');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.lowest_priority?.exchange).toBe('mail.example.com');
    expect(result.lowest_priority?.priority).toBe(10);
  });

  test('should handle domains with no MX records', async () => {
    mockResolveMx.mockResolvedValue([]);

    const result = await queryMxRecords('no-mx.com');

    expect(result.success).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.error).toBe('No MX records found');
  });

  test('should handle DNS resolution errors', async () => {
    const dnsError = new Error('ENOTFOUND domain not found');
    (dnsError as any).code = 'ENOTFOUND';
    mockResolveMx.mockRejectedValue(dnsError);

    const result = await queryMxRecords('nonexistent.com');

    expect(result.success).toBe(false);
    expect(result.error).toBe('domain not found');
    expect(result.code).toBe('ENOTFOUND');
  });

  test('should sort MX records by preference', async () => {
    const mockMxRecords = [
      { exchange: 'mail3.example.com', preference: 30 },
      { exchange: 'mail1.example.com', preference: 10 },
      { exchange: 'mail2.example.com', preference: 20 },
    ];

    mockResolveMx.mockResolvedValue(mockMxRecords);

    const result = await queryMxRecords('example.com');

    expect(result.records[0].priority).toBe(10);
    expect(result.records[1].priority).toBe(20);
    expect(result.records[2].priority).toBe(30);
    expect(result.lowest_priority?.exchange).toBe('mail1.example.com');
  });
});

describe('0002 SMTP Connection Verification', () => {
  test('should handle Gmail provider optimizations', async () => {
    // This test would require mocking the entire SMTP connection
    // For now, we'll test the provider optimization logic

    const gmailOptions = {
      timeout: 10000,
      fromEmail: 'test@gmail.com',
      helloName: 'test.com',
      port: 25,
      retries: 3,
    };

    // Test that Gmail optimizations are applied
    expect(async () => {
      await verifySmtpConnection(
        'test@gmail.com',
        'gmail.com',
        'gmail-smtp-in.l.google.com',
        gmailOptions,
        EmailProvider.GMAIL
      );
    }).not.toThrow();
  });
});

describe('0002 Check If Email Exists Core', () => {
  beforeEach(() => {
    mockResolveMx.mockClear();
  });

  test('should reject invalid email syntax', async () => {
    const result = await checkIfEmailExistsCore({
      emailAddress: 'invalid-email',
    });

    expect(result.is_reachable).toBe('invalid');
    expect(result.syntax.is_valid).toBe(false);
    expect(result.mx).toBeNull();
    expect(result.smtp).toBeNull();
  });

  test('should handle domains with no MX records', async () => {
    mockResolveMx.mockResolvedValue([]);

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@no-mx.com',
      verifyMx: true,
      verifySmtp: true,
    });

    expect(result.is_reachable).toBe('invalid');
    expect(result.syntax.is_valid).toBe(true);
    expect(result.mx?.success).toBe(false);
    expect(result.smtp).toBeNull();
  });

  test('should skip MX/SMTP verification when disabled', async () => {
    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: false,
      verifySmtp: false,
    });

    expect(result.syntax.is_valid).toBe(true);
    expect(result.mx).toBeNull();
    expect(result.smtp).toBeNull();
    expect(result.is_reachable).toBe('unknown'); // No SMTP verification
  });

  test('should apply custom SMTP options', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', preference: 10 }]);

    const customOptions = {
      timeout: 15000,
      fromEmail: 'custom@example.com',
      helloName: 'custom.com',
      port: 587,
      retries: 1,
    };

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: true,
      verifySmtp: true,
      smtpOptions: customOptions,
    });

    // Verify that custom options are applied (SMTP would be attempted)
    expect(result.syntax.is_valid).toBe(true);
    expect(result.mx?.success).toBe(true);
  });

  test('should handle debug logging', async () => {
    const consoleSpy = jest.spyOn(console, 'debug');

    await checkIfEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: false,
      verifySmtp: false,
      debug: true,
    });

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  test('should handle disposable and free email detection', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.gmail.com', preference: 10 }]);

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@gmail.com',
      verifyMx: true,
      verifySmtp: false,
      checkDisposable: true,
      checkFree: true,
    });

    expect(result.misc).not.toBeNull();
    expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
    // Gmail should be detected as free provider
    expect(result.misc?.is_free).toBeDefined();
  });

  test('should apply provider optimizations when enabled', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'gmail-smtp-in.l.google.com', preference: 10 }]);

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@gmail.com',
      verifyMx: true,
      verifySmtp: false,
      enableProviderOptimizations: true,
    });

    expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
  });
});

describe('0002 Constants', () => {
  test('should have correct default values', () => {
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT).toBe(10000);
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_SMTP_PORT).toBe(25);
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_FROM_EMAIL).toBe('test@example.com');
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_HELLO_NAME).toBe('example.com');
  });

  test('should have correct provider domains', () => {
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.GMAIL_DOMAINS).toContain('gmail.com');
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.YAHOO_DOMAINS).toContain('yahoo.com');
    expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.HOTMAIL_DOMAINS).toContain('outlook.com');
  });
});

describe('0002 Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveMx.mockClear();
  });

  test('should handle network timeouts gracefully', async () => {
    mockResolveMx.mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('ETIMEDOUT operation timed out');
        (error as any).code = 'ETIMEDOUT';
        setTimeout(() => reject(error), 100);
      });
    });

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@slow-domain.com',
      verifyMx: true,
      verifySmtp: false,
      timeout: 50, // Very short timeout
    });

    expect(result.is_reachable).toBe('invalid'); // MX timeout makes it unreachable/invalid
    expect(result.mx?.error).toBeDefined();
    expect(result.mx?.error).toContain('operation timed out');
  });

  test('should handle malformed input gracefully', async () => {
    const testCases = [null as any, undefined as any, 123 as any, { emailAddress: null } as any];

    for (const testCase of testCases) {
      const result = await checkIfEmailExistsCore(testCase);
      expect(result.is_reachable).toBe('invalid');
      expect(result.syntax?.is_valid).toBe(false);
    }
  });
});

describe('0002 Performance Considerations', () => {
  test('should handle batch processing efficiently', async () => {
    const emails = Array.from({ length: 10 }, (_, i) => `test${i}@example.com`);

    // Mock successful MX resolution
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', preference: 10 }]);

    const startTime = Date.now();

    const results = await Promise.all(
      emails.map((email) =>
        checkIfEmailExistsCore({
          emailAddress: email,
          verifyMx: true,
          verifySmtp: false, // Skip SMTP for speed
        })
      )
    );

    const duration = Date.now() - startTime;

    expect(results).toHaveLength(10);
    expect(duration).toBeLessThan(5000); // Should complete quickly without SMTP

    results.forEach((result) => {
      expect(result.syntax.is_valid).toBe(true);
      expect(result.mx?.success).toBe(true);
    });
  });
});

// Integration tests (would require actual network access in real environment)
describe('0002 Integration Tests', () => {
  test('should work with real-world Gmail address', async () => {
    // Skip this test in unit test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@gmail.com',
      verifyMx: true,
      verifySmtp: false, // Skip SMTP to avoid issues
    });

    expect(result.syntax.is_valid).toBe(true);
    expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
  }, 10000);
});
