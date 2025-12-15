// SMTP Test Configuration
//
// Shared test data and utilities for SMTP tests

import { SMTPStep } from '../src/types';

export const TEST_DATA = {
  // Test MX records (these are real MX servers)
  MX_RECORDS: {
    gmail: ['gmail-smtp-in.l.google.com'],
    outlook: ['outlook-com.olc.protection.outlook.com'],
    yahoo: ['mta7.am0.yahoodns.net'],
    example: ['mx.example.com'],
  },

  // Test emails
  EMAILS: {
    valid: 'test@gmail.com',
    invalid: 'nonexistent9999@gmail.com',
    malformed: 'invalid-email',
  },

  // Test domains
  DOMAINS: {
    valid: 'gmail.com',
    invalid: 'nonexistent-domain-12345.com',
    disposable: '10minutemail.com',
  },
} as const;

// Test configurations
export const TEST_CONFIGS = {
  // Basic configurations
  BASIC: {
    local: 'test',
    domain: 'gmail.com',
    mxRecords: TEST_DATA.MX_RECORDS.gmail,
  },

  // Port configurations
  SINGLE_PORT_25: {
    ports: [25],
    timeout: 5000,
  },

  SINGLE_PORT_587: {
    ports: [587],
    timeout: 5000,
  },

  SINGLE_PORT_465: {
    ports: [465],
    timeout: 5000,
  },

  SECURE_PORTS_ONLY: {
    ports: [587, 465],
    timeout: 5000,
  },

  // TLS configurations
  TLS_DISABLED: {
    tls: false,
    ports: [25],
  },

  TLS_ENABLED: {
    tls: true,
    ports: [587, 465],
  },

  TLS_STRICT: {
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3' as const,
    },
    ports: [587, 465],
  },

  TLS_LENIENT: {
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2' as const,
    },
    ports: [25, 587],
  },

  // Timeout configurations
  FAST: {
    timeout: 2000,
    maxRetries: 0,
  },

  SLOW: {
    timeout: 10000,
    maxRetries: 3,
  },

  VERY_SLOW: {
    timeout: 30000,
    maxRetries: 5,
  },
} as const;

// Custom sequences for testing
export const TEST_SEQUENCES: { [key: string]: { steps: SMTPStep[]; name: string } } = {
  MINIMAL: {
    steps: [SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
    name: 'minimal',
  },

  DEFAULT: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
    name: 'default',
  },

  WITH_STARTTLS: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.STARTTLS, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
    name: 'with-starttls',
  },

  WITH_VRFY: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO, SMTPStep.VRFY],
    name: 'with-vrfy',
  },

  FULL: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.STARTTLS, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO, SMTPStep.VRFY],
    name: 'full',
  },

  VRFY_ONLY: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.VRFY],
    name: 'vrfy-only',
  },

  NO_GREETING: {
    steps: [SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
    name: 'no-greeting',
  },

  EHLO_ONLY: {
    steps: [SMTPStep.GREETING, SMTPStep.EHLO],
    name: 'ehlo-only',
  },
} as const;

// Helper functions
export function createTestParams(overrides = {}) {
  return {
    local: 'test',
    domain: 'gmail.com',
    mxRecords: TEST_DATA.MX_RECORDS.gmail as unknown as string[],
    options: {},
    ...overrides,
  };
}

export function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  // biome-ignore lint/suspicious/noAsyncPromiseExecutor: Needed to measure time accurately
  return new Promise(async (resolve) => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    resolve({ result, duration });
  });
}

// Test utilities
export const TestUtils = {
  // Check if result is a valid SMTP response
  isValidResult: (result: boolean | null): boolean => {
    return typeof result === 'boolean' || result === null;
  },

  // Get test timeout based on test type and environment
  getTestTimeout: (type: 'fast' | 'slow' | 'integration' = 'fast'): number => {
    // Import environment utilities
    const { getTestTimeout } = require('./utils/test-environment');
    return getTestTimeout(type);
  },
};
