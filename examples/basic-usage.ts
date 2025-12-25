/**
 * Basic usage examples for is-email-exists functionality
 */

import { EmailProvider, getProviderType, isEmailExistsCore, validateEmailSyntax } from '../src/is-email-exists';

/**
 * Example 1: Basic email verification
 */
async function basicVerification() {
  console.log('🔍 Basic Email Verification');
  console.log('='.repeat(40));

  const email = 'user@example.com';

  try {
    const result = await isEmailExistsCore({
      emailAddress: email,
      verifyMx: true,
      verifySmtp: false, // Start without SMTP for speed
      checkDisposable: true,
      checkFree: true,
    });

    console.log(`Email: ${result.email}`);
    console.log(`Reachable: ${result.is_reachable}`);
    console.log(`Syntax: ${result.syntax.is_valid ? 'Valid ✅' : 'Invalid ❌'}`);
    console.log(`Domain: ${result.syntax.domain}`);
    console.log(`Local part: ${result.syntax.local_part}`);

    if (result.mx) {
      console.log(`MX Records: ${result.mx.success ? 'Found 📬' : 'Not found ❌'}`);
      if (result.mx.success) {
        console.log(`  - Count: ${result.mx.records.length}`);
        console.log(`  - Primary: ${result.mx.lowest_priority?.exchange}`);
      }
    }

    if (result.misc) {
      console.log(`Provider: ${result.misc.provider_type}`);
      console.log(`Disposable: ${result.misc.is_disposable ? 'Yes ⚠️' : 'No ✅'}`);
      console.log(`Free provider: ${result.misc.is_free ? 'Yes 📧' : 'No'}`);
    }

    console.log(`Duration: ${result.duration}ms`);
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Syntax-only validation
 */
async function syntaxValidation() {
  console.log('\n📝 Syntax-Only Validation');
  console.log('='.repeat(40));

  const emailsToValidate = [
    'valid.email@example.com',
    'invalid-email',
    'user@domain.with spaces',
    'test@gmail.com',
    'TOO_LONG_LOCAL_PART_'.repeat(2) + '@example.com',
  ];

  emailsToValidate.forEach((email) => {
    const result = validateEmailSyntax(email);
    console.log(`${result.is_valid ? '✅' : '❌'} ${email}`);

    if (!result.is_valid) {
      console.log(`   Error: ${result.error}`);
    } else {
      console.log(`   Domain: ${result.domain}, Local: ${result.local_part}`);
    }
  });
}

/**
 * Example 3: Provider detection
 */
function providerDetection() {
  console.log('\n🏷️  Provider Type Detection');
  console.log('='.repeat(40));

  const providerEmails = [
    'user@gmail.com',
    'person@yahoo.com',
    'contact@outlook.com',
    'support@company.com',
    'admin@university.edu',
    'info@government.gov',
  ];

  providerEmails.forEach((email) => {
    const [, domain] = email.split('@');
    if (domain) {
      const providerType = getProviderType(domain);

      let icon = '📧';
      if (providerType === EmailProvider.GMAIL) icon = '🔵';
      else if (providerType === EmailProvider.YAHOO) icon = '🟣';
      else if (providerType === EmailProvider.HOTMAIL_B2C) icon = '🔷';
      else if (providerType === EmailProvider.EVERYTHING_ELSE) icon = '🌐';

      console.log(`${icon} ${email.padEnd(25)} ${providerType}`);
    }
  });
}

/**
 * Example 4: Full verification with custom settings
 */
async function fullVerification() {
  console.log('\n🔬 Full Verification with Custom Settings');
  console.log('='.repeat(40));

  const testEmails = [
    {
      email: 'support@gmail.com',
      options: {
        timeout: 15000,
        verifyMx: true,
        verifySmtp: false, // Skip SMTP for demo speed
        checkDisposable: true,
        checkFree: true,
        enableProviderOptimizations: true,
      },
    },
    {
      email: 'contact@github.com',
      options: {
        timeout: 10000,
        verifyMx: true,
        verifySmtp: false,
        checkDisposable: true,
        checkFree: true,
        enableProviderOptimizations: true,
      },
    },
    {
      email: 'test@10minutemail.com',
      options: {
        timeout: 5000,
        verifyMx: false, // Skip MX for disposable email
        verifySmtp: false,
        checkDisposable: true,
        checkFree: true,
      },
    },
  ];

  for (const { email, options } of testEmails) {
    console.log(`\n📧 Checking: ${email}`);
    console.log(`   Settings: ${JSON.stringify(options, null, 6).replace(/\n/g, ' ')}`);

    try {
      const result = await isEmailExistsCore({
        emailAddress: email,
        ...options,
      });

      console.log(`\n📊 Result:`);
      console.log(`   Reachable: ${result.is_reachable.toUpperCase()}`);
      console.log(`   Duration: ${result.duration}ms`);

      if (result.misc) {
        console.log(`   Provider: ${result.misc.provider_type}`);
        if (result.misc.is_disposable) {
          console.log(`   ⚠️  Warning: Disposable email!`);
        }
        if (result.misc.is_free) {
          console.log(`   📧 Free email provider`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${(error as Error).message}`);
    }
  }
}

/**
 * Example 5: Performance comparison
 */
async function performanceComparison() {
  console.log('\n⚡ Performance Comparison');
  console.log('='.repeat(40));

  const testEmail = 'test@example.com';
  const iterations = 10;

  console.log(`Testing ${iterations} validations of: ${testEmail}\n`);

  // Test 1: Syntax only
  console.log('1️⃣  Syntax-only validation:');
  const startTime1 = Date.now();
  for (let i = 0; i < iterations; i++) {
    validateEmailSyntax(testEmail);
  }
  const duration1 = Date.now() - startTime1;
  console.log(`   Average: ${(duration1 / iterations).toFixed(2)}ms per validation`);

  // Test 2: With MX lookup
  console.log('\n2️⃣  With MX lookup:');
  const startTime2 = Date.now();
  for (let i = 0; i < Math.min(iterations, 3); i++) {
    // Limit to avoid rate limiting
    await isEmailExistsCore({
      emailAddress: testEmail,
      verifyMx: true,
      verifySmtp: false,
    });
  }
  const duration2 = Date.now() - startTime2;
  console.log(`   Average: ${(duration2 / Math.min(iterations, 3)).toFixed(2)}ms per validation`);

  // Test 3: Full verification (just one time)
  console.log('\n3️⃣  Full verification:');
  const startTime3 = Date.now();
  await isEmailExistsCore({
    emailAddress: testEmail,
    verifyMx: true,
    verifySmtp: false, // Skip SMTP for demo
  });
  const duration3 = Date.now() - startTime3;
  console.log(`   Time: ${duration3}ms`);
}

/**
 * Example 6: Error handling
 */
async function errorHandling() {
  console.log('\n🚨 Error Handling Examples');
  console.log('='.repeat(40));

  const testCases = [
    {
      name: 'Invalid email format',
      email: 'definitely-not-an-email',
    },
    {
      name: 'Nonexistent domain',
      email: 'user@this-does-not-exist-12345.com',
    },
    {
      name: 'Very short timeout',
      email: 'test@example.com',
      options: { timeout: 1 }, // 1ms timeout
    },
    {
      name: 'Null/undefined input',
      email: null as any,
    },
  ];

  for (const { name, email, options = {} } of testCases) {
    console.log(`\n${name}:`);
    try {
      const result = await isEmailExistsCore({
        emailAddress: email,
        verifyMx: true,
        verifySmtp: false,
        ...options,
      });

      if (result.error) {
        console.log(`   ⚠️  Handled gracefully: ${result.error}`);
      } else {
        console.log(`   📊 Result: ${result.is_reachable} (${result.duration}ms)`);
      }
    } catch (error) {
      console.log(`   ❌ Unexpected error: ${(error as Error).message}`);
    }
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 Is-email-Exists - Basic Usage Examples\n');

  try {
    await basicVerification();
    await syntaxValidation();
    providerDetection();
    await fullVerification();
    await performanceComparison();
    await errorHandling();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

// Export for use in other modules
export {
  basicVerification,
  syntaxValidation,
  providerDetection,
  fullVerification,
  performanceComparison,
  errorHandling,
  runAllExamples,
};
