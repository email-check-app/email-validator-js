// SMTP Test Configuration
//
// Shared test data and utilities for SMTP tests

import { SMTPStep } from '../../src/types';

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
    perAttemptTimeoutMs: 5000,
  },

  SINGLE_PORT_587: {
    ports: [587],
    perAttemptTimeoutMs: 5000,
  },

  SINGLE_PORT_465: {
    ports: [465],
    perAttemptTimeoutMs: 5000,
  },

  SECURE_PORTS_ONLY: {
    ports: [587, 465],
    perAttemptTimeoutMs: 5000,
  },

  // TLS configurations
  TLS_DISABLED: {
    tlsConfig: false,
    ports: [25],
  },

  TLS_ENABLED: {
    tlsConfig: true,
    ports: [587, 465],
  },

  TLS_STRICT: {
    tlsConfig: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3' as const,
    },
    ports: [587, 465],
  },

  TLS_LENIENT: {
    tlsConfig: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2' as const,
    },
    ports: [25, 587],
  },

  // Timeout configurations
  FAST: {
    perAttemptTimeoutMs: 2000,
  },

  SLOW: {
    perAttemptTimeoutMs: 10000,
  },

  VERY_SLOW: {
    perAttemptTimeoutMs: 30000,
  },
} as const;

// Custom sequences for testing
export const TEST_SEQUENCES: { [key: string]: { steps: SMTPStep[]; name: string } } = {
  MINIMAL: {
    steps: [SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
    name: 'minimal',
  },

  DEFAULT: {
    steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
    name: 'default',
  },

  NO_GREETING: {
    steps: [SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
    name: 'no-greeting',
  },

  EHLO_ONLY: {
    steps: [SMTPStep.greeting, SMTPStep.ehlo],
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
    debug: true,
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
    const { getTestTimeout } = require('./test-environment');
    return getTestTimeout(type);
  },
};
