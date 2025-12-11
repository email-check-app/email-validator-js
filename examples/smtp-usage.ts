// SMTP Verification - Clean Implementation Examples
//
// This demonstrates the new clean API without backward compatibility concerns

import { verifyMailboxSMTP } from '../src/smtp';

// Example 1: Simple verification with defaults
// Tests ports 25 -> 587 -> 465 with TLS
async function simpleVerify(email: string, mxRecords: string[]) {
  const [local, domain] = email.split('@');

  return await verifyMailboxSMTP({
    local,
    domain,
    mxRecords,
  });
}

// Example 2: Custom ports and timeout
async function customPorts(email: string, mxRecords: string[]) {
  const [local, domain] = email.split('@');

  return await verifyMailboxSMTP({
    local,
    domain,
    mxRecords,
    options: {
      ports: [587, 465], // Only try secure ports
      timeout: 5000,
      maxRetries: 2,
    },
  });
}

// Example 3: Security-focused verification
async function secureVerify(email: string, mxRecords: string[]) {
  const [local, domain] = email.split('@');

  return await verifyMailboxSMTP({
    local,
    domain,
    mxRecords,
    options: {
      ports: [465], // Only SMTPS with implicit TLS
      timeout: 10000,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
      },
      hostname: 'your-domain.com',
      cache: true,
    },
  });
}

// Example 4: Fast bulk verification
async function fastBulk(emails: string[], mxMap: Map<string, string[]>) {
  const results = [];

  for (const email of emails) {
    const [local, domain] = email.split('@');
    const mxRecords = mxMap.get(domain) || [];

    const isValid = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords,
      options: {
        ports: [25, 587],
        timeout: 2000,
        maxRetries: 1,
        cache: true,
        debug: false,
      },
    });

    results.push({ email, valid: isValid });
  }

  return results;
}

// Example 5: Debug mode with logging
async function debugVerify(email: string, mxRecords: string[]) {
  const [local, domain] = email.split('@');

  return await verifyMailboxSMTP({
    local,
    domain,
    mxRecords,
    options: {
      debug: true,
      timeout: 5000,
      useVRFY: true,
      cache: false,
    },
  });
}

// Example 6: Try specific port only
async function tryPortOnly(email: string, mxRecords: string[], port: number) {
  const [local, domain] = email.split('@');

  return await verifyMailboxSMTP({
    local,
    domain,
    mxRecords,
    options: {
      ports: [port],
      timeout: 3000,
      maxRetries: 3,
      debug: true,
    },
  });
}

// Test function
async function test() {
  // Example MX records (use real ones in production)
  const mxRecords = ['gmail-smtp-in.l.google.com'];
  const email = 'test@gmail.com';

  console.log('Testing email:', email);
  console.log('MX records:', mxRecords);

  // Run different verification strategies
  console.log('\n1. Simple verification:');
  console.log(await simpleVerify(email, mxRecords));

  console.log('\n2. Custom ports (587, 465):');
  console.log(await customPorts(email, mxRecords));

  console.log('\n3. Port 465 only:');
  console.log(await tryPortOnly(email, mxRecords, 465));

  console.log('\n4. With debug logging:');
  console.log(await debugVerify(email, mxRecords));
}

export { simpleVerify, customPorts, secureVerify, fastBulk, debugVerify, tryPortOnly };

if (require.main === module) {
  test().catch(console.error);
}
