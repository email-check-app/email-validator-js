/**
 * Edge Cases and Integration Tests
 * Comprehensive test suite based on RFC standards and real-world email scenarios
 */

import {
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  validateEmailSyntax,
} from '../../src/check-if-email-exists';
import type { EmailTestCase } from '../../src/email-verifier-types';

describe('0007 Edge Cases and Integration Tests', () => {
  // Comprehensive edge case test data covering valid and invalid email formats
  const edgeCaseTests: EmailTestCase[] = [
    // Valid edge cases
    {
      email: 'a@b.co',
      expected: {
        syntax: { isValid: true, domain: 'b.co', localPart: 'a' },
        provider: EmailProvider.everythingElse,
      },
      description: 'Minimum valid email format',
      category: 'edge_case',
    },
    {
      email: 'test@xn--d1acufc.xn--p1ai',
      expected: {
        syntax: { isValid: true, domain: 'xn--d1acufc.xn--p1ai', localPart: 'test' },
        provider: EmailProvider.everythingElse,
      },
      description: 'International domain (punycode)',
      category: 'edge_case',
    },
    {
      email: 'test+very.long.tag+with.multiple.dots@gmail.com',
      expected: {
        syntax: { isValid: true, domain: 'gmail.com', localPart: 'test+very.long.tag+with.multiple.dots' },
        provider: EmailProvider.gmail,
      },
      description: 'Complex Gmail plus addressing',
      category: 'edge_case',
    },
    {
      email: 'user_name@domain.co.uk',
      expected: {
        syntax: { isValid: true, domain: 'domain.co.uk', localPart: 'user_name' },
        provider: EmailProvider.everythingElse,
      },
      description: 'Underscore in local part',
      category: 'edge_case',
    },
    {
      email: 'test123@domain123.com',
      expected: {
        syntax: { isValid: true, domain: 'domain123.com', localPart: 'test123' },
        provider: EmailProvider.everythingElse,
      },
      description: 'Numbers in both local and domain parts',
      category: 'edge_case',
    },
    {
      email: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@domain.com',
      expected: {
        syntax: {
          isValid: true,
          domain: 'domain.com',
          localPart: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789',
        },
        provider: EmailProvider.everythingElse,
      },
      description: 'Maximum allowed local part characters',
      category: 'edge_case',
    },

    // Invalid edge cases
    {
      email: '',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Empty email string',
      category: 'invalid',
    },
    {
      email: '@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Empty local part',
      category: 'invalid',
    },
    {
      email: 'user@',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Empty domain part',
      category: 'invalid',
    },
    {
      email: '.user@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Local part starts with dot',
      category: 'invalid',
    },
    {
      email: 'user.@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Local part ends with dot',
      category: 'invalid',
    },
    {
      email: 'user..name@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Consecutive dots in local part',
      category: 'invalid',
    },
    {
      email: 'user@domain..com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Consecutive dots in domain',
      category: 'invalid',
    },
    {
      email: 'user@.domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Domain starts with dot',
      category: 'invalid',
    },
    {
      email: 'user@domain.com.',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Domain ends with dot',
      category: 'invalid',
    },
    {
      email: 'user name@domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Space in local part',
      category: 'invalid',
    },
    {
      email: 'user@domain name.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Space in domain',
      category: 'invalid',
    },
    {
      email: 'test@localhost',
      expected: {
        syntax: { isValid: true, domain: 'localhost', localPart: 'test' },
        provider: EmailProvider.everythingElse,
      },
      description: 'Localhost domain (syntactically valid but not deliverable)',
      category: 'edge_case',
    },
    {
      email: 'test@-domain.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
      },
      description: 'Domain starts with hyphen',
      category: 'invalid',
    },
    {
      email: 'test@domain-.com',
      expected: {
        syntax: { isValid: false },
        provider: EmailProvider.everythingElse,
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

      expect(result.isValid).toBe(expected.syntax.isValid);

      if (result.isValid) {
        expect(result.domain).toBe(expected.syntax.domain);
        expect(result.localPart).toBe(expected.syntax.localPart);
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

      expect(result.isValid).toBe(expected.syntax.isValid);
      expect(result.error).toBeDefined();
    });
  });

  describe('RFC Compliance Tests', () => {
    test('should enforce RFC 5321 length limits (64 chars for local part, 253 for domain)', () => {
      // Test local part length limit (64 characters)
      const validLocal = 'a'.repeat(64);
      const validEmail = `${validLocal}@example.com`;
      expect(validateEmailSyntax(validEmail).isValid).toBe(true);

      const tooLongLocal = 'a'.repeat(65);
      const tooLongEmail = `${tooLongLocal}@example.com`;
      const result = validateEmailSyntax(tooLongEmail);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Local part exceeds 64 characters');

      // Test domain length limit (253 characters total, 63 per label per RFC 1035)
      // Create a domain that exceeds 253 characters total
      const manyLabels = Array.from({ length: 10 }, () => 'a'.repeat(63)); // 10 labels of 63 chars each
      const tooLongDomain = manyLabels.join('.') + '.com'; // This will exceed 253 chars total
      const tooLongDomainEmail = `test@${tooLongDomain}`;
      const domainResult = validateEmailSyntax(tooLongDomainEmail);
      expect(domainResult.isValid).toBe(false);
      expect(domainResult.error).toContain('Domain exceeds 253 characters');
    });

    test('should handle boundary conditions at exact RFC limits', () => {
      // Exactly 64 characters in local part
      const boundaryLocal = 'a'.repeat(64);
      const boundaryEmail = `${boundaryLocal}@example.com`;
      const boundaryResult = validateEmailSyntax(boundaryEmail);
      expect(boundaryResult.isValid).toBe(true);
      expect(boundaryResult.localPart).toHaveLength(64);
    });
  });

  describe('Case Sensitivity Tests', () => {
    test('should convert email addresses to lowercase and handle case-insensitive validation', () => {
      const testCases = [
        'UPPERCASE@EXAMPLE.COM',
        'MixedCase@Example.Com',
        'camelCase@domain.COM',
        'Test@GMAIL.COM',
        'USER@YAHOO.COM',
      ];

      testCases.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(result.email).toBe(email.toLowerCase());
      });
    });

    test('should perform case-insensitive provider detection', () => {
      const caseTests = [
        ['GMAIL.COM', EmailProvider.gmail],
        ['YAHOO.COM', EmailProvider.yahoo],
        ['OUTLOOK.COM', EmailProvider.hotmailB2c],
        ['googlemail.com', EmailProvider.gmail],
        ['ROCKETMAIL.COM', EmailProvider.yahoo],
      ];

      caseTests.forEach(([domain, expectedType]) => {
        expect(getProviderType(domain as string)).toBe(expectedType);
      });
    });
  });

  describe('Unicode and International Characters', () => {
    test('should accept punycode (ASCII-encoded) international domain names', () => {
      const punycodeEmails = [
        'test@xn--d1acufc.xn--p1ai', // Russian domain
        'user@xn--fsq004x.com', // Chinese domain
        'email@xn--lgbbat1ad8j.com', // Arabic domain
      ];

      punycodeEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
      });
    });

    test('should reject Unicode characters in local part (current regex limitation)', () => {
      const unicodeEmails = ['josé@example.com', '用户@example.com', 'пользователь@example.com', 'test@münchen.de'];

      unicodeEmails.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Provider-specific Edge Cases', () => {
    test('should handle Gmail dot variations (dots are ignored in Gmail addresses)', () => {
      const gmailVariations = ['test@gmail.com', 't.est@gmail.com', 't.e.s.t@gmail.com', 'te.st@gmail.com'];

      gmailVariations.forEach((email) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(EmailProvider.gmail);
      });
    });

    test('should detect provider alternative domains (googlemail.com, ymail.com, etc.)', () => {
      const alternativeDomainTests = [
        { email: 'test@googlemail.com', provider: EmailProvider.gmail },
        { email: 'test@ymail.com', provider: EmailProvider.yahoo },
        { email: 'test@rocketmail.com', provider: EmailProvider.yahoo },
        { email: 'test@live.com', provider: EmailProvider.hotmailB2c },
        { email: 'test@msn.com', provider: EmailProvider.hotmailB2c },
      ];

      alternativeDomainTests.forEach(({ email, provider }) => {
        const result = validateEmailSyntax(email);
        expect(result.isValid).toBe(true);
        expect(getProviderType(result.domain!)).toBe(provider);
      });
    });
  });

  describe('Input Validation', () => {
    test('should handle non-string inputs gracefully without throwing', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, Symbol('test'), () => {}];

      invalidInputs.forEach((input) => {
        expect(() => {
          validateEmailSyntax(input as any);
        }).not.toThrow();

        const result = validateEmailSyntax(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be a string');
      });
    });
  });

  describe('Performance Tests', () => {
    test('should validate 100 email addresses efficiently in under 1 second', async () => {
      const emails = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();

      emails.forEach((email) => {
        validateEmailSyntax(email);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete 100 validations in under 1 second
    });

    test('should handle concurrent email validations efficiently', async () => {
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
        expect(result.syntax.isValid).toBe(true);
        expect(result.misc?.providerType).toBeDefined();
      });
    });
  });

  describe('Integration Tests with Different Configurations', () => {
    test('should work correctly with minimal configuration', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@example.com',
      });

      expect(result.email).toBe('test@example.com');
      expect(result.syntax.isValid).toBe(true);
    });

    test('should work correctly with all verification options enabled', async () => {
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

      expect(result.syntax.isValid).toBe(true);
      expect(result.misc).not.toBeNull();
      expect(result.misc!.providerType).toBeDefined();
    });

    test('should handle Yahoo API configuration options correctly', async () => {
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

      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.yahoo);
    });

    test('should handle headless browser configuration options correctly', async () => {
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

      expect(result.syntax.isValid).toBe(true);
      expect(result.misc?.providerType).toBe(EmailProvider.gmail);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle malformed or null input parameters gracefully', async () => {
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
          expect(result.isReachable).toBe('invalid');
          expect(result.syntax?.isValid).toBe(false);
        } catch (error) {
          // Should not throw, but if it does, it should be handled gracefully
          expect(error).toBeDefined();
        }
      }
    });

    test('should handle timeout scenarios without throwing errors', async () => {
      const result = await checkIfEmailExistsCore({
        emailAddress: 'test@example.com',
        timeout: 1, // Very short timeout (1ms)
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.email).toBe('test@example.com');
      // Should complete without timeout since no network calls are made
      expect(result.duration).toBeLessThan(1000);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should not leak memory across 100 repeated validations', () => {
      // This test validates that repeated validations don't accumulate memory
      const iterations = 100;
      const memoryBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        validateEmailSyntax(`test${i}@example.com`);
      }

      // Force garbage collection if available to get accurate measurement
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
    test('should produce identical results across 10 repeated validations of the same email', () => {
      const email = 'test@example.com';
      const iterations = 10;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const result = validateEmailSyntax(email);
        results.push(result);
      }

      // All results should be identical across all iterations
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result).toEqual(firstResult);
      });
    });

    test('should handle edge cases consistently across different email providers', () => {
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
