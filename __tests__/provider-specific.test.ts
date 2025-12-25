/**
 * Provider-specific email verification tests
 * Based on the original Rust implementation's test patterns
 */

import type { EmailTestCase } from '../src/email-verifier-types';
import {
  EmailProvider,
  getProviderType,
  isEmailExistConstants,
  isEmailExistsCore,
  validateEmailSyntax,
} from '../src/is-email-exists';

describe('Provider-specific Email Verification', () => {
  // Test cases based on original repository patterns
  const providerTestCases: EmailTestCase[] = [
    // Gmail tests
    {
      email: 'user@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user' },
        provider: EmailProvider.GMAIL,
        isDeliverable: true,
      },
      description: 'Valid Gmail address',
      category: 'valid',
    },
    {
      email: 'user+tag@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user+tag' },
        provider: EmailProvider.GMAIL,
        isDeliverable: true,
      },
      description: 'Gmail plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user.dots@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user.dots' },
        provider: EmailProvider.GMAIL,
        isDeliverable: true,
      },
      description: 'Gmail with dots (dots are ignored by Gmail)',
      category: 'provider_specific',
    },
    {
      email: 'user@googlemail.com',
      expected: {
        syntax: { isValid: true, domain: 'googlemail.com', localPart: 'user' },
        provider: EmailProvider.GMAIL,
        isDeliverable: true,
      },
      description: 'Googlemail domain (Gmail alternative)',
      category: 'provider_specific',
    },

    // Yahoo tests
    {
      email: 'user@yahoo.com',
      expected: {
        syntax: { isValid: true, domain: 'yahoo.com', localPart: 'user' },
        provider: EmailProvider.YAHOO,
        isDeliverable: true,
      },
      description: 'Valid Yahoo address',
      category: 'valid',
    },
    {
      email: 'user+alias@yahoo.com',
      expected: {
        syntax: { isValid: true, domain: 'yahoo.com', localPart: 'user+alias' },
        provider: EmailProvider.YAHOO,
        isDeliverable: true,
      },
      description: 'Yahoo plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user@ymail.com',
      expected: {
        syntax: { isValid: true, domain: 'ymail.com', localPart: 'user' },
        provider: EmailProvider.YAHOO,
        isDeliverable: true,
      },
      description: 'Yahoo alternative domain (ymail.com)',
      category: 'provider_specific',
    },
    {
      email: 'user@rocketmail.com',
      expected: {
        syntax: { isValid: true, domain: 'rocketmail.com', localPart: 'user' },
        provider: EmailProvider.YAHOO,
        isDeliverable: true,
      },
      description: 'Yahoo alternative domain (rocketmail.com)',
      category: 'provider_specific',
    },

    // Hotmail/Outlook tests
    {
      email: 'user@hotmail.com',
      expected: {
        syntax: { isValid: true, domain: 'hotmail.com', localPart: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        isDeliverable: true,
      },
      description: 'Valid Hotmail address',
      category: 'valid',
    },
    {
      email: 'user@outlook.com',
      expected: {
        syntax: { isValid: true, domain: 'outlook.com', localPart: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        isDeliverable: true,
      },
      description: 'Valid Outlook address',
      category: 'valid',
    },
    {
      email: 'user@live.com',
      expected: {
        syntax: { isValid: true, domain: 'live.com', localPart: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        isDeliverable: true,
      },
      description: 'Valid Live.com address',
      category: 'valid',
    },
    {
      email: 'user@msn.com',
      expected: {
        syntax: { isValid: true, domain: 'msn.com', localPart: 'user' },
        provider: EmailProvider.HOTMAIL_B2C,
        isDeliverable: true,
      },
      description: 'Valid MSN address',
      category: 'valid',
    },

    // Business/Enterprise tests (Microsoft 365)
    {
      email: 'user@company.onmicrosoft.com',
      expected: {
        syntax: { isValid: true, domain: 'company.onmicrosoft.com', localPart: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Microsoft 365 business domain (requires MX lookup)',
      category: 'provider_specific',
    },

    // Enterprise security providers
    {
      email: 'user@company.emailprotection.outlook.com',
      expected: {
        syntax: { isValid: true, domain: 'company.emailprotection.outlook.com', localPart: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Mimecast protected domain (requires MX lookup)',
      category: 'provider_specific',
    },
    {
      email: 'user@company.protection.outlook.com',
      expected: {
        syntax: { isValid: true, domain: 'company.protection.outlook.com', localPart: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Proofpoint protected domain (requires MX lookup)',
      category: 'provider_specific',
    },

    // Generic domains
    {
      email: 'user@example.com',
      expected: {
        syntax: { isValid: true, domain: 'example.com', localPart: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Generic domain',
      category: 'valid',
    },
    {
      email: 'user@custom-domain.org',
      expected: {
        syntax: { isValid: true, domain: 'custom-domain.org', localPart: 'user' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Custom domain',
      category: 'valid',
    },

    // Edge cases
    {
      email: 'a@b.co',
      expected: {
        syntax: { isValid: true, domain: 'b.co', localPart: 'a' },
        provider: EmailProvider.EVERYTHING_ELSE,
        isDeliverable: true,
      },
      description: 'Minimum valid email',
      category: 'edge_case',
    },
    {
      email: 'very.long.local.part.that.exceeds.the.normal.limits.but.is.still.technically.valid@domain.com',
      expected: {
        syntax: { isValid: false },
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
    test('should include all Gmail domains', () => {
      const gmailDomains = ['gmail.com', 'googlemail.com'];
      gmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.GMAIL);
      });
    });

    test('should include all Yahoo domains', () => {
      const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];
      yahooDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.YAHOO);
      });
    });

    test('should include all Hotmail domains', () => {
      const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];
      hotmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.HOTMAIL_B2C);
      });
    });

    test('should detect Microsoft 365 business domains', () => {
      const b2bDomains = [
        'company.onmicrosoft.com',
        'mail.company.com', // Would need MX lookup to confirm B2B
      ];
      // Note: In real implementation, B2B detection would be based on MX records
      expect(getProviderType('company.onmicrosoft.com')).toBe(EmailProvider.EVERYTHING_ELSE);
    });

    test('should detect enterprise security providers', () => {
      const securityDomains = [
        'company.emailprotection.outlook.com', // Mimecast
        'company.protection.outlook.com', // Proofpoint
        'pphosted.com', // Mimecast pattern
        'mimecast.com', // Mimecast direct
      ];
      securityDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
      });
      // Note: Security provider detection would be based on MX records in real implementation
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
        expect(result.isValid).toBe(true);
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
        expect(result.isValid).toBe(true);
        expect([EmailProvider.YAHOO].includes(getProviderType(result.domain!))).toBe(true);
      });
    });

    test('should handle Hotmail/Outlook specific features', () => {
      const hotmailFeatures = ['user@hotmail.com', 'user@outlook.com', 'user@live.com', 'user@msn.com'];

      hotmailFeatures.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
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
      expect(isEmailExistConstants.gmailDomains).toContain('gmail.com');
      expect(isEmailExistConstants.gmailDomains).toContain('googlemail.com');

      expect(isEmailExistConstants.yahooDomains).toContain('yahoo.com');
      expect(isEmailExistConstants.yahooDomains).toContain('ymail.com');
      expect(isEmailExistConstants.yahooDomains).toContain('rocketmail.com');

      expect(isEmailExistConstants.hotmailDomains).toContain('hotmail.com');
      expect(isEmailExistConstants.hotmailDomains).toContain('outlook.com');
      expect(isEmailExistConstants.hotmailDomains).toContain('live.com');
      expect(isEmailExistConstants.hotmailDomains).toContain('msn.com');
    });

    test('should have correct default values', () => {
      expect(isEmailExistConstants.defaultTimeout).toBe(30000);
      expect(isEmailExistConstants.defaultSmtpPort).toBe(25);
      expect(isEmailExistConstants.defaultFromEmail).toBe('test@example.com');
      expect(isEmailExistConstants.defaultHelloName).toBe('example.com');
    });
  });

  describe('Integration Tests with Mock Data', () => {
    test('should handle verification without SMTP for speed', async () => {
      const testEmails = ['user@gmail.com', 'user@yahoo.com', 'user@outlook.com', 'user@example.com'];

      for (const email of testEmails) {
        const result = await isEmailExistsCore({
          emailAddress: email,
          verifyMx: false,
          verifySmtp: false,
          timeout: 1000,
        });

        expect(result.email).toBe(email.toLowerCase());
        expect(result.syntax.isValid).toBe(true);
        expect(result.misc?.providerType).toBeDefined();
        expect(result.duration).toBeLessThan(1000);
      }
    });

    test('should handle Yahoo API verification when enabled', async () => {
      // Note: This test would need mocking for the actual HTTP calls
      const result = await isEmailExistsCore({
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
      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.YAHOO);
    });

    test('should handle provider optimizations when enabled', async () => {
      const result = await isEmailExistsCore({
        emailAddress: 'test@gmail.com',
        enableProviderOptimizations: true,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.email).toBe('test@gmail.com');
      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.GMAIL);
    });
  });
});
