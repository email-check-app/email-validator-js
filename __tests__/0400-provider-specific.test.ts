/**
 * Provider-specific email verification tests
 * Based on the original Rust implementation's test patterns
 */

import {
  CHECK_IF_EMAIL_EXISTS_CONSTANTS,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  validateEmailSyntax,
} from '../src/check-if-email-exists';
import type { EmailTestCase } from '../src/email-verifier-types';

describe('0400 Provider Specific', () => {
  // Test cases based on original repository patterns
  const providerTestCases: EmailTestCase[] = [
    // Gmail tests
    {
      email: 'user@gmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'gmail.com', local_part: 'user' },
        provider: EmailProvider.GMAIL,
        is_deliverable: true,
      },
      description: 'Valid Gmail address',
      category: 'valid',
    },
    {
      email: 'user+tag@gmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'gmail.com', local_part: 'user+tag' },
        provider: EmailProvider.GMAIL,
        is_deliverable: true,
      },
      description: 'Gmail plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user.dots@gmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'gmail.com', local_part: 'user.dots' },
        provider: EmailProvider.GMAIL,
        is_deliverable: true,
      },
      description: 'Gmail with dots (dots are ignored by Gmail)',
      category: 'provider_specific',
    },
    {
      email: 'user@googlemail.com',
      expected: {
        syntax: { is_valid: true, domain: 'googlemail.com', local_part: 'user' },
        provider: EmailProvider.GMAIL,
        is_deliverable: true,
      },
      description: 'Googlemail domain (Gmail alternative)',
      category: 'provider_specific',
    },

    // Yahoo tests
    {
      email: 'user@yahoo.com',
      expected: {
        syntax: { is_valid: true, domain: 'yahoo.com', local_part: 'user' },
        provider: EmailProvider.YAHOO,
        is_deliverable: true,
      },
      description: 'Valid Yahoo address',
      category: 'valid',
    },
    {
      email: 'user+alias@yahoo.com',
      expected: {
        syntax: { is_valid: true, domain: 'yahoo.com', local_part: 'user+alias' },
        provider: EmailProvider.YAHOO,
        is_deliverable: true,
      },
      description: 'Yahoo plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user@ymail.com',
      expected: {
        syntax: { is_valid: true, domain: 'ymail.com', local_part: 'user' },
        provider: EmailProvider.YAHOO,
        is_deliverable: true,
      },
      description: 'Yahoo alternative domain (ymail.com)',
      category: 'provider_specific',
    },
    {
      email: 'user@rocketmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'rocketmail.com', local_part: 'user' },
        provider: EmailProvider.YAHOO,
        is_deliverable: true,
      },
      description: 'Yahoo alternative domain (rocketmail.com)',
      category: 'provider_specific',
    },

    // Hotmail/Outlook tests
    {
      email: 'user@hotmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'hotmail.com', local_part: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        is_deliverable: true,
      },
      description: 'Valid Hotmail address',
      category: 'valid',
    },
    {
      email: 'user@outlook.com',
      expected: {
        syntax: { is_valid: true, domain: 'outlook.com', local_part: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        is_deliverable: true,
      },
      description: 'Valid Outlook address',
      category: 'valid',
    },
    {
      email: 'user@live.com',
      expected: {
        syntax: { is_valid: true, domain: 'live.com', local_part: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        is_deliverable: true,
      },
      description: 'Valid Live.com address',
      category: 'valid',
    },
    {
      email: 'user@msn.com',
      expected: {
        syntax: { is_valid: true, domain: 'msn.com', local_part: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        is_deliverable: true,
      },
      description: 'Valid MSN address',
      category: 'valid',
    },

    // Business/Enterprise tests (Microsoft 365)
    {
      email: 'user@company.onmicrosoft.com',
      expected: {
        syntax: { is_valid: true, domain: 'company.onmicrosoft.com', local_part: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Microsoft 365 business domain (requires MX lookup)',
      category: 'provider_specific',
    },

    // Enterprise security providers
    {
      email: 'user@company.emailprotection.outlook.com',
      expected: {
        syntax: { is_valid: true, domain: 'company.emailprotection.outlook.com', local_part: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Mimecast protected domain (requires MX lookup)',
      category: 'provider_specific',
    },
    {
      email: 'user@company.protection.outlook.com',
      expected: {
        syntax: { is_valid: true, domain: 'company.protection.outlook.com', local_part: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Proofpoint protected domain (requires MX lookup)',
      category: 'provider_specific',
    },

    // Generic domains
    {
      email: 'user@example.com',
      expected: {
        syntax: { is_valid: true, domain: 'example.com', local_part: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Generic domain',
      category: 'valid',
    },
    {
      email: 'user@custom-domain.org',
      expected: {
        syntax: { is_valid: true, domain: 'custom-domain.org', local_part: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Custom domain',
      category: 'valid',
    },

    // Edge cases
    {
      email: 'a@b.co',
      expected: {
        syntax: { is_valid: true, domain: 'b.co', local_part: 'a' },
        provider: EmailProvider.EVERYTHING_ELSE,
        is_deliverable: true,
      },
      description: 'Minimum valid email',
      category: 'edge_case',
    },
    {
      email: 'very.long.local.part.that.exceeds.the.normal.limits.but.is.still.technically.valid@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Local part exceeds 64 characters',
      category: 'invalid',
    },
  ];

  describe('Provider Detection', () => {
    test.each(
      providerTestCases.filter((tc) => tc.expected.provider)
    )('$description - should detect $email as $expected.provider', ({ email, expected }) => {
      const domain = email.split('@')[1];
      if (domain) {
        const detectedProvider = getProviderType(domain);
        expect(detectedProvider).toBe(expected.provider);
      }
    });
  });

  describe('Provider-specific Domain Lists', () => {
    test('should recognize all Gmail domains', () => {
      const gmailDomains = ['gmail.com', 'googlemail.com'];
      gmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.GMAIL);
      });
    });

    test('should recognize all Yahoo domains', () => {
      const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];
      yahooDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.YAHOO);
      });
    });

    test('should recognize all Hotmail domains', () => {
      const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];
      hotmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.HOTMAIL_B2C);
      });
    });

    test('should classify Microsoft 365 business domains as EVERYTHING_ELSE (requires MX lookup)', () => {
      const b2bDomains = [
        'company.onmicrosoft.com',
        'mail.company.com', // Would need MX lookup to confirm B2B
      ];
      // Note: B2B detection requires MX record lookup, so onmicrosoft.com is classified as EVERYTHING_ELSE
      b2bDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
      });
    });

    test('should classify enterprise security provider domains as EVERYTHING_ELSE (requires MX lookup)', () => {
      const securityDomains = [
        'company.emailprotection.outlook.com', // Mimecast
        'company.protection.outlook.com', // Proofpoint
        'pphosted.com', // Mimecast pattern
        'mimecast.com', // Mimecast direct
      ];
      // Note: Security provider detection requires MX record lookup
      securityDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
      });
    });

    test('should not match subdomains of provider domains', () => {
      const subdomainTests = [
        'mail.gmail.com', // Should be OTHER, not GMAIL
        'smtp.yahoo.com', // Should be OTHER, not YAHOO
        'outlook.office.com', // Should be OTHER, not HOTMAIL
      ];
      subdomainTests.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
      });
    });
  });

  describe('Provider-specific Features', () => {
    test('should handle Gmail-specific features', () => {
      const gmailFeatures = [
        'user+tag@gmail.com', // Plus addressing
        'user.dots@gmail.com', // Dots ignored
        'user+dots.tag@gmail.com', // Combined features
      ];

      gmailFeatures.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect(result.domain).toBe('gmail.com');
      });
    });

    test('should handle Yahoo-specific features', () => {
      const yahooFeatures = [
        'user+alias@yahoo.com', // Plus addressing
        'user@yahoo.com', // Standard format
        'user@ymail.com', // Alternative domain
      ];

      yahooFeatures.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect([EmailProvider.YAHOO].includes(getProviderType(result.domain!))).toBe(true);
      });
    });

    test('should handle Hotmail/Outlook specific features', () => {
      const hotmailFeatures = ['user@hotmail.com', 'user@outlook.com', 'user@live.com', 'user@msn.com'];

      hotmailFeatures.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(EmailProvider.HOTMAIL_B2C);
      });
    });
  });

  describe('Error Cases for Provider Detection', () => {
    test('should handle invalid inputs gracefully', () => {
      const invalidInputs = [
        '',
        null,
        undefined,
        123,
        {},
        [],
        'not-an-email',
        '@domain.com',
        'user@',
        'user..name@domain.com',
      ];

      invalidInputs.forEach((input) => {
        expect(() => {
          if (typeof input === 'string' && input.includes('@')) {
            const domain = input.split('@')[1];
            if (domain) {
              getProviderType(domain);
            }
          }
        }).not.toThrow();
      });
    });
  });

  describe('Constants Validation', () => {
    test('should have correct provider domains in constants', () => {
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.GMAIL_DOMAINS).toContain('gmail.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.GMAIL_DOMAINS).toContain('googlemail.com');

      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.YAHOO_DOMAINS).toContain('yahoo.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.YAHOO_DOMAINS).toContain('ymail.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.YAHOO_DOMAINS).toContain('rocketmail.com');

      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.HOTMAIL_DOMAINS).toContain('hotmail.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.HOTMAIL_DOMAINS).toContain('outlook.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.HOTMAIL_DOMAINS).toContain('live.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.HOTMAIL_DOMAINS).toContain('msn.com');
    });

    test('should have correct default values', () => {
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT).toBe(10000);
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_SMTP_PORT).toBe(25);
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_FROM_EMAIL).toBe('test@example.com');
      expect(CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_HELLO_NAME).toBe('example.com');
    });
  });

  describe('Integration Tests with Mock Data', () => {
    test('should perform fast verification by skipping SMTP checks', async () => {
      const testEmails = ['user@gmail.com', 'user@yahoo.com', 'user@outlook.com', 'user@example.com'];

      for (const email of testEmails) {
        const result = await checkIfEmailExistsCore({
          emailAddress: email,
          verifyMx: false,
          verifySmtp: false,
          timeout: 1000,
        });

        expect(result.email).toBe(email.toLowerCase());
        expect(result.syntax.is_valid).toBe(true);
        expect(result.misc?.provider_type).toBeDefined();
        expect(result.duration).toBeLessThan(1000);
      }
    });

    test('should handle Yahoo API verification when enabled', async () => {
      // Note: This test would need mocking for the actual HTTP calls
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@yahoo.com',
        useYahooApi: true,
        verifyMx: false,
        verifySmtp: false,
        yahooApiOptions: {
          timeout: 1000,
          retryAttempts: 1,
        },
      });

      expect(result.email).toBe('test@yahoo.com');
      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.YAHOO);
    });

    test('should handle provider optimizations when enabled', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@gmail.com',
        enableProviderOptimizations: true,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.email).toBe('test@gmail.com');
      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
    });
  });
});
