// Enhanced SMTP Verification Example
//
// This example demonstrates the new enhanced SMTP verification capabilities
// including TLS support, multiple port testing, and advanced configuration options.

import { resolveMx } from 'dns/promises';
import { getDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import type { SmtpVerificationResult } from '../src/types';

// Helper to extract boolean from SmtpVerificationResult
function toBooleanResult(result: SmtpVerificationResult): boolean | null {
  if (!result.canConnectSmtp) {
    return null;
  }
  return result.isDeliverable;
}

// Example 1: Basic usage with default settings (tests ports 25, 587, 465)
async function basicVerification(email: string) {
  const [local, domain] = email.split('@');

  try {
    const mxRecords = await resolveMx(domain);
    const mxHosts = mxRecords.map((mx) => mx.exchange);

    const smtpResult = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords: mxHosts,
      options: {
        timeout: 5000,
        debug: true, // Enable debug logging
      },
    });
    const isValid = toBooleanResult(smtpResult);

    console.log(`Email ${email} validation result:`, isValid);
    return isValid;
  } catch (error) {
    console.error('Error verifying email:', error);
    return null;
  }
}

// Example 2: Custom port configuration
async function customPortVerification(email: string) {
  const [local, domain] = email.split('@');

  try {
    const mxRecords = await resolveMx(domain);
    const mxHosts = mxRecords.map((mx) => mx.exchange);

    // Test only specific ports in custom order
    const smtpResult = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords: mxHosts,
      options: {
        ports: [587, 25], // Try STARTTLS first, then standard SMTP
        timeout: 3000,
        debug: true,
        tls: {
          rejectUnauthorized: false, // For testing environments
          minVersion: 'TLSv1.2',
        },
      },
    });
    const isValid = toBooleanResult(smtpResult);

    console.log(`Email ${email} validation result with custom ports:`, isValid);
    return isValid;
  } catch (error) {
    console.error('Error verifying email:', error);
    return null;
  }
}

// Example 3: High security configuration
async function secureVerification(email: string) {
  const [local, domain] = email.split('@');

  try {
    const mxRecords = await resolveMx(domain);
    const mxHosts = mxRecords.map((mx) => mx.exchange);

    const smtpResult = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords: mxHosts,
      options: {
        cache: getDefaultCache(),
        hostname: 'your-domain.com', // Use your actual domain
        useVRFY: true, // Enable VRFY fallback
        timeout: 10000, // Longer timeout for secure connections
        maxRetries: 3, // More retries for reliability
        debug: true,
        tls: {
          rejectUnauthorized: true, // Strict certificate validation
          minVersion: 'TLSv1.3', // Require TLS 1.3
        },
      },
    });
    const isValid = toBooleanResult(smtpResult);

    console.log(`Email ${email} secure validation result:`, isValid);
    return isValid;
  } catch (error) {
    console.error('Error verifying email:', error);
    return null;
  }
}

// Example 4: Test specific port with retry logic
async function testSpecificPort(email: string, port: number) {
  const [local, domain] = email.split('@');

  try {
    const mxRecords = await resolveMx(domain);
    const mxHosts = mxRecords.map((mx) => mx.exchange);

    // Test only port 465 (SMTPS)
    const smtpResult = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords: mxHosts,
      options: {
        ports: [port],
        maxRetries: 2,
        timeout: 3000,
        debug: true,
        tls: {
          rejectUnauthorized: false,
        },
      },
    });
    const isValid = toBooleanResult(smtpResult);

    console.log(`Email ${email} validation on port ${port}:`, isValid);
    return isValid;
  } catch (error) {
    console.error('Error verifying email:', error);
    return null;
  }
}

// Example 5: Fast verification with caching
async function fastVerification(emails: string[]) {
  const results = new Map<string, boolean | null>();

  for (const email of emails) {
    const [local, domain] = email.split('@');

    try {
      const mxRecords = await resolveMx(domain);
      const mxHosts = mxRecords.map((mx) => mx.exchange);

      // Optimized for speed with aggressive caching
      const smtpResult = await verifyMailboxSMTP({
        local,
        domain,
        mxRecords: mxHosts,
        options: {
          timeout: 2000, // Short timeout
          maxRetries: 1, // Minimal retries
          debug: false, // No debug logging for speed
          cache: getDefaultCache(), // Enable caching
          tls: {
            rejectUnauthorized: false, // Skip validation for speed
          },
        },
      });
      const isValid = toBooleanResult(smtpResult);

      results.set(email, isValid);
      console.log(`${email}: ${isValid}`);
    } catch (error) {
      console.error(`Error verifying ${email}:`, error);
      results.set(email, null);
    }
  }

  return results;
}

// Test all examples
async function runExamples() {
  console.log('=== Enhanced SMTP Verification Examples ===\n');

  // Test email (use a real email for actual testing)
  const testEmail = 'test@gmail.com';

  console.log('1. Basic verification:');
  await basicVerification(testEmail);
  console.log();

  console.log('2. Custom port configuration:');
  await customPortVerification(testEmail);
  console.log();

  console.log('3. High security configuration:');
  await secureVerification(testEmail);
  console.log();

  console.log('4. Test specific port (465 - SMTPS):');
  await testSpecificPort(testEmail, 465);
  console.log();

  console.log('5. Fast verification with caching:');
  const emails = [
    'user@gmail.com',
    'admin@yahoo.com',
    'support@outlook.com',
    'user@gmail.com', // Duplicate to test caching
  ];
  await fastVerification(emails);
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export { basicVerification, customPortVerification, secureVerification, testSpecificPort, fastVerification };
