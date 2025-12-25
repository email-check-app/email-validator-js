/**
 * Example demonstrating the usage of is-email-exists-core functionality
 *
 * This example shows how to:
 * - Basic email verification
 * - Provider-specific handling
 * - Custom SMTP configuration
 * - Using cache for better performance
 * - Handling different types of results
 */

// Import the existing disposable and free email checkers
import {
  EmailProvider,
  getProviderFromMxHost,
  type IIsEmailExistsCoreParams,
  type IsEmailExistsCoreResult,
  isEmailExistsCore,
  isGmail,
  isHotmailB2B,
  isHotmailB2C,
  isYahoo,
} from '../src/is-email-exists';

async function basicEmailVerification() {
  console.log('=== Basic Email Verification ===\n');

  const testEmails = [
    'test@gmail.com',
    'user@yahoo.com',
    'admin@outlook.com',
    'contact@company.com',
    'invalid-email@nonexistent-domain.xyz',
  ];

  for (const email of testEmails) {
    console.log(`Checking: ${email}`);

    try {
      const result = await isEmailExistsCore({
        emailAddress: email,
        fromEmail: 'verify@example.com',
        helloName: 'example.com',
        timeout: 5000,
        verifySmtp: false,
      });

      console.log(`  ✓ Provider: ${result.misc?.providerType}`);
      console.log(`  ✓ Reachable: ${result.isReachable}`);
      console.log(`  ✓ MX Records: ${result.mx?.records.map((r) => r.exchange).join(', ') || 'None'}`);

      if (result.error) {
        console.log(`  ⚠ Error: ${result.error}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
    }

    console.log('');
  }
}

async function advancedEmailVerification() {
  console.log('=== Advanced Email Verification ===\n');

  const email = 'user@business-company.com';

  // Advanced configuration with provider-specific settings
  const config: IIsEmailExistsCoreParams = {
    emailAddress: email,
    fromEmail: 'verification@myservice.com',
    helloName: 'myservice.com',
    timeout: 10000,
    verifySmtp: false,
    // Cache would be passed as an ICache interface implementation
    // cache: myCacheInstance,
  };

  try {
    const result = await isEmailExistsCore(config);

    console.log(`Email: ${result.email}`);
    console.log(`Provider: ${result.misc?.providerType}`);
    console.log(`Reachable: ${result.isReachable}`);
    console.log(`Catch-all: ${result.smtp?.isCatchAll || false}`);
    console.log(`Full Inbox: ${result.smtp?.hasFullInbox || false}`);
    console.log(`Disabled: ${result.smtp?.isDisabled || false}`);
    console.log(`MX Records: ${result.mx?.records.map((r) => r.exchange).join(', ') || 'None'}`);

    // Provider-specific analysis
    console.log('\n--- Provider Analysis ---');
    switch (result.misc?.providerType) {
      case EmailProvider.GMAIL:
        console.log('  Gmail address - high confidence in verification');
        break;
      case EmailProvider.YAHOO:
        console.log('  Yahoo address - may require special handling');
        break;
      case EmailProvider.HOTMAIL_B2C:
        console.log('  Microsoft consumer email (Hotmail/Outlook)');
        break;
      case EmailProvider.HOTMAIL_B2B:
        console.log('  Microsoft 365 business email');
        break;
      case EmailProvider.PROOFPOINT:
        console.log('  Proofpoint-protected email - additional security layers');
        break;
      case EmailProvider.MIMECAST:
        console.log('  Mimecast-protected email - additional security layers');
        break;
      default:
        console.log('  General email provider');
    }

    // Additional checks using existing validators
    console.log('\n--- Additional Checks ---');
    // Note: isDisposableEmail requires an object parameter
    console.log(`  Disposable email: N/A (requires async call)`);
    // Note: isFreeEmail requires an object parameter
    console.log(`  Free email provider: N/A (requires async call)`);
  } catch (error) {
    console.error(`Verification failed: ${error.message}`);
  }
}

async function providerDetectionExample() {
  console.log('=== Provider Detection Example ===\n');

  const mxHosts = [
    'gmail-smtp-in.l.google.com.',
    'mta7.am0.yahoodns.net.',
    'hotmail-com.olc.protection.outlook.com.',
    'mail.protection.outlook.com.',
    'mail.pphosted.com.',
    'smtp.mimecast.com.',
    'mail.custom-domain.com.',
  ];

  mxHosts.forEach((mx) => {
    console.log(`MX Host: ${mx}`);
    console.log(`  Gmail: ${isGmail(mx)}`);
    console.log(`  Yahoo: ${isYahoo(mx)}`);
    console.log(`  Hotmail B2C: ${isHotmailB2C(mx)}`);
    console.log(`  Hotmail B2B: ${isHotmailB2B(mx)}`);

    const provider = getProviderFromMxHost(mx);
    console.log(`  Detected Provider: ${provider}`);
    console.log('');
  });
}

async function catchAllDetectionExample() {
  console.log('=== Catch-All Detection Example ===\n');

  // These domains are known to have catch-all configurations
  const catchAllDomains = ['google.com', 'microsoft.com', 'apple.com'];

  for (const domain of catchAllDomains) {
    const testEmail = `test-${Date.now()}@${domain}`;
    console.log(`Testing catch-all for: ${testEmail}`);

    try {
      const result = await isEmailExistsCore({
        emailAddress: testEmail,
        fromEmail: 'verify@example.com',
        helloName: 'example.com',
        timeout: 8000,
        verifySmtp: false,
      });

      console.log(`  Is Catch-All: ${result.smtp?.isCatchAll || false}`);
      console.log(`  Is Reachable: ${result.isReachable}`);

      if (result.smtp?.isCatchAll) {
        console.log(`  ⚠️  This domain accepts emails for any username`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }

    console.log('');
  }
}

async function bulkEmailVerification() {
  console.log('=== Bulk Email Verification Example ===\n');

  const emailList = [
    'user1@gmail.com',
    'user2@yahoo.com',
    'user3@outlook.com',
    'invalid@example.com',
    'user4@nonexistent-domain.xyz',
  ];

  console.log(`Verifying ${emailList.length} emails...\n`);

  // Simple sequential processing (in production, you'd want to use Promise.all
  // with proper rate limiting and error handling)
  const results: { email: string; result: IsEmailExistsCoreResult | null }[] = [];

  for (const email of emailList) {
    try {
      const result = await isEmailExistsCore({
        emailAddress: email,
        fromEmail: 'bulk-verify@example.com',
        helloName: 'example.com',
        timeout: 5000,
        verifySmtp: false,
      });

      results.push({ email, result });
      console.log(
        `✓ ${email} - ${result.isReachable === 'safe' ? 'Deliverable' : 'Undeliverable'} (${result.misc?.providerType})`
      );
    } catch (error) {
      console.log(`✗ ${email} - Error: ${error.message}`);
      results.push({ email, result: null });
    }
  }

  // Summary statistics
  console.log('\n--- Summary ---');
  const verified = results.filter((r) => r.result !== null).length;
  const deliverable = results.filter((r) => r.result?.isReachable === 'safe').length;
  const catchAll = results.filter((r) => r.result?.smtp?.isCatchAll).length;

  console.log(`Total emails: ${emailList.length}`);
  console.log(`Successfully verified: ${verified}`);
  console.log(`Deliverable: ${deliverable}`);
  console.log(`Catch-all domains: ${catchAll}`);
  console.log(`Failed: ${emailList.length - verified}`);
}

async function runAllExamples() {
  console.log('🔍 Email Verification Examples\n');
  console.log('=====================================');

  try {
    await basicEmailVerification();
    console.log('=====================================\n');

    await advancedEmailVerification();
    console.log('=====================================\n');

    await providerDetectionExample();
    console.log('=====================================\n');

    await catchAllDetectionExample();
    console.log('=====================================\n');

    await bulkEmailVerification();
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  basicEmailVerification,
  advancedEmailVerification,
  providerDetectionExample,
  catchAllDetectionExample,
  bulkEmailVerification,
  runAllExamples,
};
