/**
 * Comprehensive demo for check-if-email-exists functionality
 */

import {
  type CheckIfEmailExistsCoreResult,
  type CheckIfEmailExistsSmtpOptions,
  checkIfEmailExistsConstants,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderType,
  queryMxRecords,
  validateEmailSyntax,
  verifySmtpConnection,
} from '../src/check-if-email-exists';

/**
 * Demo 1: Basic check-if-email-exists functionality
 */
async function basicCheckIfExistsDemo() {
  console.log('🔍 Basic Check-if-Email-Exists Demo');
  console.log('='.repeat(50));

  const testEmails = [
    'test@gmail.com',
    'user@yahoo.com',
    'contact@github.com',
    'admin@nonexistent12345.com',
    'invalid-email-format',
  ];

  for (const email of testEmails) {
    console.log(`\n📧 Checking: ${email}`);
    console.log('─'.repeat(40));

    try {
      const result = await checkIfEmailExistsCore({
        emailAddress: email,
        timeout: 15000,
        verifyMx: true,
        verifySmtp: false, // Skip SMTP for demo speed
        checkDisposable: true,
        checkFree: true,
        enableProviderOptimizations: true,
      });

      console.log(`📊 Result: ${result.isReachable.toUpperCase()}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);

      // Syntax validation
      console.log(`✅ Syntax: ${result.syntax.isValid ? 'Valid' : 'Invalid'}`);
      if (result.syntax.isValid) {
        console.log(`   Email: ${result.email}`);
        console.log(`   Domain: ${result.syntax.domain}`);
        console.log(`   Local: ${result.syntax.localPart}`);
      } else {
        console.log(`   Error: ${result.syntax.error}`);
      }

      // MX records
      if (result.mx) {
        console.log(`📬 MX Records: ${result.mx.success ? 'Found' : 'Not found'}`);
        if (result.mx.success) {
          console.log(`   Records: ${result.mx.records.length}`);
          console.log(
            `   Primary: ${result.mx.lowestPriority?.exchange} (pref: ${result.mx.lowestPriority?.priority})`
          );
        } else {
          console.log(`   Error: ${result.mx.error}`);
        }
      }

      // Provider information
      if (result.misc) {
        console.log(`🏷️  Provider Info:`);
        console.log(`   Type: ${result.misc.providerType}`);
        console.log(`   Disposable: ${result.misc.isDisposable ? 'Yes ⚠️' : 'No ✅'}`);
        console.log(`   Free provider: ${result.misc.isFree ? 'Yes 📧' : 'No'}`);
      }

      // SMTP (would be shown if enabled)
      if (result.smtp) {
        console.log(`🔌 SMTP: ${result.smtp.success ? 'Connected' : 'Failed'}`);
        if (result.smtp.success) {
          console.log(`   Deliverable: ${result.smtp.isDeliverable ? 'Yes' : 'No'}`);
          console.log(`   Can connect: ${result.smtp.canConnect ? 'Yes' : 'No'}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${(error as Error).message}`);
    }
  }
}

/**
 * Demo 2: Provider-specific optimizations
 */
async function providerOptimizationsDemo() {
  console.log('\n🏷️  Provider-Specific Optimizations Demo');
  console.log('='.repeat(50));

  const providerTests = [
    { email: 'user@gmail.com', type: EmailProvider.gmail },
    { email: 'person@yahoo.com', type: EmailProvider.yahoo },
    { email: 'contact@outlook.com', type: EmailProvider.hotmailB2c },
    { email: 'admin@customcompany.com', type: EmailProvider.everythingElse },
  ];

  console.log('\n🔧 Provider optimizations applied:\n');

  for (const test of providerTests) {
    console.log(`📧 ${test.email} (${test.type})`);

    // Show what optimizations would be applied
    const defaultOptions: {
      timeout: number;
      port: number;
      retries: number;
    } = {
      timeout: checkIfEmailExistsConstants.defaultTimeout,
      port: checkIfEmailExistsConstants.defaultSmtpPort,
      retries: 2,
    };

    console.log(`   Default: ${JSON.stringify(defaultOptions)}`);

    // Simulate optimization application
    let optimizedOptions: {
      timeout: number;
      port: number;
      retries: number;
    } = { ...defaultOptions };
    switch (test.type) {
      case EmailProvider.gmail:
        optimizedOptions = { ...defaultOptions, timeout: 15000, port: 587, retries: 1 };
        break;
      case EmailProvider.yahoo:
        optimizedOptions = { ...defaultOptions, timeout: 20000, port: 587, retries: 2 };
        break;
      case EmailProvider.hotmailB2c:
        optimizedOptions = { ...defaultOptions, timeout: 15000, port: 587, retries: 2 };
        break;
    }

    console.log(`   Optimized: ${JSON.stringify(optimizedOptions)}`);

    // Run verification with optimizations
    try {
      const result = await checkIfEmailExistsCore({
        emailAddress: test.email,
        verifyMx: true,
        verifySmtp: false,
        enableProviderOptimizations: true,
      });

      console.log(`   Result: ${result.isReachable} (${result.duration}ms)`);
      console.log(`   Provider detected: ${result.misc?.providerType}`);
    } catch (error) {
      console.log(`   Error: ${(error as Error).message}`);
    }

    console.log('');
  }
}

/**
 * Demo 3: SMTP verification with custom settings
 */
async function customSmtpVerificationDemo() {
  console.log('🔌 Custom SMTP Verification Demo');
  console.log('='.repeat(50));

  const testEmail = 'test@example.com';

  console.log(`📧 Testing SMTP verification for: ${testEmail}\n`);

  // Get MX records first
  const [, domain] = testEmail.split('@');
  if (!domain) {
    console.log('❌ Invalid email domain');
    return;
  }

  const mxResult = await queryMxRecords(domain);
  if (!mxResult.success || !mxResult.lowestPriority) {
    console.log('❌ No MX records found');
    return;
  }

  console.log(`📬 Using MX server: ${mxResult.lowestPriority.exchange}\n`);

  // Test different SMTP configurations
  const smtpConfigs: Array<{ name: string; options: CheckIfEmailExistsSmtpOptions }> = [
    {
      name: 'Default settings',
      options: {},
    },
    {
      name: 'Fast verification',
      options: { timeout: 5000, retries: 0 },
    },
    {
      name: 'Thorough verification',
      options: { timeout: 30000, retries: 3 },
    },
    {
      name: 'Custom identification',
      options: {
        fromEmail: 'verifier@mycompany.com',
        helloName: 'mycompany.com',
      },
    },
  ];

  for (const config of smtpConfigs) {
    console.log(`🎯 ${config.name}:`);
    console.log(`   Settings: ${JSON.stringify(config.options)}`);

    try {
      const startTime = Date.now();

      const smtpResult = await verifySmtpConnection(
        testEmail,
        domain,
        mxResult.lowestPriority.exchange,
        config.options,
        EmailProvider.everythingElse
      );

      const duration = Date.now() - startTime;

      console.log(`   Success: ${smtpResult.success}`);
      console.log(`   Deliverable: ${smtpResult.isDeliverable}`);
      console.log(`   Can connect: ${smtpResult.canConnect}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Provider: ${smtpResult.providerUsed}`);

      if (smtpResult.error) {
        console.log(`   Error: ${smtpResult.error}`);
      }
    } catch (error) {
      console.log(`   Failed: ${(error as Error).message}`);
    }

    console.log('');
  }
}

/**
 * Demo 4: Performance comparison with different verification levels
 */
async function performanceComparisonDemo() {
  console.log('⚡ Performance Comparison Demo');
  console.log('='.repeat(50));

  const testEmail = 'performance-test@example.com';
  const iterations = 5;

  console.log(`📊 Testing ${iterations} iterations of: ${testEmail}\n`);

  const tests = [
    {
      name: 'Syntax only',
      options: { verifyMx: false, verifySmtp: false },
    },
    {
      name: 'Syntax + MX',
      options: { verifyMx: true, verifySmtp: false },
    },
    {
      name: 'Syntax + MX + Provider',
      options: {
        verifyMx: true,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: true,
      },
    },
  ];

  for (const test of tests) {
    console.log(`🎯 ${test.name}:`);

    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      try {
        const result = await checkIfEmailExistsCore({
          emailAddress: testEmail,
          timeout: 10000,
          ...test.options,
        });

        const duration = Date.now() - startTime;
        durations.push(duration);

        console.log(`   Run ${i + 1}: ${duration}ms (${result.isReachable})`);
      } catch (error) {
        console.log(`   Run ${i + 1}: Error - ${(error as Error).message}`);
      }
    }

    if (durations.length > 0) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);

      console.log(`   📊 Average: ${avg.toFixed(2)}ms`);
      console.log(`   📊 Range: ${min}ms - ${max}ms`);
    }

    console.log('');
  }
}

/**
 * Demo 5: Error handling and edge cases
 */
async function errorHandlingDemo() {
  console.log('🚨 Error Handling & Edge Cases Demo');
  console.log('='.repeat(50));

  const edgeCases = [
    {
      name: 'Invalid email format',
      email: 'definitely-not-an-email',
      options: {},
    },
    {
      name: 'Nonexistent domain',
      email: 'user@domain-that-absolutely-does-not-exist-12345.com',
      options: {},
    },
    {
      name: 'Extremely short timeout',
      email: 'test@example.com',
      options: { timeout: 1 },
    },
    {
      name: 'Invalid input types',
      email: null as any,
      options: {},
    },
    {
      name: 'Empty string email',
      email: '',
      options: {},
    },
  ];

  for (const testCase of edgeCases) {
    console.log(`\n🧪 ${testCase.name}:`);
    console.log(`   Input: ${testCase.email}`);

    try {
      const result = await checkIfEmailExistsCore({
        emailAddress: testCase.email,
        verifyMx: true,
        verifySmtp: false,
        ...testCase.options,
      });

      if (result.error) {
        console.log(`   ⚠️  Handled gracefully: ${result.error}`);
        console.log(`   📊 Reachable: ${result.isReachable}`);
      } else {
        console.log(`   📊 Result: ${result.isReachable} (${result.duration}ms)`);
      }
    } catch (error) {
      console.log(`   ❌ Unexpected error: ${(error as Error).message}`);
      console.log(`   💡 This should be handled better in production`);
    }
  }
}

/**
 * Demo 6: Real-world scenarios
 */
async function realWorldScenariosDemo() {
  console.log('🌍 Real-World Scenarios Demo');
  console.log('='.repeat(50));

  const scenarios = [
    {
      name: 'User registration validation',
      description: 'Validate email during user signup',
      emails: ['newuser@gmail.com', 'spam@10minutemail.com', 'fake@nonexistent.com'],
      options: {
        timeout: 10000,
        verifyMx: true,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: false, // Allow free emails for user signup
      },
    },
    {
      name: 'Business lead verification',
      description: 'Verify B2B email leads',
      emails: ['contact@company.com', 'sales@enterprise.co', 'info@startup.io'],
      options: {
        timeout: 15000,
        verifyMx: true,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: false,
      },
    },
    {
      name: 'Email marketing list cleaning',
      description: 'Clean email marketing lists',
      emails: ['customer@gmail.com', 'client@business.com', 'invalid@badsyntax'],
      options: {
        timeout: 20000,
        verifyMx: true,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: true,
      },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📋 ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Emails to test: ${scenario.emails.length}\n`);

    const results = [];

    for (const email of scenario.emails) {
      try {
        const result = await checkIfEmailExistsCore({
          emailAddress: email,
          ...scenario.options,
        });

        results.push({ email, result });

        let status = '❓';
        if (result.isReachable === 'safe') status = '✅';
        else if (result.isReachable === 'invalid') status = '❌';
        else if (result.isReachable === 'risky') status = '⚠️';

        console.log(`   ${status} ${email}: ${result.isReachable} (${result.duration}ms)`);

        if (result.misc?.isDisposable) {
          console.log(`      ⚠️  Disposable email detected`);
        }
      } catch (error) {
        console.log(`   ❌ ${email}: Error - ${(error as Error).message}`);
      }
    }

    // Summary for this scenario
    const validCount = results.filter((r) => r.result.isReachable === 'safe').length;
    const invalidCount = results.filter((r) => r.result.isReachable === 'invalid').length;
    const riskyCount = results.filter((r) => r.result.isReachable === 'risky').length;

    console.log(`\n   📊 Summary: ${validCount} valid, ${invalidCount} invalid, ${riskyCount} risky`);
  }
}

/**
 * Main demo runner
 */
async function runCheckIfEmailExistsDemo() {
  console.log('🚀 Check-if-Email-Exists - Complete Demo');
  console.log('🔄 Port of check-if-email-exists core functionality\n');

  try {
    await basicCheckIfExistsDemo();
    await providerOptimizationsDemo();
    await customSmtpVerificationDemo();
    await performanceComparisonDemo();
    await errorHandlingDemo();
    await realWorldScenariosDemo();

    console.log('\n🎉 All demos completed successfully!');
    console.log('\n💡 Key takeaways:');
    console.log('   ✅ Full email syntax validation (RFC 5321 compliant)');
    console.log('   ✅ MX record lookup with caching support');
    console.log('   ✅ Provider-specific optimizations');
    console.log('   ✅ Disposable/free email detection');
    console.log('   ✅ Comprehensive error handling');
    console.log('   ✅ Performance optimization options');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  runCheckIfEmailExistsDemo().catch(console.error);
}

// Export for use in other modules
export {
  basicCheckIfExistsDemo,
  providerOptimizationsDemo,
  customSmtpVerificationDemo,
  performanceComparisonDemo,
  errorHandlingDemo,
  realWorldScenariosDemo,
  runCheckIfEmailExistsDemo,
};
