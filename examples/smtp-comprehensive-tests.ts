// Comprehensive SMTP Verification Tests
//
// Tests for different configurations, ports, and custom sequences

import { getDefaultCache, SMTPStep } from '../src';
import { verifyMailboxSMTP } from '../src/smtp-verifier';

// Test data - use real MX records for actual testing
const testMX = {
  gmail: ['gmail-smtp-in.l.google.com'],
  outlook: ['outlook-com.olc.protection.outlook.com'],
  yahoo: ['mta7.am0.yahoodns.net'],
};

const testEmail = 'test@example.com';

// Test 1: Default configuration (all ports)
async function testDefaultConfig() {
  console.log('=== Test 1: Default Configuration ===');
  console.log('Testing all default ports [25, 587, 465] with default settings\n');

  const result = await verifyMailboxSMTP({
    local: 'test',
    domain: 'gmail.com',
    mxRecords: testMX.gmail,
    options: {
      debug: true,
    },
  });

  console.log(`Result: ${result}\n`);
  return result;
}

// Test 2: Single port testing
async function testSinglePorts() {
  console.log('=== Test 2: Single Port Testing ===');
  console.log('Testing each port individually\n');

  const ports = [25, 587, 465];
  const results: Record<number, any> = {};

  for (const port of ports) {
    console.log(`Testing port ${port} only:`);
    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: testMX.gmail,
      options: {
        ports: [port],
        timeout: 5000,
        debug: true,
      },
    });

    results[port] = result;
    console.log(`Port ${port} result: ${result}\n`);
  }

  return results;
}

// Test 3: Custom port order
async function testCustomPortOrder() {
  console.log('=== Test 3: Custom Port Order ===');
  console.log('Testing ports in reverse order: [465, 587, 25]\n');

  const result = await verifyMailboxSMTP({
    local: 'test',
    domain: 'outlook.com',
    mxRecords: testMX.outlook,
    options: {
      ports: [465, 587, 25], // Reverse order - try secure first
      debug: true,
    },
  });

  console.log(`Result: ${result}\n`);
  return result;
}

// Test 4: TLS configurations
async function testTLSConfigs() {
  console.log('=== Test 4: TLS Configurations ===\n');

  const configs = [
    { name: 'TLS disabled', tls: false },
    { name: 'TLS enabled (default)', tls: true },
    { name: 'TLS strict', tls: { rejectUnauthorized: true, minVersion: 'TLSv1.3' as const } },
    { name: 'TLS lenient', tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' as const } },
  ];

  const results: Record<string, any> = {};

  for (const config of configs) {
    console.log(`Testing: ${config.name}`);
    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: testMX.gmail,
      options: {
        ports: [587, 465], // Only TLS-capable ports
        tls: config.tls,
        timeout: 5000,
        debug: false,
      },
    });

    results[config.name] = result;
    console.log(`Result: ${result}\n`);
  }

  return results;
}

// Test 5: Custom SMTP sequences
async function testCustomSequences() {
  console.log('=== Test 5: Custom SMTP Sequences ===\n');

  const sequences = [
    {
      name: 'Minimal sequence',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
      },
    },
    {
      name: 'With STARTTLS',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo],
      },
    },
    {
      name: 'With VRFY fallback',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
      },
    },
    {
      name: 'Full sequence',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.startTls, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
      },
    },
    {
      name: 'No greeting (direct)',
      sequence: {
        steps: [SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
      },
    },
  ];

  const results: Record<string, any> = {};

  for (const test of sequences) {
    console.log(`Testing: ${test.name}`);
    console.log(`Sequence: ${test.sequence.steps.join(' -> ')}`);

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: testMX.gmail,
      options: {
        ports: [587],
        timeout: 5000,
        debug: true,
        sequence: test.sequence,
      },
    });

    results[test.name] = result;
    console.log(`Result: ${result}\n`);
  }

  return results;
}

// Test 6: Retry and timeout configurations
async function testRetryAndTimeout() {
  console.log('=== Test 6: Retry and Timeout Configurations ===\n');

  const configs = [
    { name: 'No retries', maxRetries: 0, timeout: 1000 },
    { name: 'Single retry', maxRetries: 1, timeout: 2000 },
    { name: 'Multiple retries', maxRetries: 3, timeout: 3000 },
    { name: 'Very short timeout', maxRetries: 1, timeout: 100 },
    { name: 'Long timeout', maxRetries: 2, timeout: 10000 },
  ];

  const results: Record<string, any> = {};

  for (const config of configs) {
    console.log(`Testing: ${config.name}`);
    console.log(`Max retries: ${config.maxRetries}, Timeout: ${config.timeout}ms`);

    const start = Date.now();
    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: testMX.gmail,
      options: {
        ports: [587],
        maxRetries: config.maxRetries,
        timeout: config.timeout,
        debug: false,
      },
    });
    const duration = Date.now() - start;

    results[config.name] = { result, duration };
    console.log(`Result: ${result}, Duration: ${duration}ms\n`);
  }

  return results;
}

// Test 7: Custom MAIL FROM and VRFY
async function testCustomFromAndVRFY() {
  console.log('=== Test 7: Custom MAIL FROM and VRFY ===\n');

  const configs = [
    {
      name: 'Null sender (default)',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
        from: '<>',
      },
    },
    {
      name: 'Real sender',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo],
        from: '<sender@domain.com>',
      },
    },
    {
      name: 'VRFY with username',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
        vrfyTarget: 'test',
      },
    },
    {
      name: 'VRFY with email',
      sequence: {
        steps: [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo, SMTPStep.vrfy],
        vrfyTarget: 'test@gmail.com',
      },
    },
  ];

  const results: Record<string, any> = {};

  for (const config of configs) {
    console.log(`Testing: ${config.name}`);

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'gmail.com',
      mxRecords: testMX.gmail,
      options: {
        ports: [587],
        timeout: 5000,
        debug: true,
        sequence: config.sequence,
      },
    });

    results[config.name] = result;
    console.log(`Result: ${result}\n`);
  }

  return results;
}

// Test 8: Cache performance
async function testCachePerformance() {
  console.log('=== Test 8: Cache Performance Test ===');
  console.log('Testing port caching with multiple attempts\n');

  // First run - should try all ports
  console.log('First verification (cold cache):');
  const start1 = Date.now();
  const result1 = await verifyMailboxSMTP({
    local: 'test1',
    domain: 'gmail.com',
    mxRecords: testMX.gmail,
    options: {
      cache: getDefaultCache(),
      debug: false,
    },
  });
  const time1 = Date.now() - start1;
  console.log(`Result: ${result1}, Time: ${time1}ms\n`);

  // Second run - should use cached port
  console.log('Second verification (warm cache):');
  const start2 = Date.now();
  const result2 = await verifyMailboxSMTP({
    local: 'test2',
    domain: 'gmail.com',
    mxRecords: testMX.gmail,
    options: {
      cache: getDefaultCache(),
      debug: false,
    },
  });
  const time2 = Date.now() - start2;
  console.log(`Result: ${result2}, Time: ${time2}ms`);

  if (time1 > 0) {
    const improvement = Math.round(((time1 - time2) / time1) * 100);
    console.log(`Performance improvement: ${improvement}%\n`);
  }

  return { cold: { result: result1, time: time1 }, warm: { result: result2, time: time2 } };
}

// Test 9: Error scenarios
async function testErrorScenarios() {
  console.log('=== Test 9: Error Scenarios ===\n');

  const errorTests = [
    {
      name: 'Invalid MX record',
      mxRecords: ['invalid.nonexistent.server'],
    },
    {
      name: 'Empty MX records',
      mxRecords: [],
    },
    {
      name: 'Wrong port',
      ports: [9999],
      mxRecords: testMX.gmail,
    },
    {
      name: 'Very short timeout',
      timeout: 1,
      mxRecords: testMX.gmail,
    },
    {
      name: 'Invalid sequence',
      sequence: {
        steps: [SMTPStep.quit], // Invalid - starts with QUIT
      },
      mxRecords: testMX.gmail,
    },
  ];

  const results: Record<string, any> = {};

  for (const test of errorTests) {
    console.log(`Testing: ${test.name}`);

    const result = await verifyMailboxSMTP({
      local: 'test',
      domain: 'test.com',
      mxRecords: test.mxRecords || test.mxRecords,
      options: {
        ports: test.ports || [25],
        timeout: test.timeout || 3000,
        sequence: test.sequence,
        debug: false,
      },
    });

    results[test.name] = result;
    console.log(`Result: ${result}\n`);
  }

  return results;
}

// Test runner
async function runAllTests() {
  console.log('Comprehensive SMTP Verification Test Suite');
  console.log('==========================================\n');

  const results = {
    defaultConfig: await testDefaultConfig(),
    singlePorts: await testSinglePorts(),
    customPortOrder: await testCustomPortOrder(),
    tlsConfigs: await testTLSConfigs(),
    customSequences: await testCustomSequences(),
    retryAndTimeout: await testRetryAndTimeout(),
    customFromAndVRFY: await testCustomFromAndVRFY(),
    cachePerformance: await testCachePerformance(),
    errorScenarios: await testErrorScenarios(),
  };

  // Summary
  console.log('=== Test Summary ===');
  console.log(`Default config: ${results.defaultConfig !== null ? 'PASSED' : 'FAILED'}`);
  console.log(`Single ports: ${Object.values(results.singlePorts).some((r) => r !== null) ? 'PASSED' : 'FAILED'}`);
  console.log(`Custom port order: ${results.customPortOrder !== null ? 'PASSED' : 'FAILED'}`);
  console.log(`TLS configs: ${Object.values(results.tlsConfigs).some((r) => r !== null) ? 'PASSED' : 'FAILED'}`);
  console.log(
    `Custom sequences: ${Object.values(results.customSequences).some((r) => r !== null) ? 'PASSED' : 'FAILED'}`
  );
  console.log(
    `Cache performance: ${results.cachePerformance.warm.time < results.cachePerformance.cold.time ? 'IMPROVEMENT' : 'NO IMPROVEMENT'}`
  );

  return results;
}

// Export for individual testing
export {
  testDefaultConfig,
  testSinglePorts,
  testCustomPortOrder,
  testTLSConfigs,
  testCustomSequences,
  testRetryAndTimeout,
  testCustomFromAndVRFY,
  testCachePerformance,
  testErrorScenarios,
  runAllTests,
};

// Run all tests if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
