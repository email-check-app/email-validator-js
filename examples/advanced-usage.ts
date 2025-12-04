import {
  clearDefaultCache,
  isDisposableEmail,
  isFreeEmail,
  VerificationErrorCode,
  verifyEmail,
  verifyEmailBatch,
} from '../src';

async function basicUsage() {
  console.log('=== Basic Email Verification ===');

  const result = await verifyEmail({
    emailAddress: 'user@example.com',
    verifyMx: true,
    verifySmtp: true,
    timeout: 5000,
  });

  console.log('Valid format:', result.validFormat);
  console.log('Valid MX:', result.validMx);
  console.log('Valid SMTP:', result.validSmtp);
}

async function detailedVerification() {
  console.log('\n=== Detailed Email Verification ===');

  const result = await verifyEmail({
    emailAddress: 'test@gmail.com',
    verifyMx: true,
    verifySmtp: false,
    checkDisposable: true,
    checkFree: true,
    timeout: 5000,
  });

  console.log('Valid:', result.validFormat && result.validMx);
  console.log('Format valid:', result.validFormat);
  console.log('MX valid:', result.validMx);
  console.log('SMTP valid:', result.validSmtp);
  console.log('Is disposable:', result.isDisposable);
  console.log('Is free provider:', result.isFree);
  console.log('Verification time:', result.metadata?.verificationTime, 'ms');
  console.log('From cache:', result.metadata?.cached);

  if (result.metadata?.error) {
    console.log('Error:', result.metadata.error);
  }
}

async function batchVerification() {
  console.log('\n=== Batch Email Verification ===');

  const emails = [
    'valid@gmail.com',
    'test@yopmail.com', // disposable
    'user@example.com',
    'invalid-email',
    'admin@company.com',
  ];

  const result = await verifyEmailBatch({
    emailAddresses: emails,
    concurrency: 3,
    verifyMx: true,
    verifySmtp: false,
    checkDisposable: true,
    checkFree: true,
    timeout: 5000,
  });

  console.log('Summary:');
  console.log('  Total:', result.summary.total);
  console.log('  Valid:', result.summary.valid);
  console.log('  Invalid:', result.summary.invalid);
  console.log('  Processing time:', result.summary.processingTime, 'ms');

  console.log('\nDetailed results:');
  result.results.forEach((verification, email) => {
    console.log(`  ${email}:`);
    console.log(`    Valid: ${verification.validFormat && verification.validMx}`);
    if (verification.isDisposable) {
      console.log(`    ⚠️  Disposable email`);
    }
    if (verification.isFree) {
      console.log(`    ℹ️  Free email provider`);
    }
  });
}

async function checkEmailProviders() {
  console.log('\n=== Check Email Providers ===');

  const testEmails = ['user@yopmail.com', 'user@gmail.com', 'user@company.com'];

  for (const email of testEmails) {
    console.log(`${email}:`);
    console.log(`  Disposable: ${await isDisposableEmail({ emailOrDomain: email })}`);
    console.log(`  Free provider: ${await isFreeEmail({ emailOrDomain: email })}`);
  }
}

async function demonstrateCache() {
  console.log('\n=== Cache Demonstration ===');

  // First verification - will hit DNS and SMTP
  console.log('First verification (no cache):');
  const start1 = Date.now();
  const result1 = await verifyEmail({
    emailAddress: 'cache@example.com',
    verifyMx: true,
    verifySmtp: false,
  });
  console.log(`  Time: ${Date.now() - start1}ms`);
  console.log(`  Cached: ${result1.metadata?.cached}`);

  // Second verification - will use cache
  console.log('Second verification (cached):');
  const start2 = Date.now();
  const result2 = await verifyEmail({
    emailAddress: 'cache@example.com',
    verifyMx: true,
    verifySmtp: false,
  });
  console.log(`  Time: ${Date.now() - start2}ms`);
  console.log(`  Cached: ${result2.metadata?.cached}`);

  // Clear cache
  console.log('Clearing cache...');
  clearDefaultCache();

  // Third verification - cache cleared, will hit DNS again
  console.log('Third verification (cache cleared):');
  const start3 = Date.now();
  const result3 = await verifyEmail({
    emailAddress: 'cache@example.com',
    verifyMx: true,
    verifySmtp: false,
  });
  console.log(`  Time: ${Date.now() - start3}ms`);
  console.log(`  Cached: ${result3.metadata?.cached}`);
}

async function handleErrors() {
  console.log('\n=== Error Handling ===');

  const testCases = ['invalid-format', 'user@nonexistent-domain-xyz.com', 'test@yopmail.com'];

  for (const email of testCases) {
    const result = await verifyEmail({
      emailAddress: email,
      verifyMx: true,
      checkDisposable: true,
    });

    console.log(`\n${email}:`);
    console.log(`  Valid: ${result.validFormat && result.validMx}`);

    if (result.metadata?.error === VerificationErrorCode.INVALID_FORMAT) {
      console.log('  Error: Invalid email format');
    }
    if (result.metadata?.error === VerificationErrorCode.NO_MX_RECORDS) {
      console.log('  Error: No MX records found');
    }
    if (result.metadata?.error === VerificationErrorCode.DISPOSABLE_EMAIL) {
      console.log('  Error: Disposable email detected');
    }
  }
}

// Run all examples
async function runExamples() {
  try {
    await basicUsage();
    await detailedVerification();
    await batchVerification();
    await checkEmailProviders();
    await demonstrateCache();
    await handleErrors();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  runExamples();
}
