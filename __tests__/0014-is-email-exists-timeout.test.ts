// 0014: Network Timeout Handling Tests
//
// Isolated test for network timeout handling

import { isEmailExistsCore } from '../src/is-email-exists';

// Mock DNS module
jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

describe('Network Timeout Handling', () => {
  let mockResolveMx: jest.MockedFunction<any>;

  beforeEach(() => {
    mockResolveMx = require('dns').promises.resolveMx;
    jest.clearAllMocks();
    mockResolveMx.mockClear();
    mockResolveMx.mockReset();
  });

  test('should handle network timeouts gracefully', async () => {
    mockResolveMx.mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('ETIMEDOUT operation timed out');
        (error as any).code = 'ETIMEDOUT';
        setTimeout(() => reject(error), 100);
      });
    });

    const result = await isEmailExistsCore({
      emailAddress: 'test@slow-domain.com',
      verifyMx: true,
      verifySmtp: false,
      timeout: 50, // Very short timeout
    });

    expect(result.isReachable).toBe('invalid'); // MX timeout makes it unreachable/invalid
    expect(result.mx?.error).toBeDefined();
    expect(result.mx?.error).toContain('operation timed out');
  });

  test('should handle MX lookup success', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', preference: 10 }]);

    const result = await isEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: true,
      verifySmtp: false,
    });

    expect(result.isReachable).toBe('unknown'); // No SMTP verification
    expect(result.mx?.success).toBe(true);
    expect(result.smtp).toBeNull();
  });

  test('should handle MX lookup failure', async () => {
    mockResolveMx.mockRejectedValue(new Error('DNS lookup failed'));

    const result = await isEmailExistsCore({
      emailAddress: 'test@example.com',
      verifyMx: true,
      verifySmtp: false,
    });

    expect(result.isReachable).toBe('invalid'); // MX lookup failed
    expect(result.mx?.success).toBe(false);
    expect(result.mx?.error).toBeDefined();
  });
});
