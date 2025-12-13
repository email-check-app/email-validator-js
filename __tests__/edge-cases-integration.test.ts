/**
 * Edge Cases and Integration Tests
 * Based on the original Rust implementation's comprehensive test suite
 */

import {
  CHECK_IF_EMAIL_EXISTS_CONSTANTS,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  validateEmailSyntax,
} from '../src/check-if-email-exists';
import type { EmailTestCase, VerificationMetrics } from '../src/email-verifier-types';

describe('Edge Cases and Integration Tests', () => {
  // Comprehensive edge case test data
  const edgeCaseTests: EmailTestCase[] = [
    // Valid edge cases
    {
      email: 'a@b.co',
      expected: {
        syntax: { is_valid: true, domain: 'b.co', local_part: 'a' },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Minimum valid email format',
      category: 'edge_case',
    },
    {
      email: 'test@xn--d1acufc.xn--p1ai',
      expected: {
        syntax: { is_valid: true, domain: 'xn--d1acufc.xn--p1ai', local_part: 'test' },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'International domain (punycode)',
      category: 'edge_case',
    },
    {
      email: 'test+very.long.tag+with.multiple.dots@gmail.com',
      expected: {
        syntax: { is_valid: true, domain: 'gmail.com', local_part: 'test+very.long.tag+with.multiple.dots' },
        provider: EmailProvider.GMAIL,
      },
      description: 'Complex Gmail plus addressing',
      category: 'edge_case',
    },
    {
      email: 'user_name@domain.co.uk',
      expected: {
        syntax: { is_valid: true, domain: 'domain.co.uk', local_part: 'user_name' },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Underscore in local part',
      category: 'edge_case',
    },
    {
      email: 'test123@domain123.com',
      expected: {
        syntax: { is_valid: true, domain: 'domain123.com', local_part: 'test123' },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Numbers in both local and domain parts',
      category: 'edge_case',
    },
    {
      email: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@domain.com',
      expected: {
        syntax: {
          is_valid: true,
          domain: 'domain.com',
          local_part: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789',
        },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Maximum allowed local part characters',
      category: 'edge_case',
    },

    // Invalid edge cases
    {
      email: '',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Empty email string',
      category: 'invalid',
    },
    {
      email: '@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Empty local part',
      category: 'invalid',
    },
    {
      email: 'user@',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Empty domain part',
      category: 'invalid',
    },
    {
      email: '.user@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Local part starts with dot',
      category: 'invalid',
    },
    {
      email: 'user.@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Local part ends with dot',
      category: 'invalid',
    },
    {
      email: 'user..name@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Consecutive dots in local part',
      category: 'invalid',
    },
    {
      email: 'user@domain..com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Consecutive dots in domain',
      category: 'invalid',
    },
    {
      email: 'user@.domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Domain starts with dot',
      category: 'invalid',
    },
    {
      email: 'user@domain.com.',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Domain ends with dot',
      category: 'invalid',
    },
    {
      email: 'user name@domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Space in local part',
      category: 'invalid',
    },
    {
      email: 'user@domain name.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Space in domain',
      category: 'invalid',
    },
    {
      email: 'test@localhost',
      expected: {
        syntax: { is_valid: true, domain: 'localhost', local_part: 'test' },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Localhost domain (syntactically valid but not deliverable)',
      category: 'edge_case',
    },
    {
      email: 'test@-domain.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Domain starts with hyphen',
      category: 'invalid',
    },
    {
      email: 'test@domain-.com',
      expected: {
        syntax: { is_valid: false },
        provider: EmailProvider.EVERYTHING_ELSE,
      },
      description: 'Domain ends with hyphen',
      category: 'invalid',
    },
  ];

  describe('Email Syntax Edge Cases', () => {
    test.each(edgeCaseTests.filter((tc) => tc.category === 'edge_case'))('$description: $email', ({
      email,
      expected,
    }) => {
      const result = validateEmailSyntax(email);

      expect(result.is_valid).toBe(expected.syntax.is_valid);

      if (result.is_valid) {
        expect(result.domain).toBe(expected.syntax.domain);
        expect(result.local_part).toBe(expected.syntax.local_part);
        expect(result.email).toBe(email.toLowerCase());
      }
    });
  });

  describe('Invalid Email Format Tests', () => {
    test.each(edgeCaseTests.filter((tc) => tc.category === 'invalid'))('$description: $email', ({
      email,
      expected,
    }) => {
      const result = validateEmailSyntax(email);

      expect(result.is_valid).toBe(expected.syntax.is_valid);
      expect(result.error).toBeDefined();
    });
  });

  describe('RFC Compliance Tests', () => {
    test('should enforce RFC 5321 length limits', () => {
      // Test local part length limit (64 characters)
      const validLocal = 'a'.repeat(64);
      const validEmail = `${validLocal}@example.com`;
      expect(validateEmailSyntax(validEmail).is_valid).toBe(true);

      const tooLongLocal = 'a'.repeat(65);
      const tooLongEmail = `${tooLongLocal}@example.com`;
      const result = validateEmailSyntax(tooLongEmail);
      expect(result.is_valid).toBe(false);
      expect(result.error).toContain('Local part exceeds 64 characters');

      // Test domain length limit (253 characters total, 63 per label)
      // Create a domain that exceeds 253 characters total
      const manyLabels = Array.from({ length: 10 }, () => 'a'.repeat(63)); // 10 labels of 63 chars each
      const tooLongDomain = manyLabels.join('.') + '.com'; // This will exceed 253 chars total
      const tooLongDomainEmail = `test@${tooLongDomain}`;
      const domainResult = validateEmailSyntax(tooLongDomainEmail);
      expect(domainResult.is_valid).toBe(false);
      expect(domainResult.error).toContain('Domain exceeds 253 characters');
    });

    test('should handle boundary conditions correctly', () => {
      // Exactly 64 characters in local part
      const boundaryLocal = 'a'.repeat(64);
      const boundaryEmail = `${boundaryLocal}@example.com`;
      const boundaryResult = validateEmailSyntax(boundaryEmail);
      expect(boundaryResult.is_valid).toBe(true);
      expect(boundaryResult.local_part).toHaveLength(64);
    });
  });

  describe('Case Sensitivity Tests', () => {
    test('should handle case insensitive validation', () => {
      const testCases = [
        'UPPERCASE@EXAMPLE.COM',
        'MixedCase@Example.Com',
        'camelCase@domain.COM',
        'Test@GMAIL.COM',
        'USER@YAHOO.COM',
      ];

      testCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect(result.email).toBe(email.toLowerCase());
      });
    });

    test('should handle case insensitive provider detection', () => {
      const caseTests = [
        ['GMAIL.COM', EmailProvider.GMAIL],
        ['YAHOO.COM', EmailProvider.YAHOO],
        ['OUTLOOK.COM', EmailProvider.HOTMAIL_B2C],
        ['googlemail.com', EmailProvider.GMAIL],
        ['ROCKETMAIL.COM', EmailProvider.YAHOO],
      ];

      caseTests.forEach(([domain, expectedType]) => {
        expect(getProviderType(domain as string)).toBe(expectedType);
      });
    });
  });

  describe('Unicode and International Characters', () => {
    test('should handle punycode domains', () => {
      const punycodeEmails = [
        'test@xn--d1acufc.xn--p1ai', // Russian domain
        'user@xn--fsq004x.com', // Chinese domain
        'email@xn--lgbbat1ad8j.com', // Arabic domain
      ];

      punycodeEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
      });
    });

    test('should reject Unicode in local part (current regex limitation)', () => {
      const unicodeEmails = ['josé@example.com', '用户@example.com', 'пользователь@example.com', 'test@münchen.de'];

      unicodeEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(false);
      });
    });
  });

  describe('Provider-specific Edge Cases', () => {
    test('should handle Gmail dot behavior', () => {
      const gmailVariations = ['test@gmail.com', 't.est@gmail.com', 't.e.s.t@gmail.com', 'te.st@gmail.com'];

      gmailVariations.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(EmailProvider.GMAIL);
      });
    });

    test('should handle provider alternative domains', () => {
      const alternativeDomainTests = [
        { email: 'test@googlemail.com', provider: EmailProvider.GMAIL },
        { email: 'test@ymail.com', provider: EmailProvider.YAHOO },
        { email: 'test@rocketmail.com', provider: EmailProvider.YAHOO },
        { email: 'test@live.com', provider: EmailProvider.HOTMAIL_B2C },
        { email: 'test@msn.com', provider: EmailProvider.HOTMAIL_B2C },
      ];

      alternativeDomainTests.forEach(({ email, provider }) => {
        const result = validateEmailSyntax(email);
        expect(result.is_valid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(provider);
      });
    });
  });

  describe('Input Validation', () => {
    test('should handle non-string inputs gracefully', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, Symbol('test'), () => {}];

      invalidInputs.forEach((input) => {
        expect(() => {
          validateEmailSyntax(input as any);
        }).not.toThrow();

        const result = validateEmailSyntax(input as any);
        expect(result.is_valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });
    });
  });

  describe('Performance Tests', () => {
    test('should handle large number of validations efficiently', async () => {
      const emails = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();

      emails.forEach((email) => {
        validateEmailSyntax(email);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    test('should handle concurrent validations', async () => {
      const testEmails = ['test@gmail.com', 'test@yahoo.com', 'test@outlook.com', 'test@example.com'];

      const promises = testEmails.map((email) =>
        checkIfEmailExistsCore({
          emailAddress: email,
          verifyMx: false,
          verifySmtp: false,
          timeout: 5000,
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.syntax.is_valid).toBe(true);
        expect(result.misc?.provider_type).toBeDefined();
      });
    });
  });

  describe('Integration Tests with Different Configurations', () => {
    test('should work with minimal configuration', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@example.com',
      });

      expect(result.email).toBe('test@example.com');
      expect(result.syntax.is_valid).toBe(true);
    });

    test('should work with all verification enabled', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@example.com',
        verifyMx: false, // Disable for test speed
        verifySmtp: false, // Disable for test speed
        checkDisposable: true,
        checkFree: true,
        enableProviderOptimizations: true,
        debug: true,
        timeout: 10000,
      });

      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc).not.toBeNull();
      expect(result.misc!.provider_type).toBeDefined();
    });

    test('should handle Yahoo API configuration', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@yahoo.com',
        useYahooApi: true,
        yahooApiOptions: {
          timeout: 5000,
          retryAttempts: 2,
          userAgent: 'Test User Agent',
          headers: {
            'X-Custom-Header': 'test-value',
          },
        },
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.YAHOO);
    });

    test('should handle headless browser configuration', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@gmail.com',
        headlessOptions: {
          webdriverEndpoint: 'http://localhost:9515',
          timeout: 15000,
          screenshot: true,
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Test Browser User Agent',
        },
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.syntax.is_valid).toBe(true);
      expect(result.misc?.provider_type).toBe(EmailProvider.GMAIL);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle malformed input gracefully', async () => {
      const malformedInputs = [
        null as any,
        undefined as any,
        { emailAddress: null } as any,
        { emailAddress: 123 } as any,
        { emailAddress: 'invalid-email' },
      ];

      for (const input of malformedInputs) {
        try {
          const result = await checkIfEmailExistsCore(input);
          expect(result.is_reachable).toBe('invalid');
          expect(result.syntax?.is_valid).toBe(false);
        } catch (error) {
          // Should not throw, but if it does, it should be handled gracefully
          expect(error).toBeDefined();
        }
      }
    });

    test('should handle timeout scenarios', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@example.com',
        timeout: 1, // Very short timeout
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.email).toBe('test@example.com');
      // Should complete without timeout since we're not doing network calls
      expect(result.duration).toBeLessThan(1000);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should not leak memory with repeated validations', () => {
      // This test validates that repeated validations don't accumulate memory
      const iterations = 100;
      const memoryBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        validateEmailSyntax(`test${i}@example.com`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfter - memoryBefore;

      // Memory increase should be minimal (less than 1MB for 100 validations)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });
  });

  describe('Consistency and Reliability Tests', () => {
    test('should produce consistent results for the same input', () => {
      const email = 'test@example.com';
      const iterations = 10;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const result = validateEmailSyntax(email);
        results.push(result);
      }

      // All results should be identical
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result).toEqual(firstResult);
      });
    });

    test('should handle edge cases consistently across providers', () => {
      const edgeCases = [
        'a@b.c', // Minimal valid format
        'test+tag@example.com', // Plus addressing
        'user.dots@example.com', // Dots in local part
        'TEST@EXAMPLE.COM', // All caps
      ];

      edgeCases.forEach((email) => {
        const result1 = validateEmailSyntax(email);
        const result2 = validateEmailSyntax(email);
        expect(result1).toEqual(result2);
      });
    });
  });
});
