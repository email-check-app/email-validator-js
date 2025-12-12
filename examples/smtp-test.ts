// Test suite for enhanced SMTP verification
//
// This file demonstrates various testing scenarios for the enhanced SMTP functionality.

import { getDefaultCache } from '../src/cache';
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

      const { result } = await verifyMailboxSMTP({
        local: 'test',
        domain,
        mxRecords,
        options: {
          ports: [port], // Test single port
          timeout: 5000,
          maxRetries: 2,
          debug: true,
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
          },
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
    options: {
      timeout: 3000,
      cache: getDefaultCache(),
      debug: false,
    },
  });
  const duration1 = Date.now() - start1;
  console.log(`  Result: ${result1.result}, Port: ${result1.port}, Duration: ${duration1}ms`);

  // Second run - should use cached port
  console.log('Second verification (warm cache):');
  const start2 = Date.now();
  const result2 = await verifyMailboxSMTP({
    local: 'nonexistent',
    domain,
    mxRecords,
    options: {
      timeout: 3000,
      cache: getDefaultCache(),
      debug: false,
    },
  });
  const duration2 = Date.now() - start2;
  console.log(`  Result: ${result2.result}, Port: ${result2.port}, Duration: ${duration2}ms`);

  console.log(
    `  Speed improvement: ${duration1 - duration2}ms (${Math.round(((duration1 - duration2) / duration1) * 100)}%)`
  );
  console.log();
}

// Test 3: Timeout handling
async function testTimeoutHandling() {
  console.log('=== Testing Timeout Handling ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  // Test with very short timeout
  console.log('Testing with 1ms timeout (should fail quickly):');
  const start = Date.now();
  const result = await verifyMailboxSMTP({
    local: 'test',
    domain,
    mxRecords,
    options: {
      timeout: 1, // 1ms timeout
      maxRetries: 0,
      debug: false,
    },
  });
  const duration = Date.now() - start;
  console.log(`  Result: ${result.result}, Duration: ${duration}ms`);
  console.log();
}

// Test 4: TLS configuration
async function testTLSConfiguration() {
  console.log('=== Testing TLS Configuration ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  // Test with strict TLS
  console.log('Testing with strict TLS (may fail with self-signed certs):');
  const result1 = await verifyMailboxSMTP({
    local: 'test',
    domain,
    mxRecords,
    options: {
      ports: [465], // Try implicit TLS first
      timeout: 5000,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
      },
      debug: false,
    },
  });
  console.log(`  Strict TLS Result: ${result1.result}`);

  // Test with lenient TLS
  console.log('Testing with lenient TLS:');
  const result2 = await verifyMailboxSMTP({
    local: 'test',
    domain,
    mxRecords,
    options: {
      ports: [465],
      timeout: 5000,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      debug: false,
    },
  });
  console.log(`  Lenient TLS Result: ${result2.result}`);
  console.log();
}

// Test 5: Custom SMTP sequences
async function testCustomSequences() {
  console.log('=== Testing Custom SMTP Sequences ===\n');

  const domain = 'gmail.com';
  const mxRecords = testDomains.gmail;

  // Test with VRFY command
  console.log('Testing with VRFY command:');
  const result1 = await verifyMailboxSMTP({
    local: 'test',
    domain,
    mxRecords,
    options: {
      timeout: 5000,
      useVRFY: true,
      debug: false,
    },
  });
  console.log(`  With VRFY Result: ${result1.result}`);

  // Test without VRFY command
  console.log('Testing without VRFY command:');
  const result2 = await verifyMailboxSMTP({
    local: 'test',
    domain,
    mxRecords,
    options: {
      timeout: 5000,
      useVRFY: false,
      debug: false,
    },
  });
  console.log(`  Without VRFY Result: ${result2.result}`);
  console.log();
}

// Main test runner
async function runAllTests() {
  console.log('SMTP Verification Test Suite');
  console.log('============================\n');

  try {
    await testPortConnectivity();
    await testMultiPortWithCaching();
    await testTimeoutHandling();
    await testTLSConfiguration();
    await testCustomSequences();

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export {
  testPortConnectivity,
  testMultiPortWithCaching,
  testTimeoutHandling,
  testTLSConfiguration,
  testCustomSequences,
};
