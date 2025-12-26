/**
 * Isolated test suite for network timeout handling during email verification
 */

import { checkIfEmailExistsCore } from '../../src/check-if-email-exists';

// Mock DNS module
jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

describe('0004 Network Timeout Handling', () => {
  let mockResolveMx: jest.MockedFunction<any>;

  beforeEach(() => {
    mockResolveMx = require('dns').promises.resolveMx;
    jest.clearAllMocks();
    mockResolveMx.mockClear();
    mockResolveMx.mockReset();
  });

  test('should handle DNS network timeout errors gracefully', async () => {
    mockResolveMx.mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('ETIMEDOUT operation timed out');
        (error as any).code = 'ETIMEDOUT';
        setTimeout(() => reject(error), 100);
      });
    });

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@slow-domain.com',
      verifyMx: true,
      verifySmtp: false,
      timeout: 50, // Very short timeout to trigger timeout error
    });

    expect(result.isReachable).toBe('invalid'); // MX timeout makes the email unreachable/invalid
    expect(result.mx?.error).toBeDefined();
    expect(result.mx?.error).toContain('operation timed out');
  });

  test('should successfully complete MX lookup when DNS responds quickly', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', preference: 10 }]);

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: true,
      verifySmtp: false,
    });

    expect(result.isReachable).toBe('unknown'); // No SMTP verification performed
    expect(result.mx?.success).toBe(true);
    expect(result.smtp).toBeNull();
  });

  test('should handle DNS lookup failures with proper error reporting', async () => {
    mockResolveMx.mockRejectedValue(new Error('DNS lookup failed'));

    const result = await checkIfEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: true,
      verifySmtp: false,
    });

    expect(result.isReachable).toBe('invalid'); // MX lookup failed
    expect(result.mx?.success).toBe(false);
    expect(result.mx?.error).toBeDefined();
    expect(result.mx?.error).toContain('lookup failed');
  });
});
