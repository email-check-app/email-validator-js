/**
 * Tests for SMTP verification functionality
 */

import { type CheckIfEmailExistsSmtpOptions, EmailProvider, verifySmtpConnection } from '../src/check-if-email-exists';

// Mock net.Socket
jest.mock('net', () => {
  const mockSocket = {
    connect: jest.fn(),
    write: jest.fn(),
    destroy: jest.fn(),
    setTimeout: jest.fn(),
    on: jest.fn(),
  };

  return {
    Socket: jest.fn(() => mockSocket),
  };
});

// Mock setTimeout to prevent actual waiting
jest.useFakeTimers();

describe('SMTP Verification', () => {
  const mockSocket = require('net').Socket() as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connect.mockClear();
    mockSocket.write.mockClear();
    mockSocket.destroy.mockClear();
    mockSocket.on.mockClear();
    mockSocket.setTimeout.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('verifySmtpConnection', () => {
    test('should handle Gmail provider with optimizations', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 30000,
        fromEmail: 'test@example.com',
        helloName: 'example.com',
        port: 25,
        retries: 1,
      };

      // Mock successful connection
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      // This test focuses on the provider optimization logic
      const promise = verifySmtpConnection(
        'test@gmail.com',
        'gmail.com',
        'smtp.gmail.com',
        options,
        EmailProvider.GMAIL
      );

      // Fast-forward timers
      jest.runAllTimers();

      const result = await promise;
      expect(result.provider_used).toBe(EmailProvider.GMAIL);
    });

    test('should handle connection timeout', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          // Don't trigger any callbacks to simulate timeout
        }
      });

      const promise = verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      // Fast-forward past timeout
      jest.advanceTimersByTime(6000);

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should handle connection errors', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection refused')), 0);
        }
      });

      const result = await verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      expect(result.success).toBe(false);
      expect(result.can_connect).toBe(false);
      expect(result.error).toContain('Failed to connect');
    });

    test('should retry on failure', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 1000,
        retries: 2,
      };

      let attemptCount = 0;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => {
            attemptCount++;
            callback(new Error('Connection failed'));
          }, 0);
        }
      });

      const promise = verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      // Fast-forward through retries
      jest.advanceTimersByTime(3000);

      const result = await promise;

      // Should have attempted 3 times (initial + 2 retries)
      expect(attemptCount).toBe(3);
      expect(result.success).toBe(false);
    });

    test('should use custom SMTP options', async () => {
      const customOptions: CheckIfEmailExistsSmtpOptions = {
        timeout: 15000,
        fromEmail: 'custom@domain.com',
        helloName: 'custom.com',
        port: 587,
        retries: 3,
        useStartTls: true,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const promise = verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', customOptions);

      jest.runAllTimers();

      // Verify socket connection with custom port
      expect(mockSocket.connect).toHaveBeenCalledWith(587, 'smtp.example.com');

      await promise;
    });

    test('should handle different provider types', async () => {
      const providers = [
        EmailProvider.GMAIL,
        EmailProvider.YAHOO,
        EmailProvider.HOTMAIL_B2C,
        EmailProvider.EVERYTHING_ELSE,
      ];

      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      for (const providerType of providers) {
        const promise = verifySmtpConnection(
          'test@example.com',
          'example.com',
          'smtp.example.com',
          options,
          providerType
        );

        jest.runAllTimers();

        const result = await promise;
        expect(result.provider_used).toBe(providerType);
      }
    });
  });

  describe('SMTP State Management', () => {
    test('should handle EHLO command sequence', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
        fromEmail: 'sender@example.com',
        helloName: 'client.com',
      };

      const stateSequence: string[] = [];
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          // Simulate SMTP response sequence
          setTimeout(() => {
            stateSequence.push('connect');
            callback('220 smtp.example.com ESMTP\r\n');
          }, 0);
          setTimeout(() => {
            stateSequence.push('ehlo');
            callback('250-smtp.example.com\r\n250-SIZE 52428800\r\n250 HELP\r\n');
          }, 10);
          setTimeout(() => {
            stateSequence.push('mail_from');
            callback('250 OK\r\n');
          }, 20);
          setTimeout(() => {
            stateSequence.push('rcpt_to');
            callback('250 Accepted\r\n');
          }, 30);
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await verifySmtpConnection('recipient@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(mockSocket.write).toHaveBeenCalledWith('EHLO client.com\r\n');
      expect(mockSocket.write).toHaveBeenCalledWith('MAIL FROM:<sender@example.com>\r\n');
      expect(mockSocket.write).toHaveBeenCalledWith('RCPT TO:<recipient@example.com>\r\n');

      expect(result.success).toBe(true);
      expect(result.is_deliverable).toBe(true);
    });

    test('should fallback to HELO if EHLO fails', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      let heloAttempted = false;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            callback('220 smtp.example.com\r\n');
          }, 0);
          setTimeout(() => {
            // EHLO fails
            callback('502 Command not implemented\r\n');
          }, 10);
          setTimeout(() => {
            // Should try HELO
            heloAttempted = true;
            callback('250 Hello\r\n');
          }, 20);
          setTimeout(() => {
            callback('250 OK\r\n');
          }, 30);
          setTimeout(() => {
            callback('250 Accepted\r\n');
          }, 40);
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(heloAttempted).toBe(true);
      expect(result.success).toBe(true);
    });

    test('should handle mailbox not found (550)', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('220 smtp.example.com\r\n'), 0);
          setTimeout(() => callback('250 Hello\r\n'), 10);
          setTimeout(() => callback('250 OK\r\n'), 20);
          setTimeout(() => callback('550 No such mailbox\r\n'), 30); // Mailbox not found
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await verifySmtpConnection('nonexistent@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(result.success).toBe(true);
      expect(result.is_deliverable).toBe(false);
      expect(result.can_connect).toBe(true);
    });

    test('should handle full mailbox (452)', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('220 smtp.example.com\r\n'), 0);
          setTimeout(() => callback('250 Hello\r\n'), 10);
          setTimeout(() => callback('250 OK\r\n'), 20);
          setTimeout(() => callback('452 Mailbox full\r\n'), 30); // Mailbox full
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await verifySmtpConnection('full@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(result.success).toBe(true);
      expect(result.is_deliverable).toBe(false);
      expect(result.has_full_inbox).toBe(true);
    });

    test('should handle unexpected SMTP responses', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('220 smtp.example.com\r\n'), 0);
          setTimeout(() => callback('421 Service not available\r\n'), 10); // Unexpected error
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(result.success).toBe(true);
      expect(result.is_deliverable).toBeNull(); // Unknown status
    });
  });

  describe('Provider-Specific Optimizations', () => {
    test('should use Gmail-specific settings', async () => {
      const baseOptions: CheckIfEmailExistsSmtpOptions = {
        timeout: 30000,
        port: 25,
        retries: 3,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const promise = verifySmtpConnection(
        'test@gmail.com',
        'gmail.com',
        'smtp.gmail.com',
        baseOptions,
        EmailProvider.GMAIL
      );

      jest.runAllTimers();

      // Gmail optimization should use port 587
      expect(mockSocket.connect).toHaveBeenCalledWith(587, 'smtp.gmail.com');

      await promise;
    });

    test('should use Yahoo-specific settings', async () => {
      const baseOptions: CheckIfEmailExistsSmtpOptions = {
        timeout: 30000,
        port: 25,
        retries: 3,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const promise = verifySmtpConnection(
        'test@yahoo.com',
        'yahoo.com',
        'smtp.mail.yahoo.com',
        baseOptions,
        EmailProvider.YAHOO
      );

      jest.runAllTimers();

      // Yahoo optimization should use port 587
      expect(mockSocket.connect).toHaveBeenCalledWith(587, 'smtp.mail.yahoo.com');

      await promise;
    });

    test('should use Hotmail-specific settings', async () => {
      const baseOptions: CheckIfEmailExistsSmtpOptions = {
        timeout: 30000,
        port: 25,
        retries: 3,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const promise = verifySmtpConnection(
        'test@hotmail.com',
        'hotmail.com',
        'smtp.live.com',
        baseOptions,
        EmailProvider.HOTMAIL_B2C
      );

      jest.runAllTimers();

      // Hotmail optimization should use port 587
      expect(mockSocket.connect).toHaveBeenCalledWith(587, 'smtp.live.com');

      await promise;
    });

    test('should use default settings for unknown providers', async () => {
      const baseOptions: CheckIfEmailExistsSmtpOptions = {
        timeout: 30000,
        port: 25,
        retries: 3,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      const promise = verifySmtpConnection(
        'test@customdomain.com',
        'customdomain.com',
        'smtp.customdomain.com',
        baseOptions,
        EmailProvider.EVERYTHING_ELSE
      );

      jest.runAllTimers();

      // Should use the original port (25) for unknown providers
      expect(mockSocket.connect).toHaveBeenCalledWith(25, 'smtp.customdomain.com');

      await promise;
    });
  });

  describe('Error Recovery', () => {
    test('should handle partial SMTP responses', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          // Send partial response, then complete it
          setTimeout(() => callback('250-smtp.example.com\r\n'), 0);
          setTimeout(() => callback('250-SIZE 52428800\r\n'), 10);
          setTimeout(() => callback('250 HELP\r\n'), 20);
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      // Should not throw on partial responses
      await expect(
        verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options)
      ).resolves.toBeDefined();
    });

    test('should handle malformed SMTP responses', async () => {
      const options: CheckIfEmailExistsSmtpOptions = {
        timeout: 5000,
        retries: 0,
      };

      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('invalid response without code\r\n'), 10);
        }
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      // Should handle malformed responses gracefully
      const result = await verifySmtpConnection('test@example.com', 'example.com', 'smtp.example.com', options);

      jest.runAllTimers();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
