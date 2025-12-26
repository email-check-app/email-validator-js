// 0007: Core Email Verification Tests
//
// Tests the core is-email-exists functionality ported from Rust

import dns from 'node:dns';
import {
  EmailProvider,
  getProviderFromMxHost,
  type IIsEmailExistsCoreParams,
  isEmailExistsCore,
  isGmail,
  isHotmailB2B,
  isHotmailB2C,
  isMimecast,
  isProofpoint,
  isYahoo,
} from '../src/is-email-exists';

// Mock the dependencies
jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

const mockResolveMx = dns.promises.resolveMx as jest.MockedFunction<typeof dns.promises.resolveMx>;

describe('0007: Email Provider Detection', () => {
  describe('isGmail', () => {
    it('should identify Gmail MX hosts', () => {
      expect(isGmail('gmail-smtp-in.l.google.com.')).toBe(true);
      expect(isGmail('alt1.gmail-smtp-in.l.google.com.')).toBe(true);
      expect(isGmail('aspmx.l.google.com.')).toBe(true);
      expect(isGmail('example.com')).toBe(false);
    });
  });

  describe('isYahoo', () => {
    it('should identify Yahoo MX hosts', () => {
      expect(isYahoo('mta7.am0.yahoodns.net.')).toBe(true);
      expect(isYahoo('mx-eu.mail.am0.yahoodns.net.')).toBe(true);
      expect(isYahoo('yahoo.com')).toBe(false);
    });
  });

  describe('isHotmailB2C', () => {
    it('should identify Hotmail B2C MX hosts', () => {
      expect(isHotmailB2C('hotmail-com.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('outlook-com.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('eur.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('mail.protection.outlook.com.')).toBe(false);
    });
  });

  describe('isHotmailB2B', () => {
    it('should identify Hotmail B2B MX hosts', () => {
      expect(isHotmailB2B('mail.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2B('company-com.mail.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2B('hotmail-com.olc.protection.outlook.com.')).toBe(false);
    });
  });

  describe('isProofpoint', () => {
    it('should identify Proofpoint MX hosts', () => {
      expect(isProofpoint('mail.pphosted.com.')).toBe(true);
      expect(isProofpoint('example.ppe-hosted.com.')).toBe(true);
      expect(isProofpoint('pphosted.com.')).toBe(true);
      expect(isProofpoint('example.com')).toBe(false);
    });
  });

  describe('isMimecast', () => {
    it('should identify Mimecast MX hosts', () => {
      expect(isMimecast('smtp.mimecast.com.')).toBe(true);
      expect(isMimecast('eu.mimecast.com.')).toBe(true);
      expect(isMimecast('example.com')).toBe(false);
    });
  });

  describe('getProviderFromMxHost', () => {
    it('should detect Gmail provider', () => {
      expect(getProviderFromMxHost('gmail-smtp-in.l.google.com.')).toBe(EmailProvider.GMAIL);
    });

    it('should detect Yahoo provider', () => {
      expect(getProviderFromMxHost('mta7.am0.yahoodns.net.')).toBe(EmailProvider.YAHOO);
    });

    it('should detect Hotmail B2C provider', () => {
      expect(getProviderFromMxHost('hotmail-com.olc.protection.outlook.com.')).toBe(EmailProvider.HOTMAIL_B2C);
    });

    it('should detect Hotmail B2B provider', () => {
      expect(getProviderFromMxHost('mail.protection.outlook.com.')).toBe(EmailProvider.HOTMAIL_B2B);
    });

    it('should detect Proofpoint provider', () => {
      expect(getProviderFromMxHost('mail.pphosted.com.')).toBe(EmailProvider.PROOFPOINT);
    });

    it('should detect Mimecast provider', () => {
      expect(getProviderFromMxHost('smtp.mimecast.com.')).toBe(EmailProvider.MIMECAST);
    });

    it('should default to EverythingElse for unknown providers', () => {
      expect(getProviderFromMxHost('mail.example.com.')).toBe(EmailProvider.EVERYTHING_ELSE);
    });
  });
});

describe('0007: isEmailExistsCore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully verify a valid email', async () => {
    const mockMxRecords = [{ exchange: 'gmail-smtp-in.l.google.com.', priority: 5 }];
    mockResolveMx.mockResolvedValue(mockMxRecords);

    const params: IIsEmailExistsCoreParams = {
      emailAddress: 'test@gmail.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      verifySmtp: false, // Keep false for unit tests to avoid actual SMTP connections
    };

    const result = await isEmailExistsCore(params);

    expect(result).toEqual(
      expect.objectContaining({
        email: 'test@gmail.com',
        isReachable: expect.any(String),
        syntax: expect.objectContaining({
          isValid: true,
          domain: 'gmail.com',
        }),
        mx: expect.objectContaining({
          success: true,
          records: mockMxRecords,
        }),
        misc: expect.objectContaining({
          providerType: EmailProvider.GMAIL,
        }),
      })
    );
  });

  it('should handle MX record lookup failures', async () => {
    mockResolveMx.mockRejectedValue(new Error('DNS lookup failed'));

    const params: IIsEmailExistsCoreParams = {
      emailAddress: 'test@nonexistentdomain.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
    };

    const result = await isEmailExistsCore(params);

    expect(result).toEqual(
      expect.objectContaining({
        email: 'test@nonexistentdomain.com',
        isReachable: 'invalid',
        mx: expect.objectContaining({
          success: false,
          records: [],
        }),
      })
    );
  });

  it('should handle invalid email format', async () => {
    const params: IIsEmailExistsCoreParams = {
      emailAddress: 'invalid-email',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
    };

    const result = await isEmailExistsCore(params);

    expect(result).toEqual(
      expect.objectContaining({
        email: 'invalid-email',
        isReachable: 'invalid',
        syntax: expect.objectContaining({
          isValid: false,
        }),
        mx: null,
        smtp: null,
      })
    );
  });

  it('should use cached results when available', async () => {
    const mockCache = {
      mx: {
        get: jest.fn().mockResolvedValue(['gmail-smtp-in.l.google.com.']),
        set: jest.fn(),
      },
    };

    const params: IIsEmailExistsCoreParams = {
      emailAddress: 'test@gmail.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      cache: mockCache as any,
    };

    const result = await isEmailExistsCore(params);

    expect(mockCache.mx.get).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        email: 'test@gmail.com',
        syntax: expect.objectContaining({
          isValid: true,
        }),
      })
    );
  });

  it('should handle different providers correctly', async () => {
    const testCases = [
      {
        email: 'user@yahoo.com',
        mxRecords: [{ exchange: 'mta7.am0.yahoodns.net.', priority: 5 }],
        expectedProvider: EmailProvider.YAHOO,
      },
      {
        email: 'user@hotmail.com',
        mxRecords: [{ exchange: 'hotmail-com.olc.protection.outlook.com.', priority: 5 }],
        expectedProvider: EmailProvider.HOTMAIL_B2C,
      },
      {
        email: 'user@company.com',
        mxRecords: [{ exchange: 'mail.protection.outlook.com.', priority: 5 }],
        expectedProvider: EmailProvider.HOTMAIL_B2B,
      },
    ];

    for (const testCase of testCases) {
      mockResolveMx.mockResolvedValue(testCase.mxRecords);

      const params: IIsEmailExistsCoreParams = {
        emailAddress: testCase.email,
        fromEmail: 'test@example.com',
        helloName: 'example.com',
        verifySmtp: false,
      };

      const result = await isEmailExistsCore(params);

      expect(result.misc?.providerType).toBe(testCase.expectedProvider);
    }

    // Clean up mocks to prevent test contamination
    mockResolveMx.mockReset();
  });
});

describe.skip('0007: Integration Tests', () => {
  // These tests require actual network connections and should be run manually
  // or in a CI environment with proper mocking

  it('should handle real Gmail addresses (integration test)', async () => {
    // Restore original DNS resolution for integration test
    mockResolveMx.mockRestore();

    const params: IIsEmailExistsCoreParams = {
      emailAddress: 'support@gmail.com', // This is a known valid Gmail address
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      timeout: 10000,
      verifySmtp: false,
    };

    const result = await isEmailExistsCore(params);
    expect(result).toHaveProperty('isReachable');
    expect(result.misc?.providerType).toBe(EmailProvider.GMAIL);
  });
});
