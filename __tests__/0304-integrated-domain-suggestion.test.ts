import { verifyEmail, verifyEmailBatch } from '../src';
import type { DomainSuggestionMethod } from '../src/types';

describe('0304-integrated-domain-suggestion', () => {
  describe('verifyEmail with domain suggestion enabled', () => {
    it('should include domain suggestion for typos', async () => {
      const result = await verifyEmail({
        emailAddress: 'john@gmial.com',
        suggestDomain: true,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion).toBeTruthy();
      expect(result.domainSuggestion?.suggested).toBe('john@gmail.com');
      expect(result.domainSuggestion?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should not include domain suggestion by default', async () => {
      const result = await verifyEmail({
        emailAddress: 'john@gmial.com',
        suggestDomain: false,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion).toBeUndefined();
    });

    it('should return null suggestion for valid common domains', async () => {
      const result = await verifyEmail({
        emailAddress: 'john@gmail.com',
        suggestDomain: true,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion).toBeNull();
    });

    it('should use custom domain suggestion method when provided', async () => {
      const customMethod: DomainSuggestionMethod = (domain: string) => {
        if (domain === 'company.co') {
          return {
            original: domain,
            suggested: 'company.com',
            confidence: 0.95,
          };
        }
        return null;
      };

      const result = await verifyEmail({
        emailAddress: 'user@company.co',
        suggestDomain: true,
        domainSuggestionMethod: customMethod,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion?.suggested).toBe('company.com');
      expect(result.domainSuggestion?.confidence).toBe(0.95);
    });

    it('should not suggest for invalid format emails', async () => {
      const result = await verifyEmail({
        emailAddress: 'invalid.email.gmial.com',
        suggestDomain: true,
      });

      expect(result.validFormat).toBe(false);
      // Domain suggestion not attempted for invalid formats
      expect(result.domainSuggestion).toBeUndefined();
    });

    it('should use custom common domains list when provided', async () => {
      const customDomains = ['mycompany.com', 'ourservice.org'];

      const result = await verifyEmail({
        emailAddress: 'user@mycompny.com',
        suggestDomain: true,
        commonDomains: customDomains,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion?.suggested).toBe('user@mycompany.com');
    });
  });

  describe('verifyEmail with domain suggestion in detailed mode', () => {
    it('should include domain suggestion by default when verification is disabled', async () => {
      const result = await verifyEmail({
        emailAddress: 'jane@yaho.com',
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion).toBeTruthy();
      expect(result.domainSuggestion?.suggested).toBe('jane@yahoo.com');
    });

    it('should not suggest domain when suggestDomain is explicitly false', async () => {
      const result = await verifyEmail({
        emailAddress: 'jane@yaho.com',
        suggestDomain: false,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.validFormat).toBe(true);
      expect(result.domainSuggestion).toBeUndefined(); // undefined when disabled
    });

    it('should not suggest domain for invalid email format', async () => {
      const result = await verifyEmail({
        emailAddress: 'not.an.email.gmial.com',
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.validFormat).toBe(false);
      expect(result.domainSuggestion).toBeUndefined();
    });

    it('should combine domain suggestion with name detection', async () => {
      const result = await verifyEmail({
        emailAddress: 'john.doe@gmial.com',
        detectName: true,
        suggestDomain: true,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.validFormat).toBe(true);
      expect(result.detectedName?.firstName).toBe('John');
      expect(result.detectedName?.lastName).toBe('Doe');
      expect(result.domainSuggestion?.suggested).toBe('john.doe@gmail.com');
    });
  });

  describe('verifyEmailBatch with domain suggestion', () => {
    it('should suggest domains for multiple emails', async () => {
      const emails = ['user1@gmial.com', 'user2@yaho.com', 'user3@gmail.com', 'user4@hotmai.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        suggestDomain: true,
        verifyMx: false,
        verifySmtp: false,
      });

      expect(result.summary.total).toBe(4);

      const user1Result = result.results.get('user1@gmial.com');
      expect(user1Result?.domainSuggestion?.suggested).toBe('user1@gmail.com');

      const user2Result = result.results.get('user2@yaho.com');
      expect(user2Result?.domainSuggestion?.suggested).toBe('user2@yahoo.com');

      const user3Result = result.results.get('user3@gmail.com');
      expect(user3Result?.domainSuggestion).toBeNull(); // No suggestion for valid domains

      const user4Result = result.results.get('user4@hotmai.com');
      expect(user4Result?.domainSuggestion?.suggested).toBe('user4@hotmail.com');
    });

    it('should work in detailed batch mode', async () => {
      const emails = ['alice@outlok.com', 'bob@proton.me'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        suggestDomain: true,
        verifyMx: false,
        verifySmtp: false,
        checkDisposable: false,
        checkFree: false,
      });

      const aliceResult = result.results.get('alice@outlok.com');
      expect(aliceResult?.domainSuggestion?.suggested).toBe('alice@outlook.com');

      const bobResult = result.results.get('bob@proton.me');
      expect(bobResult?.domainSuggestion).toBeNull(); // No suggestion for valid domain
    });

    it('should use custom suggestion method in batch', async () => {
      const customMethod: DomainSuggestionMethod = (domain: string) => {
        if (domain.endsWith('.co')) {
          return {
            original: domain,
            suggested: domain.replace('.co', '.com'),
            confidence: 0.9,
          };
        }
        return null;
      };

      const emails = ['test1@example.co', 'test2@sample.co', 'test3@valid.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        suggestDomain: true,
        domainSuggestionMethod: customMethod,
        verifyMx: false,
        verifySmtp: false,
      });

      const test1Result = result.results.get('test1@example.co');
      expect(test1Result?.domainSuggestion?.suggested).toBe('example.com');

      const test2Result = result.results.get('test2@sample.co');
      expect(test2Result?.domainSuggestion?.suggested).toBe('sample.com');

      const test3Result = result.results.get('test3@valid.com');
      expect(test3Result?.domainSuggestion).toBeNull();
    });

    it('should combine domain suggestion with name detection in batch', async () => {
      const emails = ['john.doe@gmial.com'];

      const result = await verifyEmailBatch({
        emailAddresses: emails,
        detectName: true,
        suggestDomain: true,
        verifyMx: false,
        verifySmtp: false,
      });

      const johnResult = result.results.get('john.doe@gmial.com');
      expect(johnResult?.detectedName?.firstName).toBe('John');
      expect(johnResult?.detectedName?.lastName).toBe('Doe');
      expect(johnResult?.domainSuggestion?.suggested).toBe('john.doe@gmail.com');
    });
  });
});
