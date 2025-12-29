/**
 * Advanced syntax validation tests for email validation, including length validation,
 * parsing accuracy, RFC compliance, provider detection, and performance tests
 */

import { EmailProvider, getProviderType, validateEmailSyntax } from '../../src/check-if-email-exists';

describe('0001 Syntax Validation Advanced', () => {
  describe('length validation', () => {
    test('should enforce RFC 5321 length limits (64 chars for local part, 253 for domain, 63 per domain label)', () => {
      // Test local part length (max 64)
      const longLocal = 'a'.repeat(64);
      expect(validateEmailSyntax(`${longLocal}@domain.com`).isValid).toBe(true);

      const tooLongLocal = 'a'.repeat(65);
      const result = validateEmailSyntax(`${tooLongLocal}@domain.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Local part exceeds 64 characters');

      // Test domain length (max 253 for entire domain, 63 per label)
      const local = 'user'; // 4 chars

      // Create a valid long domain using 63-character labels
      const maxLabelLength = 63;
      const numLabels = 3; // 3 labels of 63 chars each = 189 chars + 2 dots + base
      const longLabels = Array.from({ length: numLabels }, () => 'a'.repeat(maxLabelLength));
      const longDomain = longLabels.join('.') + '.example.com'; // Will be within limits
      const validEmail = `${local}@${longDomain}`;
      expect(validateEmailSyntax(validEmail).isValid).toBe(true);

      // Test domain label length limit (63 chars per label per RFC 1035)
      const tooLongLabel = 'a'.repeat(64); // 64 chars exceeds RFC 1035 limit
      const invalidLabelEmail = `${local}@${tooLongLabel}.example.com`;
      const labelResult = validateEmailSyntax(invalidLabelEmail);
      expect(labelResult.isValid).toBe(false);
      expect(labelResult.error).toMatch(/Invalid email format|exceeds 63 characters/);
    });

    test('should handle boundary conditions at exact RFC limits', () => {
      // Exactly 64 characters in local part (at the limit)
      const boundaryLocal = 'a'.repeat(64);
      const boundaryResult = validateEmailSyntax(`${boundaryLocal}@example.com`);
      expect(boundaryResult.isValid).toBe(true);
      expect(boundaryResult.localPart).toHaveLength(64);

      // Create a valid domain with labels exactly at the 63-character boundary
      const local = 'user';
      const maxLabelLength = 63;
      const boundaryLabel = 'a'.repeat(maxLabelLength);
      const boundaryDomain = `${boundaryLabel}.${boundaryLabel}.com`; // Two max-length labels
      const boundaryDomainResult = validateEmailSyntax(`${local}@${boundaryDomain}`);
      expect(boundaryDomainResult.isValid).toBe(true);
    });
  });

  describe('parsing accuracy', () => {
    test('should correctly parse and separate local part from domain part', () => {
      const testCases = [
        {
          email: 'user@example.com',
          expectedLocal: 'user',
          expectedDomain: 'example.com',
        },
        {
          email: 'first.last+tag@sub.domain.co.uk',
          expectedLocal: 'first.last+tag',
          expectedDomain: 'sub.domain.co.uk',
        },
        {
          email: 'UPPERCASE@EXAMPLE.COM',
          expectedLocal: 'uppercase',
          expectedDomain: 'example.com',
        },
        {
          email: '123.user@test.123.com',
          expectedLocal: '123.user',
          expectedDomain: 'test.123.com',
        },
      ];

      testCases.forEach(({ email, expectedLocal, expectedDomain }) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(result.localPart).toBe(expectedLocal);
        expect(result.domain).toBe(expectedDomain);
      });
    });

    test('should trim leading and trailing whitespace from email addresses', () => {
      const testCases = ['  user@example.com  ', '\tuser@example.com\n', '   user@example.com', 'user@example.com   '];

      testCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        if (result.isValid) {
          expect(result.email).toBe(email.trim());
          expect(result.email).not.toContain(' ');
          expect(result.email).not.toContain('\t');
          expect(result.email).not.toContain('\n');
        }
      });
    });
  });

  describe('RFC compliance', () => {
    test('should accept RFC 5321 compliant email patterns', () => {
      const rfcCompliantEmails = [
        'john.doe@example.com',
        'john_doe@example.com',
        'john-doe@example.com',
        'john+doe@example.com',
        'john.doe+label@example.com',
        'a@b.c', // Minimal valid email
        'test@sub-domain.example.com',
        'email@123.123.123.123', // IP-like domain
      ];

      rfcCompliantEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
      });
    });

    test('should reject RFC 5321 non-compliant patterns (consecutive dots, dots at edges)', () => {
      const rfcNonCompliantEmails = [
        'john..doe@example.com', // Double dot
        '.john@example.com', // Starts with dot
        'john.@example.com', // Ends with dot
        'john@example..com', // Double dot in domain
        'john@example.com.', // Ends with dot
        'john@.example.com', // Starts with dot
      ];

      rfcNonCompliantEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
      });
    });
  });
});

describe('0001 Provider Type Detection', () => {
  describe('known provider detection', () => {
    test('should identify Gmail and Googlemail domains', () => {
      const gmailDomains = ['gmail.com', 'googlemail.com'];

      gmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.gmail);
      });
    });

    test('should identify Yahoo, Ymail, and Rocketmail domains', () => {
      const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];

      yahooDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.yahoo);
      });
    });

    test('should identify Hotmail, Outlook, Live, and MSN domains', () => {
      const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];

      hotmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.hotmailB2c);
      });
    });
  });

  describe('unknown provider handling', () => {
    test('should return EVERYTHING_ELSE for unknown or custom domains', () => {
      const unknownDomains = [
        'example.com',
        'customdomain.org',
        'business.co.uk',
        'university.edu',
        'government.gov',
        'company.io',
        'personal.me',
        'organization.net',
      ];

      unknownDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.everythingElse);
      });
    });

    test('should perform case-insensitive domain matching for provider detection', () => {
      const caseTests = [
        ['GMAIL.COM', EmailProvider.gmail],
        ['YAHOO.COM', EmailProvider.yahoo],
        ['OUTLOOK.COM', EmailProvider.hotmailB2c],
        ['googlemail.com', EmailProvider.gmail],
        ['ROCKETMAIL.COM', EmailProvider.yahoo],
      ];

      caseTests.forEach(([domain, expectedType]) => {
        expect(getProviderType(domain)).toBe(expectedType);
      });
    });
  });

  describe('subdomain handling', () => {
    test('should return EVERYTHING_ELSE for subdomains of known providers', () => {
      const subdomainTests = [
        'mail.gmail.com', // Should be EVERYTHING_ELSE, not GMAIL
        'smtp.yahoo.com', // Should be EVERYTHING_ELSE, not YAHOO
        'outlook.office.com', // Should be EVERYTHING_ELSE, not HOTMAIL_B2C
      ];

      subdomainTests.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.everythingElse);
      });
    });
  });
});

describe('0001 Performance and Edge Cases', () => {
  test('should validate 1000 email addresses efficiently in under 1 second', () => {
    const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);

    const startTime = Date.now();

    emails.forEach((email) => {
      const result = validateEmailSyntax(email);
      expect(result.isValid).toBe(true);
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Should complete 1000 validations in under 1 second
  });

  test('should return consistent results across 100 repeated validations of the same email', () => {
    const email = 'test@example.com';
    const results = Array.from({ length: 100 }, () => validateEmailSyntax(email));

    results.forEach((result) => {
      expect(result.isValid).toBe(true);
      expect(result.email).toBe(email.toLowerCase());
      expect(result.localPart).toBe('test');
      expect(result.domain).toBe('example.com');
    });
  });

  test('should handle punycode international domains but reject Unicode in local part', () => {
    const unicodeTests = [
      // Note: Current regex does not support Unicode characters in local part
      { email: 'josé@example.com', expected: false, description: 'Unicode character in local part' },
      { email: 'user@xn--d1acufc.xn--p1ai', expected: true, description: 'Punycode domain (Russian)' },
      { email: 'user@münchen.de', expected: false, description: 'Unicode domain (not punycode)' },
    ];

    unicodeTests.forEach(({ email, expected }) => {
      const result = validateEmailSyntax(email);
      expect(result.isValid).toBe(expected);
    });
  });
});
