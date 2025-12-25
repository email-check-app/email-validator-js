// 0006: Email Syntax Validation Tests
//
// Comprehensive tests for email syntax validation

import { EmailProvider, getProviderType, validateEmailSyntax } from '../src/is-email-exists';

describe('0006: Email Syntax Validation', () => {
  describe('valid email formats', () => {
    test('should accept standard email formats', () => {
      const validEmails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'other.email-with-hyphen@example.com',
        'fully-qualified-domain@example.com',
        'user.name+tag+sorting@example.com',
        'x@example.com',
        'example-indeed@strange-example.com',
        'admin@mailserver1',
        'example@s.example',
        'mailhost!username@example.org',
        'user%example.com@example.org',
        'user-@example.org', // Edge case but technically valid
      ];

      validEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(result.email).toBe(email.toLowerCase());
        expect(result.localPart).toBeDefined();
        expect(result.domain).toBeDefined();
      });
    });

    test('should handle case insensitive validation', () => {
      const testCases = ['UPPERCASE@EXAMPLE.COM', 'MixedCase@Example.Com', 'camelCase@domain.COM'];

      testCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(result.email).toBe(email.toLowerCase());
        expect(result.localPart).toBe(email.split('@')[0].toLowerCase());
        expect(result.domain).toBe(email.split('@')[1].toLowerCase());
      });
    });

    test('should handle edge cases in local part', () => {
      const edgeCases = [
        'a@b.co', // Minimum valid
        '1test@domain.com', // Numbers
        'test123@domain.com', // Mixed alphanumeric
        'test_underscore@domain.com', // Underscore (allowed in our regex)
        'test+alias@domain.com', // Plus sign for subaddressing
        'test.multiple.dots@domain.com', // Multiple dots
        'very.long.local.part@domain.com', // Long but within limits
      ];

      edgeCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
      });
    });

    test('should handle complex domain structures', () => {
      const complexDomains = [
        'test@sub.domain.com',
        'user@deeply.nested.sub.domain.example.co.uk',
        'email@xn--d1acufc.xn--p1ai', // International domain (punycode)
        'user@domain-with-dashes.com',
        'email@123domain.com', // Numbers in domain
        'test@single.label', // Single-label domain (TLD-less but may be valid)
      ];

      complexDomains.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('invalid email formats', () => {
    test('should reject emails without @ symbol', () => {
      const invalidEmails = ['plainaddress', '@missingdomain.com', 'username@', 'username'];

      invalidEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('format');
      });

      // Empty string has a different error message
      const emptyResult = validateEmailSyntax('');
      expect(emptyResult.isValid).toBe(false);
    });

    test('should reject emails with invalid characters', () => {
      const invalidEmails = [
        'user name@domain.com', // Space in local part
        'user@domain name.com', // Space in domain
        'user@domain..com', // Double dots in domain
        'user@.domain.com', // Domain starts with dot
        'user@domain.com.', // Domain ends with dot
        'user@-domain.com', // Domain starts with hyphen
        'user@domain-.com', // Domain ends with hyphen
        'a"b(c)d,e:f;g<h>i[j\\k]l@example.com', // Special chars
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
      });
    });

    test('should reject emails with invalid local part structure', () => {
      const invalidEmails = [
        '.user@domain.com', // Starts with dot
        'user.@domain.com', // Ends with dot
        'user..name@domain.com', // Double dots
        'a'.repeat(65) + '@domain.com', // Exceeds 64 chars
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
      });
    });

    test('should reject emails with invalid domain structure', () => {
      const invalidEmails = [
        'user@', // Empty domain
        'user@' + 'a'.repeat(254), // Exceeds 253 chars
        'user@domain..com', // Double dots in domain
        'user@.domain.com', // Starts with dot
        'user@domain.com.', // Ends with dot
        'user@-domain.com', // Domain starts with hyphen
        'user@domain-.com', // Domain ends with hyphen
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
      });
    });

    test('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, () => {}, Symbol('test')];

      invalidInputs.forEach((input) => {
        const result = validateEmailSyntax(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('string');
      });
    });
  });

  describe('length validation', () => {
    test('should enforce RFC length limits', () => {
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

      // Test domain label length limit (63 chars per label)
      const tooLongLabel = 'a'.repeat(64); // 64 chars exceeds RFC 1035 limit
      const invalidLabelEmail = `${local}@${tooLongLabel}.example.com`;
      const labelResult = validateEmailSyntax(invalidLabelEmail);
      expect(labelResult.isValid).toBe(false);
      expect(labelResult.error).toContain('Invalid email format');
    });

    test('should handle boundary conditions', () => {
      // Exactly 64 characters in local part
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
    test('should correctly parse local and domain parts', () => {
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

    test('should handle whitespace correctly', () => {
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

  describe('regex compliance', () => {
    test('should handle RFC 5321 compliant patterns', () => {
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

    test('should reject RFC non-compliant patterns', () => {
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

describe('0006: getProviderType', () => {
  describe('known provider detection', () => {
    test('should identify Gmail domains', () => {
      const gmailDomains = ['gmail.com', 'googlemail.com'];

      gmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.GMAIL);
      });
    });

    test('should identify Yahoo domains', () => {
      const yahooDomains = ['yahoo.com', 'ymail.com', 'rocketmail.com'];

      yahooDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.YAHOO);
      });
    });

    test('should identify Hotmail/Microsoft domains', () => {
      const hotmailDomains = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];

      hotmailDomains.forEach((domain) => {
        expect(getProviderType(domain)).toBe(EmailProvider.HOTMAIL_B2C);
      });
    });
  });

  describe('unknown provider handling', () => {
    test('should return OTHER for unknown domains', () => {
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
        expect(getProviderType(domain)).toBe(EmailProvider.EVERYTHING_ELSE);
      });
    });

    test('should handle case insensitive domain matching', () => {
      const caseTests = [
        ['GMAIL.COM', EmailProvider.GMAIL],
        ['YAHOO.COM', EmailProvider.YAHOO],
        ['OUTLOOK.COM', EmailProvider.HOTMAIL_B2C],
        ['googlemail.com', EmailProvider.GMAIL],
        ['ROCKETMAIL.COM', EmailProvider.YAHOO],
      ];

      caseTests.forEach(([domain, expectedType]) => {
        expect(getProviderType(domain)).toBe(expectedType);
      });
    });
  });

  describe('subdomain handling', () => {
    test('should not match providers on subdomains', () => {
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
});

describe('0006: Performance and Edge Cases', () => {
  test('should handle large number of validations efficiently', () => {
    const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);

    const startTime = Date.now();

    emails.forEach((email) => {
      const result = validateEmailSyntax(email);
      expect(result.isValid).toBe(true);
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Should be very fast
  });

  test('should handle repeated validations consistently', () => {
    const email = 'test@example.com';
    const results = Array.from({ length: 100 }, () => validateEmailSyntax(email));

    results.forEach((result) => {
      expect(result.isValid).toBe(true);
      expect(result.email).toBe(email.toLowerCase());
      expect(result.localPart).toBe('test');
      expect(result.domain).toBe('example.com');
    });
  });

  test('should handle Unicode and international characters', () => {
    const unicodeTests = [
      // Note: Our current regex doesn't support Unicode, but we test the behavior
      { email: 'josé@example.com', expected: false }, // Unicode in local part
      { email: 'user@xn--d1acufc.xn--p1ai', expected: true }, // Punycode domain
      { email: 'user@münchen.de', expected: false }, // Unicode domain (not punycode)
    ];

    unicodeTests.forEach(({ email, expected }) => {
      const result = validateEmailSyntax(email);
      expect(result.isValid).toBe(expected);
    });
  });
});
