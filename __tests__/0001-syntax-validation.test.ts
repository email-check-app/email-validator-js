/**
 * Comprehensive tests for email syntax validation, provider detection, and edge case handling
 */

import { EmailProvider, getProviderType, validateEmailSyntax } from '../src/check-if-email-exists';

describe('0001 Email Syntax Validation', () => {
  describe('valid email formats', () => {
    test('should accept standard RFC-compliant email formats', () => {
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

    test('should convert email addresses to lowercase during validation', () => {
      const testCases = ['UPPERCASE@EXAMPLE.COM', 'MixedCase@Example.Com', 'camelCase@domain.COM'];

      testCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(result.email).toBe(email.toLowerCase());
        expect(result.localPart).toBe(email.split('@')[0].toLowerCase());
        expect(result.domain).toBe(email.split('@')[1].toLowerCase());
      });
    });

    test('should accept valid edge cases in local part', () => {
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

    test('should accept complex and international domain structures', () => {
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
    test('should reject emails missing @ symbol or having invalid format', () => {
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

    test('should reject emails containing invalid characters or malformed structure', () => {
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

    test('should reject emails with invalid local part structure (dots at edges, consecutive dots, or too long)', () => {
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

    test('should reject emails with invalid domain structure (empty, too long, malformed dots, or hyphens at edges)', () => {
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

    test('should reject non-string inputs (null, undefined, numbers, objects, arrays, symbols, functions)', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, () => {}, Symbol('test')];

      invalidInputs.forEach((input) => {
        const result = validateEmailSyntax(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('string');
      });
    });
  });
});
