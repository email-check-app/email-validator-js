/**
 * Example: Integration of Algorithm name cleaning in a real-world scenario
 *
 * This example demonstrates how to use the Algorithm name cleaning functions
 * in a typical application where you need to clean user names from emails.
 */

import { cleanNameForAlgorithm, detectNameForAlgorithm, verifyEmail } from '../src/index';
import type { VerificationResult } from '../src/types';

// Example 1: Email verification with Algorithm name detection
async function processUserRegistration(email: string): Promise<void> {
  console.log(`Processing registration for: ${email}`);

  // Verify the email with name detection enabled
  const verificationResult: VerificationResult = await verifyEmail({
    emailAddress: email,
    verifyMx: true,
    verifySmtp: false, // Skip SMTP for demo purposes
    checkDisposable: true,
    detectName: true,
    nameDetectionMethod: detectNameForAlgorithm, // Use Algorithm cleaning
  });

  if (verificationResult.validFormat && verificationResult.validMx !== false) {
    console.log('✅ Email is valid');

    if (verificationResult.detectedName) {
      const { firstName, lastName, confidence } = verificationResult.detectedName;
      console.log(`👤 Detected name: ${firstName} ${lastName} (confidence: ${(confidence * 100).toFixed(1)}%)`);

      // Store the cleaned name in your database
      const cleanedFullName = `${firstName} ${lastName}`.trim();
      console.log(`📝 Storing clean name: "${cleanedFullName}"`);
    }

    if (verificationResult.isDisposable) {
      console.log('⚠️  Warning: Disposable email detected');
    }
  } else {
    console.log('❌ Email verification failed');
  }
}

// Example 2: Batch processing of user emails
async function processBatchUserEmails(emails: string[]): Promise<void> {
  console.log('\n=== Batch Processing with Algorithm Cleaning ===');

  for (const email of emails) {
    const detectedName = detectNameForAlgorithm(email);

    if (detectedName) {
      const { firstName, lastName, confidence } = detectedName;
      console.log(`${email} -> ${firstName} ${lastName} (${(confidence * 100).toFixed(1)}%)`);
    } else {
      console.log(`${email} -> No name detected`);
    }
  }
}

// Example 3: Manual name cleaning for existing data
function cleanExistingNames(names: string[]): string[] {
  console.log('\n=== Cleaning Existing Names ===');

  return names.map((name) => {
    const cleaned = cleanNameForAlgorithm(name);
    console.log(`"${name}" -> "${cleaned}"`);
    return cleaned;
  });
}

// Example 4: Integration with user profile update
interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

async function updateUserProfileWithCleanName(profile: UserProfile): Promise<UserProfile> {
  const detectedName = detectNameForAlgorithm(profile.email);

  if (detectedName && !profile.firstName && !profile.lastName) {
    // Auto-populate name fields if they're empty
    return {
      ...profile,
      firstName: detectedName.firstName,
      lastName: detectedName.lastName,
      displayName:
        detectedName.firstName && detectedName.lastName
          ? `${detectedName.firstName} ${detectedName.lastName}`
          : detectedName.firstName || detectedName.lastName || undefined,
    };
  }

  return profile;
}

// Main execution
async function main() {
  console.log('=== Algorithm Name Cleaning Integration Examples ===\n');

  // Example 1: User registration
  await processUserRegistration('john.doe.smith@company.com');
  await processUserRegistration('mary_jane.dev@techstartup.io');
  await processUserRegistration('user*_with*special*chars@domain.org');

  // Example 2: Batch processing
  const testEmails = [
    'first.last@company.com',
    'name_with_underscores@domain.com',
    'user*with*asterisks@service.net',
    'admin@system.com',
    'no-reply@notifications.org',
  ];

  await processBatchUserEmails(testEmails);

  // Example 3: Cleaning existing names
  const existingNames = ['John.Doe', 'Mary_Jane_Smith', 'User*Name', 'normal_name', '...dots...', '___underscores___'];

  cleanExistingNames(existingNames);

  // Example 4: Profile update
  const userProfile: UserProfile = {
    id: '123',
    email: 'jane.doe_smith@company.com',
    // firstName and lastName are empty - will be auto-populated
  };

  const updatedProfile = await updateUserProfileWithCleanName(userProfile);
  console.log('\n=== Profile Update Result ===');
  console.log('Original:', userProfile);
  console.log('Updated:', updatedProfile);

  console.log('\n✨ All examples completed successfully!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

export { processUserRegistration, processBatchUserEmails, cleanExistingNames, updateUserProfileWithCleanName };
