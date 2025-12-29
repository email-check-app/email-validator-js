/**
 * Provider-specific email verification tests
 * Based on the original Rust implementation's test patterns
 */

import {
  checkIfEmailExistsConstants,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  validateEmailSyntax,
} from '../../src/check-if-email-exists';
import type { EmailTestCase } from '../../src/email-verifier-types';

describe('0400 Provider Specific', () => {
  // Test cases based on original repository patterns
  const providerTestCases: EmailTestCase[] = [
    // Gmail tests
    {
      email: 'user@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user' },
        provider: EmailProvider.gmail,
        isDeliverable: true,
      },
      description: 'Valid Gmail address',
      category: 'valid',
    },
    {
      email: 'user+tag@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user+tag' },
        provider: EmailProvider.gmail,
        isDeliverable: true,
      },
      description: 'Gmail plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user.dots@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'user.dots' },
        provider: EmailProvider.gmail,
        isDeliverable: true,
      },
      description: 'Gmail with dots (dots are ignored by Gmail)',
      category: 'provider_specific',
    },
    {
      email: 'user@googlemail.com',
      expected: {
        syntax: { isValid: true, domain: 'googlemail.com', localPart: 'user' },
        provider: EmailProvider.gmail,
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
        provider: EmailProvider.yahoo,
        isDeliverable: true,
      },
      description: 'Valid Yahoo address',
      category: 'valid',
    },
    {
      email: 'user+alias@yahoo.com',
      expected: {
        syntax: { isValid: true, domain: 'yahoo.com', localPart: 'user+alias' },
        provider: EmailProvider.yahoo,
        isDeliverable: true,
      },
      description: 'Yahoo plus addressing',
      category: 'provider_specific',
    },
    {
      email: 'user@ymail.com',
      expected: {
        syntax: { isValid: true, domain: 'ymail.com', localPart: 'user' },
        provider: EmailProvider.yahoo,
        isDeliverable: true,
      },
      description: 'Yahoo alternative domain (ymail.com)',
      category: 'provider_specific',
    },
    {
      email: 'user@rocketmail.com',
      expected: {
        syntax: { isValid: true, domain: 'rocketmail.com', localPart: 'user' },
        provider: EmailProvider.yahoo,
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
        provider: EmailProvider.hotmailB2c,
        isDeliverable: true,
      },
      description: 'Valid Hotmail address',
      category: 'valid',
    },
    {
      email: 'user@outlook.com',
      expected: {
        syntax: { isValid: true, domain: 'outlook.com', localPart: 'user' },
        provider: EmailProvider.hotmailB2c,
        isDeliverable: true,
      },
      description: 'Valid Outlook address',
      category: 'valid',
    },
    {
      email: 'user@live.com',
      expected: {
        syntax: { isValid: true, domain: 'live.com', localPart: 'user' },
        provider: EmailProvider.hotmailB2c,
        isDeliverable: true,
      },
      description: 'Valid Live.com address',
      category: 'valid',
    },
    {
      email: 'user@msn.com',
      expected: {
        syntax: { isValid: true, domain: 'msn.com', localPart: 'user' },
        provider: EmailProvider.hotmailB2c,
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
        provider: EmailProvider.everythingElse,
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
        provider: EmailProvider.everythingElse,
        isDeliverable: true,
      },
      description: 'Mimecast protected domain (requires MX lookup)',
      category: 'provider_specific',
    },
    {
      email: 'user@company.protection.outlook.com',
      expected: {
        syntax: { isValid: true, domain: 'company.protection.outlook.com', localPart: 'user' },
        provider: EmailProvider.everythingElse,
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
        provider: EmailProvider.everythingElse,
        isDeliverable: true,
      },
      description: 'Generic domain',
      category: 'valid',
    },
    {
      email: 'user@custom-domain.org',
      expected: {
        syntax: { isValid: true, domain: 'custom-domain.org', localPart: 'user' },
        provider: EmailProvider.everythingElse,
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
        provider: EmailProvider.everythingElse,
        isDeliverable: true,
      },
      description: 'Minimum valid email',
      category: 'edge_case',
    },
    {
      email: 'very.long.local.part.that.exceeds.the.normal.limits.but.is.still.technically.valid@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
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
        expect(getProviderType(domain)).toBe(EmailProvider.gmail);
      });
    });

    test('should recognize all Yahoo domains', () => {
      const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];
      yahooDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.yahoo);
      });
    });

    test('should recognize all Hotmail domains', () => {
      const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];
      hotmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.hotmailB2c);
      });
    });

    test('should classify Microsoft 365 business domains as EVERYTHING_ELSE (requires MX lookup)', () => {
      const b2bDomains = [
        'company.onmicrosoft.com',
        'mail.company.com', // Would need MX lookup to confirm B2B
      ];
      // Note: B2B detection requires MX record lookup, so onmicrosoft.com is classified as EVERYTHING_ELSE
      b2bDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.everythingElse);
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
        expect(getProviderType(domain)).toBe(EmailProvider.everythingElse);
      });
    });

    test('should not match subdomains of provider domains', () => {
      const subdomainTests = [
        'mail.gmail.com', // Should be OTHER, not GMAIL
        'smtp.yahoo.com', // Should be OTHER, not YAHOO
        'outlook.office.com', // Should be OTHER, not HOTMAIL
      ];
      subdomainTests.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.everythingElse);
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
        expect([EmailProvider.yahoo].includes(getProviderType(result.domain!))).toBe(true);
      });
    });

    test('should handle Hotmail/Outlook specific features', () => {
      const hotmailFeatures = ['user@hotmail.com', 'user@outlook.com', 'user@live.com', 'user@msn.com'];

      hotmailFeatures.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(EmailProvider.hotmailB2c);
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
      expect(checkIfEmailExistsConstants.gmailDomains).toContain('gmail.com');
      expect(checkIfEmailExistsConstants.gmailDomains).toContain('googlemail.com');

      expect(checkIfEmailExistsConstants.yahooDomains).toContain('yahoo.com');
      expect(checkIfEmailExistsConstants.yahooDomains).toContain('ymail.com');
      expect(checkIfEmailExistsConstants.yahooDomains).toContain('rocketmail.com');

      expect(checkIfEmailExistsConstants.hotmailDomains).toContain('hotmail.com');
      expect(checkIfEmailExistsConstants.hotmailDomains).toContain('outlook.com');
      expect(checkIfEmailExistsConstants.hotmailDomains).toContain('live.com');
      expect(checkIfEmailExistsConstants.hotmailDomains).toContain('msn.com');
    });

    test('should have correct default values', () => {
      expect(checkIfEmailExistsConstants.defaultTimeout).toBe(10000);
      expect(checkIfEmailExistsConstants.defaultSmtpPort).toBe(25);
      expect(checkIfEmailExistsConstants.defaultFromEmail).toBe('test@example.com');
      expect(checkIfEmailExistsConstants.defaultHelloName).toBe('example.com');
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
        expect(result.syntax.isValid).toBe(true);
        expect(result.misc?.providerType).toBeDefined();
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
      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.yahoo);
    });

    test('should handle provider optimizations when enabled', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@gmail.com',
        enableProviderOptimizations: true,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.email).toBe('test@gmail.com');
      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.gmail);
    });
  });
});
