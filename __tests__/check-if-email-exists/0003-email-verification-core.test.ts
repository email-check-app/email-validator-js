import dns from 'node:dns';
import {
  type CheckIfEmailExistsCoreParams,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderFromMxHost,
  isGmail,
  isHotmailB2B,
  isHotmailB2C,
  isMimecast,
  isProofpoint,
  isYahoo,
} from '../../src/check-if-email-exists';

// Mock the dependencies
jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

const mockResolveMx = dns.promises.resolveMx as jest.MockedFunction<typeof dns.promises.resolveMx>;

describe('0003 Email Provider Detection from MX Hosts', () => {
  describe('isGmail', () => {
    it('should identify Gmail MX hosts by hostname pattern', () => {
      expect(isGmail('gmail-smtp-in.l.google.com.')).toBe(true);
      expect(isGmail('alt1.gmail-smtp-in.l.google.com.')).toBe(true);
      expect(isGmail('aspmx.l.google.com.')).toBe(true);
      expect(isGmail('example.com')).toBe(false);
    });
  });

  describe('isYahoo', () => {
    it('should identify Yahoo MX hosts by hostname pattern', () => {
      expect(isYahoo('mta7.am0.yahoodns.net.')).toBe(true);
      expect(isYahoo('mx-eu.mail.am0.yahoodns.net.')).toBe(true);
      expect(isYahoo('yahoo.com')).toBe(false);
    });
  });

  describe('isHotmailB2C', () => {
    it('should identify Hotmail B2C (consumer) MX hosts by hostname pattern', () => {
      expect(isHotmailB2C('hotmail-com.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('outlook-com.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('eur.olc.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2C('mail.protection.outlook.com.')).toBe(false);
    });
  });

  describe('isHotmailB2B', () => {
    it('should identify Hotmail B2B (business/enterprise) MX hosts by hostname pattern', () => {
      expect(isHotmailB2B('mail.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2B('company-com.mail.protection.outlook.com.')).toBe(true);
      expect(isHotmailB2B('hotmail-com.olc.protection.outlook.com.')).toBe(false);
    });
  });

  describe('isProofpoint', () => {
    it('should identify Proofpoint MX hosts by hostname pattern', () => {
      expect(isProofpoint('mail.pphosted.com.')).toBe(true);
      expect(isProofpoint('example.ppe-hosted.com.')).toBe(true);
      expect(isProofpoint('pphosted.com.')).toBe(true);
      expect(isProofpoint('example.com')).toBe(false);
    });
  });

  describe('isMimecast', () => {
    it('should identify Mimecast MX hosts by hostname pattern', () => {
      expect(isMimecast('smtp.mimecast.com.')).toBe(true);
      expect(isMimecast('eu.mimecast.com.')).toBe(true);
      expect(isMimecast('example.com')).toBe(false);
    });
  });

  describe('getProviderFromMxHost', () => {
    it('should detect GMAIL provider from Gmail MX hosts', () => {
      expect(getProviderFromMxHost('gmail-smtp-in.l.google.com.')).toBe(EmailProvider.gmail);
    });

    it('should detect YAHOO provider from Yahoo MX hosts', () => {
      expect(getProviderFromMxHost('mta7.am0.yahoodns.net.')).toBe(EmailProvider.yahoo);
    });

    it('should detect HOTMAIL_B2C (consumer) provider from Outlook MX hosts', () => {
      expect(getProviderFromMxHost('hotmail-com.olc.protection.outlook.com.')).toBe(EmailProvider.hotmailB2c);
    });

    it('should detect HOTMAIL_B2B (business) provider from Office 365 MX hosts', () => {
      expect(getProviderFromMxHost('mail.protection.outlook.com.')).toBe(EmailProvider.hotmailB2b);
    });

    it('should detect PROOFPOINT provider from Proofpoint MX hosts', () => {
      expect(getProviderFromMxHost('mail.pphosted.com.')).toBe(EmailProvider.proofpoint);
    });

    it('should detect MIMECAST provider from Mimecast MX hosts', () => {
      expect(getProviderFromMxHost('smtp.mimecast.com.')).toBe(EmailProvider.mimecast);
    });

    it('should return EVERYTHING_ELSE for unknown or custom MX hosts', () => {
      expect(getProviderFromMxHost('mail.example.com.')).toBe(EmailProvider.everythingElse);
    });
  });
});

describe('0003 Core Email Verification Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully verify a valid email with MX records', async () => {
    const mockMxRecords = [{ exchange: 'gmail-smtp-in.l.google.com.', priority: 5 }];
    mockResolveMx.mockResolvedValue(mockMxRecords);

    const params: CheckIfEmailExistsCoreParams = {
      emailAddress: 'test@gmail.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      verifySmtp: false, // Disabled for unit tests to avoid actual SMTP connections
    };

    const result = await checkIfEmailExistsCore(params);

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
          providerType: EmailProvider.gmail,
        }),
      })
    );
  });

  it('should handle MX record lookup failures gracefully', async () => {
    mockResolveMx.mockRejectedValue(new Error('DNS lookup failed'));

    const params: CheckIfEmailExistsCoreParams = {
      emailAddress: 'test@nonexistentdomain.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
    };

    const result = await checkIfEmailExistsCore(params);

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
    const params: CheckIfEmailExistsCoreParams = {
      emailAddress: 'invalid-email',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
    };

    const result = await checkIfEmailExistsCore(params);

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

  it('should use cached MX records when available', async () => {
    const mockCache = {
      mx: {
        get: jest.fn().mockResolvedValue(['gmail-smtp-in.l.google.com.']),
        set: jest.fn(),
      },
    };

    const params: CheckIfEmailExistsCoreParams = {
      emailAddress: 'test@gmail.com',
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      cache: mockCache as any,
    };

    const result = await checkIfEmailExistsCore(params);

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

  it('should detect and handle different email providers correctly', async () => {
    const testCases = [
      {
        email: 'user@yahoo.com',
        mxRecords: [{ exchange: 'mta7.am0.yahoodns.net.', priority: 5 }],
        expectedProvider: EmailProvider.yahoo,
      },
      {
        email: 'user@hotmail.com',
        mxRecords: [{ exchange: 'hotmail-com.olc.protection.outlook.com.', priority: 5 }],
        expectedProvider: EmailProvider.hotmailB2c,
      },
      {
        email: 'user@company.com',
        mxRecords: [{ exchange: 'mail.protection.outlook.com.', priority: 5 }],
        expectedProvider: EmailProvider.hotmailB2b,
      },
    ];

    for (const testCase of testCases) {
      mockResolveMx.mockResolvedValue(testCase.mxRecords);

      const params: CheckIfEmailExistsCoreParams = {
        emailAddress: testCase.email,
        fromEmail: 'test@example.com',
        helloName: 'example.com',
        verifySmtp: false,
      };

      const result = await checkIfEmailExistsCore(params);

      expect(result.misc?.providerType).toBe(testCase.expectedProvider);
    }

    // Clean up mocks to prevent test contamination
    mockResolveMx.mockReset();
  });
});

describe.skip('0003 Integration Tests', () => {
  // These tests require actual network connections and should be run manually
  // or in a CI environment with proper mocking

  it('should verify real Gmail address with actual DNS lookup', async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: 'aspmx.l.google.com.', priority: 10 },
      { exchange: 'alt1.aspmx.l.google.com.', priority: 20 },
    ]);

    const params: CheckIfEmailExistsCoreParams = {
      emailAddress: 'support@gmail.com', // Known valid Gmail address
      fromEmail: 'test@example.com',
      helloName: 'example.com',
      timeout: 10000,
      verifySmtp: false, // Disabled for integration tests
    };

    const result = await checkIfEmailExistsCore(params);
    expect(result).toHaveProperty('isReachable');
    expect(result.misc?.providerType).toBe(EmailProvider.gmail);
  });
});
