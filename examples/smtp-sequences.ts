// SMTP Sequence Control Examples
//
// Demonstrates how to use SMTPStep enum and custom sequences

import { verifyMailboxSMTP } from '../src/smtp';
import { SMTPStep } from '../src/types';

// Example 1: Basic verification with default sequence
async function basicSequence() {
  console.log('=== Basic Verification (Default Sequence) ===');
  console.log('Steps: GREETING → EHLO → MAIL FROM → RCPT TO\n');

  return await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      debug: true,
    },
  });
}

// Example 2: Custom sequence without TLS
async function noTLSSequence() {
  console.log('=== No TLS Sequence ===');
  console.log('Steps: GREETING → EHLO → MAIL FROM → RCPT TO (no STARTTLS)\n');

  return await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      ports: [25], // Only port 25
      tls: false, // Disable TLS
      debug: true,
    },
  });
}

// Example 3: Full sequence with all features
async function fullSequence() {
  console.log('=== Full SMTP Sequence ===');
  console.log('Steps: GREETING → EHLO → STARTTLS → EHLO → MAIL FROM → RCPT TO → VRFY\n');

  return await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      ports: [587],
      sequence: {
        steps: [
          SMTPStep.GREETING,
          SMTPStep.EHLO,
          SMTPStep.STARTTLS,
          // Note: EHLO will be automatically sent after STARTTLS
          SMTPStep.MAIL_FROM,
          SMTPStep.RCPT_TO,
          SMTPStep.VRFY,
        ],
        from: '<>', // Null sender
        vrfyTarget: 'user', // VRFY username only
      },
      debug: true,
    },
  });
}

// Example 4: Minimal sequence for testing
async function minimalSequence() {
  console.log('=== Minimal Sequence ===');
  console.log('Steps: EHLO → MAIL FROM → RCPT TO (no greeting)\n');

  return await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      sequence: {
        steps: [
          SMTPStep.EHLO, // Skip greeting, send EHLO directly
          SMTPStep.MAIL_FROM,
          SMTPStep.RCPT_TO,
        ],
        from: '<sender@test.com>', // Custom sender
      },
      ports: [587],
      debug: true,
    },
  });
}

// Example 5: VRFY-only test
async function vrfyOnlyTest() {
  console.log('=== VRFY-Only Test ===');
  console.log('Steps: GREETING → EHLO → MAIL FROM → VRFY\n');

  return await verifyMailboxSMTP({
    local: 'user',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      sequence: {
        steps: [
          SMTPStep.GREETING,
          SMTPStep.EHLO,
          SMTPStep.MAIL_FROM,
          // Skip RCPT TO, go directly to VRFY
          SMTPStep.VRFY,
        ],
        vrfyTarget: 'user@example.com', // VRFY with full email
      },
      ports: [25], // VRFY is more likely to work on port 25
      debug: true,
    },
  });
}

// Example 6: Custom port testing with sequences
async function customPortsWithSequences() {
  console.log('=== Custom Ports with Sequences ===\n');

  const portConfigs = [
    {
      port: 25,
      name: 'SMTP with STARTTLS',
      sequence: {
        steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.STARTTLS, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
      },
    },
    {
      port: 587,
      name: 'Submission with TLS',
      sequence: {
        steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.STARTTLS, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO],
      },
    },
    {
      port: 465,
      name: 'SMTPS (implicit TLS)',
      sequence: {
        steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO], // No STARTTLS needed
      },
    },
  ];

  const results = {};

  for (const config of portConfigs) {
    console.log(`Testing ${config.name} on port ${config.port}:`);

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'example.com',
      mxRecords: ['mx.example.com'],
      options: {
        ports: [config.port],
        sequence: config.sequence,
        debug: true,
      },
    });

    results[config.port] = result;
    console.log(`Result: ${result}\n`);
  }

  return results;
}

// Example 7: Step-by-step connection test
async function stepByStepTest() {
  console.log('=== Step-by-Step Connection Test ===');
  console.log('Testing each SMTP step individually\n');

  // Test if server responds to EHLO
  console.log('1. Testing EHLO response:');
  const ehloTest = await verifyMailboxSMTP({
    local: 'test',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      sequence: {
        steps: [SMTPStep.GREETING, SMTPStep.EHLO],
      },
      debug: true,
    },
  });
  console.log(`EHLO test result: ${ehloTest !== null ? 'Server responded' : 'No response'}\n`);

  // Test if server accepts MAIL FROM
  console.log('2. Testing MAIL FROM acceptance:');
  const mailTest = await verifyMailboxSMTP({
    local: 'test',
    domain: 'example.com',
    mxRecords: ['mx.example.com'],
    options: {
      sequence: {
        steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM],
      },
      debug: true,
    },
  });
  console.log(`MAIL FROM test result: ${mailTest !== null ? 'Accepted' : 'Rejected'}\n`);

  return { ehloTest, mailTest };
}

// Example 8: Compare different strategies
async function compareStrategies() {
  console.log('=== Strategy Comparison ===\n');

  const strategies = [
    {
      name: 'Default (all ports)',
      options: { debug: false },
    },
    {
      name: 'Secure only',
      options: {
        ports: [587, 465],
        tls: true,
        debug: false,
      },
    },
    {
      name: 'With VRFY fallback',
      options: {
        sequence: {
          steps: [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM, SMTPStep.RCPT_TO, SMTPStep.VRFY],
        },
        debug: false,
      },
    },
    {
      name: 'Fast (single port)',
      options: {
        ports: [587],
        timeout: 2000,
        maxRetries: 0,
        debug: false,
      },
    },
  ];

  const results = {};

  for (const strategy of strategies) {
    console.log(`Testing: ${strategy.name}`);
    const start = Date.now();

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: ['gmail-smtp-in.l.google.com'],
      options: strategy.options,
    });

    const duration = Date.now() - start;
    results[strategy.name] = { result, duration };

    console.log(`Result: ${result}, Duration: ${duration}ms\n`);
  }

  return results;
}

// Export for individual testing
export {
  SMTPStep,
  basicSequence,
  noTLSSequence,
  fullSequence,
  minimalSequence,
  vrfyOnlyTest,
  customPortsWithSequences,
  stepByStepTest,
  compareStrategies,
};

// Run all examples if executed directly
if (require.main === module) {
  console.log('SMTP Sequence Control Examples\n');
  console.log('==============================\n');

  // Run a few examples
  (async () => {
    await basicSequence();
    console.log('\n' + '='.repeat(50) + '\n');

    await fullSequence();
    console.log('\n' + '='.repeat(50) + '\n');

    await stepByStepTest();
    console.log('\n' + '='.repeat(50) + '\n');

    await compareStrategies();
  })().catch(console.error);
}
