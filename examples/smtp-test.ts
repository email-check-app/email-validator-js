// Test suite for enhanced SMTP verification
//
// This file demonstrates various testing scenarios for the enhanced SMTP functionality.

import { verifyMailboxSMTP } from '../src/smtp';

// Mock MX records for testing (these are real MX servers)
const testDomains = {
  gmail: ['gmail-smtp-in.l.google.com'],
  outlook: ['outlook-com.olc.protection.outlook.com'],
  yahoo: ['mta7.am0.yahoodns.net'],
};

// Test 1: Port connectivity test
async function testPortConnectivity() {
  console.log('=== Testing Port Connectivity ===\n');

  for (const [domain, mxRecords] of Object.entries(testDomains)) {
    console.log(`Testing domain: ${domain}`);

    // Test each port individually
    for (const port of [25, 587, 465]) {
      console.log(`  Port ${port}:`);

      const result = await verifyMailboxSMTP({
        local: 'test',
        domain,
        mxRecords,
        port, // Test single port
        timeout: 5000,
        retryAttempts: 2,
        debug: true,
        tls: {
          enabled: true,
          implicit: port === 465,
        },
      });

      console.log(`    Result: ${result}`);
    }
    console.log();
  }
}

// Test 2: Multi-port with caching
async function testMultiPortWithCaching() {
  console.log('=== Testing Multi-Port with Caching ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  // First run - should test all ports
  console.log('First verification (cold cache):');
  const start1 = Date.now();
  const result1 = await verifyMailboxSMTP({
    local: 'nonexistent',
    domain,
    mxRecords,
    timeout: 3000,
    debug: false,
    caching: {
      enabled: true,
      ttlMs: 60000, // 1 minute for testing
    },
  });
  const time1 = Date.now() - start1;
  console.log(`  Result: ${result1}, Time: ${time1}ms\n`);

  // Second run - should use cached port
  console.log('Second verification (warm cache):');
  const start2 = Date.now();
  const result2 = await verifyMailboxSMTP({
    local: 'another',
    domain,
    mxRecords,
    timeout: 3000,
    debug: false,
    caching: {
      enabled: true,
      ttlMs: 60000,
    },
  });
  const time2 = Date.now() - start2;
  console.log(`  Result: ${result2}, Time: ${time2}ms`);
  console.log(`  Speed improvement: ${Math.round(((time1 - time2) / time1) * 100)}%\n`);
}

// Test 3: TLS configuration testing
async function testTLSConfigurations() {
  console.log('=== Testing TLS Configurations ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  const configs = [
    {
      name: 'No TLS',
      tls: { enabled: false },
    },
    {
      name: 'STARTTLS only',
      tls: { enabled: true, implicit: false },
    },
    {
      name: 'Implicit TLS (port 465)',
      tls: { enabled: true, implicit: true },
    },
    {
      name: 'Strict TLS',
      tls: { enabled: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    },
  ];

  for (const config of configs) {
    console.log(`Configuration: ${config.name}`);

    const ports = config.tls?.implicit ? [465] : [587, 25];

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain,
      mxRecords,
      ports,
      timeout: 5000,
      debug: false,
      tls: config.tls,
    });

    console.log(`  Result: ${result}\n`);
  }
}

// Test 4: Command options testing
async function testCommandOptions() {
  console.log('=== Testing SMTP Command Options ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  const configs = [
    {
      name: 'HELO (legacy)',
      commands: { useEHLO: false, hostname: 'localhost' },
    },
    {
      name: 'EHLO (modern)',
      commands: { useEHLO: true, hostname: 'verifier.local' },
    },
    {
      name: 'With VRFY fallback',
      commands: { useEHLO: true, useVRFY: true, hostname: 'test.com' },
    },
    {
      name: 'Null sender (privacy)',
      commands: { useEHLO: true, nullSender: true, hostname: 'example.com' },
    },
  ];

  for (const config of configs) {
    console.log(`Command configuration: ${config.name}`);

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain,
      mxRecords,
      timeout: 5000,
      debug: false,
      commands: config.commands,
    });

    console.log(`  Result: ${result}\n`);
  }
}

// Test 5: Error handling and edge cases
async function testErrorHandling() {
  console.log('=== Testing Error Handling ===\n');

  // Test with invalid MX record
  console.log('1. Invalid MX record:');
  const result1 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'example.com',
    mxRecords: ['invalid.mx.server'],
    timeout: 2000,
    debug: false,
  });
  console.log(`   Result: ${result1}\n`);

  // Test with empty MX records
  console.log('2. Empty MX records:');
  const result2 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'example.com',
    mxRecords: [],
    timeout: 2000,
    debug: false,
  });
  console.log(`   Result: ${result2}\n`);

  // Test with very short timeout
  console.log('3. Very short timeout:');
  const result3 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'gmail.com',
    mxRecords: testDomains.gmail,
    timeout: 1, // 1ms timeout
    debug: false,
  });
  console.log(`   Result: ${result3}\n`);
}

// Run all tests
async function runAllTests() {
  console.log('Enhanced SMTP Verification Test Suite\n');
  console.log('=====================================\n');

  try {
    await testPortConnectivity();
    await testMultiPortWithCaching();
    await testTLSConfigurations();
    await testCommandOptions();
    await testErrorHandling();

    console.log('All tests completed!');
  } catch (error) {
    console.error('Test suite error:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export { testPortConnectivity, testMultiPortWithCaching, testTLSConfigurations, testCommandOptions, testErrorHandling };
