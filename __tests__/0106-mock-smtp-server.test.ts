/**
 * Mock SMTP Server Tests
 *
 * Tests the mock SMTP server implementation used for testing, including
 * provider-specific response simulation (Gmail, Yahoo, Hotmail/Outlook),
 * and SMTP error parsing for various email providers.
 */

import {
  checkIfEmailExistsCore,
  EmailProvider,
  SmtpErrorParser,
  validateEmailSyntax,
} from '../src/check-if-email-exists';
import type { MockSmtpServer, ParsedSmtpError } from '../src/email-verifier-types';

// Mock SMTP Server implementation for testing
class TestMockSmtpServer implements MockSmtpServer {
  public domain: string;
  public provider: EmailProvider;
  public responses: Map<string, { code: number; message: string }>;
  public connected = false;

  constructor(domain: string, provider: EmailProvider) {
    this.domain = domain;
    this.provider = provider;
    this.responses = new Map();
    this.setupProviderResponses();
  }

  private setupProviderResponses(): void {
    switch (this.provider) {
      case EmailProvider.gmail:
        this.responses.set('RCPT TO:test@gmail.com', { code: 250, message: '2.1.5 OK' });
        this.responses.set('RCPT TO:nonexistent@gmail.com', { code: 550, message: 'No such user here' });
        this.responses.set('RCPT TO:disabled@gmail.com', { code: 554, message: 'Delivery error: Account disabled' });
        break;

      case EmailProvider.yahoo:
        this.responses.set('RCPT TO:test@yahoo.com', { code: 250, message: 'User OK' });
        this.responses.set('RCPT TO:nonexistent@yahoo.com', { code: 550, message: 'Invalid recipient' });
        this.responses.set('RCPT TO:full@yahoo.com', { code: 552, message: 'Mailbox over quota' });
        break;

      case EmailProvider.hotmailB2c:
        this.responses.set('RCPT TO:test@hotmail.com', { code: 250, message: '2.1.5 Recipient OK' });
        this.responses.set('RCPT TO:nonexistent@hotmail.com', { code: 550, message: 'Recipient address rejected' });
        this.responses.set('RCPT TO:blocked@hotmail.com', { code: 550, message: 'Mail content rejected' });
        break;

      case EmailProvider.hotmailB2b:
        this.responses.set('RCPT TO:test@company.com', { code: 250, message: '2.1.5 OK' });
        this.responses.set('RCPT TO:nonexistent@company.com', { code: 550, message: '5.2.1 Invalid recipient' });
        this.responses.set('RCPT TO:relay@company.com', { code: 550, message: '5.4.1 Relay access denied' });
        break;

      default:
        this.responses.set('RCPT TO:test@example.com', { code: 250, message: 'OK' });
        this.responses.set('RCPT TO:nonexistent@example.com', { code: 550, message: 'User unknown' });
    }
  }

  public connect(): boolean {
    this.connected = true;
    return true;
  }

  public disconnect(): void {
    this.connected = false;
  }

  public getResponse(command: string): { code: number; message: string } | null {
    return this.responses.get(command) || null;
  }
}

describe('0106 Mock SMTP Server', () => {
  describe('Gmail Mock Server', () => {
    let server: TestMockSmtpServer;

    beforeEach(() => {
      server = new TestMockSmtpServer('gmail.com', EmailProvider.gmail);
    });

    test('should handle Gmail success responses', () => {
      const response = server.getResponse('RCPT TO:test@gmail.com');
      expect(response).toEqual({ code: 250, message: '2.1.5 OK' });
    });

    test('should handle Gmail error responses', () => {
      const response = server.getResponse('RCPT TO:nonexistent@gmail.com');
      expect(response).toEqual({ code: 550, message: 'No such user here' });
    });

    test('should handle Gmail disabled account responses', () => {
      const response = server.getResponse('RCPT TO:disabled@gmail.com');
      expect(response).toEqual({ code: 554, message: 'Delivery error: Account disabled' });
    });
  });

  describe('Yahoo Mock Server', () => {
    let server: TestMockSmtpServer;

    beforeEach(() => {
      server = new TestMockSmtpServer('yahoo.com', EmailProvider.yahoo);
    });

    test('should handle Yahoo success responses', () => {
      const response = server.getResponse('RCPT TO:test@yahoo.com');
      expect(response).toEqual({ code: 250, message: 'User OK' });
    });

    test('should handle Yahoo quota error responses', () => {
      const response = server.getResponse('RCPT TO:full@yahoo.com');
      expect(response).toEqual({ code: 552, message: 'Mailbox over quota' });
    });
  });

  describe('Hotmail Mock Server', () => {
    let server: TestMockSmtpServer;

    beforeEach(() => {
      server = new TestMockSmtpServer('hotmail.com', EmailProvider.hotmailB2c);
    });

    test('should handle Hotmail success responses', () => {
      const response = server.getResponse('RCPT TO:test@hotmail.com');
      expect(response).toEqual({ code: 250, message: '2.1.5 Recipient OK' });
    });

    test('should handle Hotmail blocked content responses', () => {
      const response = server.getResponse('RCPT TO:blocked@hotmail.com');
      expect(response).toEqual({ code: 550, message: 'Mail content rejected' });
    });
  });

  describe('Microsoft 365 Mock Server', () => {
    let server: TestMockSmtpServer;

    beforeEach(() => {
      server = new TestMockSmtpServer('company.com', EmailProvider.hotmailB2b);
    });

    test('should handle Microsoft 365 relay denied responses', () => {
      const response = server.getResponse('RCPT TO:relay@company.com');
      expect(response).toEqual({ code: 550, message: '5.4.1 Relay access denied' });
    });
  });
});

describe('SMTP Error Parsing Tests', () => {
  describe('Gmail Error Parsing', () => {
    test('should parse Gmail disabled account errors', () => {
      const errorMessage = 'Gmail Service: Account disabled';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.gmail, 554);

      expect(parsed.type).toBe('disabled');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Gmail account is disabled or suspended');
      expect(parsed.providerSpecific?.code).toBe('GMAIL_DISABLED');
    });

    test('should parse Gmail quota exceeded errors', () => {
      const errorMessage = 'Gmail over quota: User has exceeded storage limit';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.gmail, 552);

      expect(parsed.type).toBe('full_inbox');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Gmail storage quota exceeded');
      expect(parsed.providerSpecific?.code).toBe('GMAIL_QUOTA_EXCEEDED');
    });

    test('should parse Gmail rate limiting errors', () => {
      const errorMessage = 'Gmail temporarily deferred: Rate limit exceeded';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.gmail, 450);

      expect(parsed.type).toBe('rate_limited');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Gmail rate limiting active');
      expect(parsed.providerSpecific?.code).toBe('GMAIL_RATE_LIMIT');
    });
  });

  describe('Yahoo Error Parsing', () => {
    test('should parse Yahoo disabled account errors', () => {
      const errorMessage = 'Yahoo Mail: Account disabled due to terms of service violation';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.yahoo, 550);

      expect(parsed.type).toBe('disabled');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Yahoo account is disabled or suspended');
      expect(parsed.providerSpecific?.code).toBe('YAHOO_DISABLED');
    });

    test('should parse Yahoo mailbox over quota errors', () => {
      const errorMessage = 'Yahoo Mail: Mailbox over quota';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.yahoo, 552);

      expect(parsed.type).toBe('full_inbox');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Yahoo mailbox is over quota');
      expect(parsed.providerSpecific?.code).toBe('YAHOO_FULL');
    });

    test('should parse Yahoo request rejected errors', () => {
      const errorMessage = 'Yahoo Mail: 553 Request rejected';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.yahoo, 553);

      expect(parsed.type).toBe('blocked');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Yahoo rejected the request');
      expect(parsed.providerSpecific?.code).toBe('YAHOO_REJECTED');
    });
  });

  describe('Hotmail/Microsoft Error Parsing', () => {
    test('should parse Microsoft 365 recipient rejected errors', () => {
      const errorMessage = 'Outlook: 550 5.2.1 Recipient rejected';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.hotmailB2b, 550);

      expect(parsed.type).toBe('invalid');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Microsoft 365 rejected recipient');
      expect(parsed.providerSpecific?.code).toBe('OFFICE365_REJECTED');
    });

    test('should parse Exchange relay access denied errors', () => {
      const errorMessage = 'Outlook: 550 5.4.1 Relay access denied';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.hotmailB2b, 550);

      expect(parsed.type).toBe('blocked');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Microsoft Exchange relay access denied');
      expect(parsed.providerSpecific?.code).toBe('EXCHANGE_RELAY_DENIED');
    });

    test('should parse Microsoft throttling errors', () => {
      const errorMessage = 'Outlook: 4.4.2 Connection limit exceeded';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.hotmailB2b, 450);

      expect(parsed.type).toBe('rate_limited');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Microsoft Exchange rate limiting');
      expect(parsed.providerSpecific?.code).toBe('EXCHANGE_THROTTLING');
    });
  });

  describe('Proofpoint Error Parsing', () => {
    test('should parse Proofpoint policy violation errors', () => {
      const errorMessage = 'Message rejected due to Proofpoint security policy violation';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.proofpoint, 550);

      expect(parsed.type).toBe('blocked');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Proofpoint security policy violation');
      expect(parsed.providerSpecific?.code).toBe('PROOFPOINT_BLOCKED');
    });

    test('should parse Proofpoint rate limiting errors', () => {
      const errorMessage = 'Proofpoint: Too many messages - frequency limit exceeded';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.proofpoint, 450);

      expect(parsed.type).toBe('rate_limited');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Proofpoint frequency limit exceeded');
      expect(parsed.providerSpecific?.code).toBe('PROOFPOINT_RATE_LIMIT');
    });
  });

  describe('Mimecast Error Parsing', () => {
    test('should parse Mimecast content policy violations', () => {
      const errorMessage = 'Mimecast: Blocked by policy - content filter triggered';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.mimecast, 550);

      expect(parsed.type).toBe('blocked');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Mimecast content policy violation');
      expect(parsed.providerSpecific?.code).toBe('MIMECAST_BLOCKED');
    });
  });

  describe('Generic Error Parsing', () => {
    test('should parse generic disabled account errors', () => {
      const errorMessage = 'Account has been disabled';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.everythingElse, 550);

      expect(parsed.type).toBe('disabled');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Account is disabled or deactivated');
    });

    test('should parse generic mailbox full errors', () => {
      const errorMessage = 'Mailbox is full';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.everythingElse, 552);

      expect(parsed.type).toBe('full_inbox');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Mailbox is full or quota exceeded');
    });

    test('should parse generic user unknown errors', () => {
      const errorMessage = 'User unknown';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.everythingElse, 550);

      expect(parsed.type).toBe('invalid');
      expect(parsed.severity).toBe('permanent');
      expect(parsed.message).toBe('Invalid email address or user unknown');
    });

    test('should parse generic rate limiting errors', () => {
      const errorMessage = 'Rate limit exceeded';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.everythingElse, 450);

      expect(parsed.type).toBe('rate_limited');
      expect(parsed.severity).toBe('temporary');
      expect(parsed.message).toBe('Rate limited or temporarily unavailable');
    });
  });

  describe('Error Code Based Parsing', () => {
    test('should parse error based on response codes', () => {
      const testCases = [
        { code: 550, expectedType: 'disabled' as const },
        { code: 552, expectedType: 'full_inbox' as const },
        { code: 450, expectedType: 'rate_limited' as const },
        { code: 451, expectedType: 'rate_limited' as const },
        { code: 999, expectedType: 'unknown' as const }, // Unknown code
      ];

      testCases.forEach(({ code, expectedType }) => {
        const parsed = SmtpErrorParser.parseError('Generic error', EmailProvider.everythingElse, code);
        expect(parsed.type).toBe(expectedType);
      });
    });
  });

  describe('Unknown Errors', () => {
    test('should handle unknown error messages gracefully', () => {
      const errorMessage = 'Some completely unknown error message that we cannot parse';
      const parsed = SmtpErrorParser.parseError(errorMessage, EmailProvider.everythingElse);

      expect(parsed.type).toBe('unknown');
      expect(parsed.severity).toBe('unknown');
      expect(parsed.message).toBe('Unknown error pattern');
      expect(parsed.originalMessage).toBe(errorMessage);
    });
  });
});

describe('Mock Server Integration Tests', () => {
  describe('Server Lifecycle', () => {
    test('should connect and disconnect properly', () => {
      const server = new TestMockSmtpServer('gmail.com', EmailProvider.gmail);

      expect(server.connected).toBe(false);

      const connected = server.connect();
      expect(connected).toBe(true);
      expect(server.connected).toBe(true);

      server.disconnect();
      expect(server.connected).toBe(false);
    });
  });

  describe('Provider-Specific Mock Behavior', () => {
    test('should simulate Gmail behavior', () => {
      const server = new TestMockSmtpServer('gmail.com', EmailProvider.gmail);

      const validResponse = server.getResponse('RCPT TO:test@gmail.com');
      expect(validResponse?.code).toBe(250);

      const invalidResponse = server.getResponse('RCPT TO:nonexistent@gmail.com');
      expect(invalidResponse?.code).toBe(550);
    });

    test('should simulate Yahoo behavior', () => {
      const server = new TestMockSmtpServer('yahoo.com', EmailProvider.yahoo);

      const validResponse = server.getResponse('RCPT TO:test@yahoo.com');
      expect(validResponse?.code).toBe(250);

      const invalidResponse = server.getResponse('RCPT TO:nonexistent@yahoo.com');
      expect(invalidResponse?.code).toBe(550);
    });
  });

  describe('Missing Responses', () => {
    test('should return null for unknown commands', () => {
      const server = new TestMockSmtpServer('gmail.com', EmailProvider.gmail);

      const unknownResponse = server.getResponse('UNKNOWN COMMAND');
      expect(unknownResponse).toBeNull();
    });
  });
});
