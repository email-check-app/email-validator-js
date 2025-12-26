#!/usr/bin/env ts-node

/**
 * Quick test script for email verification functionality
 *
 * Usage:
 *   npx ts-node examples/quick-test.ts user@example.com
 *   npx ts-node examples/quick-test.ts user@example.com --retries 2 --timeout 10000
 */

import { checkIfEmailExistsCore } from '../src';

const args = process.argv.slice(2);
const email = args[0];

if (!email) {
  console.error('Usage: npx ts-node examples/quick-test.ts <email> [options]');
  console.error('');
  console.error('Examples:');
  console.error('  npx ts-node examples/quick-test.ts user@gmail.com');
  console.error('  npx ts-node examples/quick-test.ts user@yahoo.com --retries 3');
  process.exit(1);
}

// Parse command line options
const options: any = {
  fromEmail: 'test@example.com',
  helloName: 'example.com',
  retries: 1,
  timeout: 5000,
  verifySmtp: false,
};

for (let i = 1; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  const value = args[i + 1];

  switch (key) {
    case 'retries':
      options.retries = parseInt(value);
      break;
    case 'timeout':
      options.timeout = parseInt(value);
      break;
    case 'from':
      options.fromEmail = value;
      break;
    case 'hello':
      options.helloName = value;
      break;
    case 'port':
      options.port = parseInt(value);
      break;
  }
}

async function quickTest() {
  console.log(`🔍 Verifying email: ${email}`);
  console.log(`⚙️  Options:`, options);
  console.log('');

  const startTime = Date.now();

  try {
    const result = await checkIfEmailExistsCore({
      emailAddress: email,
      ...options,
    });

    const duration = Date.now() - startTime;

    console.log('✅ Verification completed');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log('');
    console.log('Results:');
    console.log(`  Email: ${result.email}`);
    console.log(`  Provider: ${result.misc?.providerType}`);
    console.log(`  Reachable: ${result.isReachable === 'safe' ? '✅' : '❌'}`);
    console.log(`  Catch-all: ${result.smtp?.isCatchAll ? '⚠️  Yes' : 'No'}`);

    if (result.smtp?.hasFullInbox) {
      console.log(`  Full Inbox: ⚠️  Yes`);
    }

    if (result.smtp?.isDisabled) {
      console.log(`  Disabled: ⚠️  Yes`);
    }

    console.log(`  MX Records: ${result.mx?.records.map((r) => r.exchange).join(', ') || 'None'}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    // Exit with appropriate code for scripting
    process.exit(result.isReachable === 'safe' ? 0 : 1);
  } catch (error) {
    const duration = Date.now() - startTime;

    console.log('❌ Verification failed');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`Error: ${error.message}`);

    process.exit(2);
  }
}

quickTest().catch(console.error);
