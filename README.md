# Advanced Email Validator

[![NPM version](https://badgen.net/npm/v/@emailcheck/email-validator-js)](https://npm.im/@emailcheck/email-validator-js)
[![Build Status](https://github.com/email-check-app/email-validator-js/workflows/CI/badge.svg)](https://github.com/email-check-app/email-validator-js/actions)
[![Downloads](https://img.shields.io/npm/dm/@emailcheck/email-validator-js.svg)](https://www.npmjs.com/package/@emailcheck/email-validator-js)
[![UNPKG](https://img.shields.io/badge/UNPKG-OK-179BD7.svg)](https://unpkg.com/browse/@emailcheck/email-validator-js@latest/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-BSL%201.1-blue.svg)](LICENSE.md)

🚀 **Advanced email validation library** for Node.js with **MX record checking**, **SMTP verification**, **disposable email detection**, and **much more**. Now with **batch processing**, **advanced caching**, and **detailed error reporting**.

## 📋 Table of Contents

- [Features](#features)
- [Use Cases](#use-cases)
- [API / Cloud Service](#api--cloud-hosted-service)
- [License](#license)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Migration Guide (to v3.x)](#migration-guide-to-v3x)
- [API Reference](#api-reference)
- [Configuration](#configuration-options)
- [Examples](#examples)
- [Custom Cache Injection](#-custom-cache-injection)
- [Performance & Caching](#-performance--caching)
- [Email Provider Databases](#️-email-provider-databases)
- [Testing](#testing)
- [Contributing](#contributing)

## Features

✅ Check email address validity

✅ Check email address domain validity in domain TLD list

✅ Check email address MX records

✅ Check email address SMTP connection

✅ Check email address disposable or burnable status

✅ Check email address free email provider status

✅ **NEW:** Batch email verification with concurrency control

✅ **NEW:** Detailed verification results with error codes

✅ **NEW:** Built-in caching for improved performance

✅ **NEW:** Automatic retry mechanism for transient failures

✅ **NEW:** RFC 5321 compliant validation

✅ **NEW:** **Enhanced SMTP verification** with TLS/SSL support

✅ **NEW:** **Multi-port testing** (25, 587, 465) with automatic port optimization

✅ **NEW:** **Custom SMTP sequences** and command control (EHLO/HELO, VRFY, STARTTLS)

✅ **NEW:** **Smart caching** for port performance and SMTP results

✅ **NEW:** Enhanced name detection from email addresses with composite name support

✅ **NEW:** Domain typo detection and suggestions with caching

✅ **NEW:** Get domain age via WHOIS lookup

✅ **NEW:** Get domain registration status via WHOIS lookup

✅ **NEW:** Serverless support for AWS Lambda, Vercel Edge, Cloudflare Workers, and more

✅ **Code Quality**: Comprehensive linting, type checking, and automated testing

## Use Cases

- Increase delivery rate of email campaigns by removing spam emails
- Increase email open rate and your marketing IPs reputation
- Protect your website from spam, bots and fake emails
- Protect your product signup form from fake emails
- Protect your website forms from fake emails
- Protect your self from fraud orders and accounts using fake emails
- Integrate email address verification into your website forms
- Integrate email address verification into your backoffice administration and order processing

## API / Cloud Hosted Service

We offer this `email verification and validation and more advanced features` in our Scalable Cloud API Service Offering - You could try it here [Email Verification](https://email-check.app/products/email)

---

## License

email-validator-js is licensed under [Business Source License 1.1](LICENSE.md).

### Quick License Summary

| Use Case | Is a commercial license required?|
|----------|-----------|
| Exploring email-validator-js for your own research, hobbies, and testing purposes | **No** |
| Using email-validator-js to build a proof-of-concept application | **No** |
| Using email-validator-js to build revenue-generating applications | **Yes** |
| Using email-validator-js to build software that is provided as a service (SaaS) | **Yes** |
| Forking email-validator-js for any production purposes | **Yes** |

📄 **For commercial licensing**, visit [email-check.app/license/email-validator](https://email-check.app/license/email-validator) or contact us at [sales@email-check.app](mailto:sales@email-check.app?subject=Interested%20in%20email-validator-js%20commercial%20license).

---

## Installation

Install the module through Yarn:
```bash
yarn add @emailcheck/email-validator-js
```

Or NPM:
```bash
npm install @emailcheck/email-validator-js
```

### Requirements
- Node.js >= 12.0
- TypeScript >= 4.0 (for TypeScript users)

### Build System
- Uses Rollup for efficient bundling and tree-shaking
- Optimized build output with separate CJS and ESM modules
- Serverless builds for edge environments

## Quick Start

```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

// Basic usage
const result = await verifyEmail({
  emailAddress: 'user@mydomain.com',
  verifyMx: true,
  verifySmtp: true,
  timeout: 3000
});

console.log(result.validFormat);  // true
console.log(result.validMx);      // true or false
console.log(result.validSmtp);    // true or false
```

> **⚠️ Breaking Change in v3.x**: Enum values and constants now use `camelCase` instead of `SCREAMING_SNAKE_CASE`. See [Migration Guide](#migration-guide-to-v3x) for details.

## Migration Guide (to v3.x)

### Overview

Version 3.x introduces a **breaking change** to improve code consistency with TypeScript/JavaScript conventions. All enum values and constants now use `camelCase` instead of `SCREAMING_SNAKE_CASE`.

### What Changed

#### Enum Values

| Before (v2.x) | After (v3.x) |
|---------------|--------------|
| `EmailProvider.GMAIL` | `EmailProvider.gmail` |
| `EmailProvider.YAHOO` | `EmailProvider.yahoo` |
| `EmailProvider.HOTMAIL_B2C` | `EmailProvider.hotmailB2c` |
| `VerificationErrorCode.INVALID_FORMAT` | `VerificationErrorCode.invalidFormat` |
| `VerificationErrorCode.NO_MX_RECORDS` | `VerificationErrorCode.noMxRecords` |
| `SMTPStep.GREETING` | `SMTPStep.greeting` |
| `SMTPStep.EHLO` | `SMTPStep.ehlo` |
| `SMTPStep.MAIL_FROM` | `SMTPStep.mailFrom` |

#### Constants

| Before (v2.x) | After (v3.x) |
|---------------|--------------|
| `CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT` | `checkIfEmailExistsConstants.defaultTimeout` |
| `CHECK_IF_EMAIL_EXISTS_CONSTANTS.GMAIL_DOMAINS` | `checkIfEmailExistsConstants.gmailDomains` |
| `WHOIS_SERVERS` | `whoisServers` |

### How to Migrate

#### Step 1: Update Enum References

```typescript
// Before
import { EmailProvider, VerificationErrorCode, SMTPStep } from '@emailcheck/email-validator-js';

if (provider === EmailProvider.GMAIL) { /* ... */ }
if (error === VerificationErrorCode.INVALID_FORMAT) { /* ... */ }
const steps = [SMTPStep.GREETING, SMTPStep.EHLO, SMTPStep.MAIL_FROM];

// After
import { EmailProvider, VerificationErrorCode, SMTPStep } from '@emailcheck/email-validator-js';

if (provider === EmailProvider.gmail) { /* ... */ }
if (error === VerificationErrorCode.invalidFormat) { /* ... */ }
const steps = [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom];
```

#### Step 2: Update Constant References

```typescript
// Before
import { CHECK_IF_EMAIL_EXISTS_CONSTANTS } from '@emailcheck/email-validator-js';

const timeout = CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT;
const domains = CHECK_IF_EMAIL_EXISTS_CONSTANTS.GMAIL_DOMAINS;

// After
import { checkIfEmailExistsConstants } from '@emailcheck/email-validator-js';

const timeout = checkIfEmailExistsConstants.defaultTimeout;
const domains = checkIfEmailExistsConstants.gmailDomains;
```

#### Step 3: Update Switch Statements

```typescript
// Before
switch (provider) {
  case EmailProvider.YAHOO:
    // Handle Yahoo
    break;
  case EmailProvider.HOTMAIL_B2C:
    // Handle Hotmail
    break;
}

// After
switch (provider) {
  case EmailProvider.yahoo:
    // Handle Yahoo
    break;
  case EmailProvider.hotmailB2c:
    // Handle Hotmail
    break;
}
```

### Important Notes

1. **String values remain unchanged**: The underlying string values (e.g., `'gmail'`, `'INVALID_FORMAT'`) are preserved. Only the property names changed.

2. **Runtime compatibility**: If you're comparing enum values to strings from external sources, the string values still work:
   ```typescript
   // Still works in v3.x
   if (provider === 'gmail') { /* ... */ }
   ```

3. **TypeScript strict mode**: Ensure you update all references before compiling, or TypeScript will report errors.

4. **Test your code**: After updating, run your test suite to ensure all enum and constant references are updated correctly.

### Automatic Migration

If you're using an IDE with refactoring support (like VS Code), you can use find-and-replace:

1. Find all references to old enum values
2. Replace with new camelCase versions
3. Run TypeScript compiler to verify no errors

### Need Help?

- 📖 Check the [API Reference](#api-reference) for updated enum definitions
- 💬 [Open an issue](https://github.com/email-check-app/email-validator-js/issues) if you encounter problems
- 📧 Contact [support@email-check.app](mailto:support@email-check.app)

## API Reference

### Core Functions

#### `verifyEmail(params: IVerifyEmailParams): Promise<VerificationResult>`

Comprehensive email verification with detailed results and error codes.

**Parameters:**
- `emailAddress` (string, required): Email address to verify
- `timeout` (number): Timeout in milliseconds (default: 4000)
- `verifyMx` (boolean): Check MX records (default: true)
- `verifySmtp` (boolean): Verify SMTP connection (default: false)
- `smtpPort` (number): Custom SMTP port
- `debug` (boolean): Enable debug logging (default: false)
- `checkDisposable` (boolean): Check for disposable emails (default: true)
- `checkFree` (boolean): Check for free email providers (default: true)
- `retryAttempts` (number): Retry attempts for failures (default: 1)
- `detectName` (boolean): Detect names from email address (default: false)
- `nameDetectionMethod` (function): Custom name detection method
- `suggestDomain` (boolean): Enable domain typo suggestions (default: true)
- `domainSuggestionMethod` (function): Custom domain suggestion method
- `commonDomains` (string[]): Custom list of domains for suggestions
- `checkDomainAge` (boolean): Check domain age (default: false)
- `checkDomainRegistration` (boolean): Check domain registration status (default: false)
- `whoisTimeout` (number): WHOIS lookup timeout (default: 5000)
- `debug` (boolean): Enable debug logging including WHOIS lookups (default: false)
- `cache` (ICache): Optional custom cache instance

**Returns:**
```typescript
{
  email: string;
  validFormat: boolean;
  validMx: boolean | null;
  validSmtp: boolean | null;
  isDisposable: boolean;
  isFree: boolean;
  detectedName?: DetectedName | null;
  domainAge?: DomainAgeInfo | null;
  domainRegistration?: DomainRegistrationInfo | null;
  domainSuggestion?: DomainSuggestion | null;
  metadata?: {
    verificationTime: number;
    cached: boolean;
    error?: VerificationErrorCode;
  };
}
```

#### `verifyEmailBatch(params: IBatchVerifyParams): Promise<BatchVerificationResult>`

Verify multiple emails in parallel with concurrency control.

**Parameters:**
- `emailAddresses` (string[], required): Array of emails to verify
- `concurrency` (number): Parallel processing limit (default: 5)
- `detectName` (boolean): Detect names from email addresses
- `suggestDomain` (boolean): Enable domain typo suggestions
- Other parameters from `verifyEmail`

**Returns:**
```typescript
{
  results: Map<string, VerificationResult>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    errors: number;
    processingTime: number;
  };
}
```

### Name Detection Functions

#### `detectName(email: string): DetectedName | null`
Detect first and last name from email address.

```typescript
const name = detectName('john.doe@mydomain.com');
// Returns: { firstName: 'John', lastName: 'Doe', confidence: 0.9 }
```

**Detection Patterns:**
- Dot separator: `john.doe` → John Doe (90% confidence)
- Underscore: `jane_smith` → Jane Smith (80% confidence)
- Hyphen: `mary-johnson` → Mary Johnson (80% confidence)
- CamelCase: `johnDoe` → John Doe (70% confidence)
- **Composite names**: `mo1.test2` → Mo1 Test2 (60% confidence)
- **Mixed alphanumeric**: `user1.admin2` → User1 Admin2 (60% confidence)
- **Smart number handling**: `john.doe123` → John Doe (80% confidence)
- **Contextual suffixes**: `john.doe.dev` → John Doe (70% confidence)
- Single name: `alice` → Alice (50% confidence)

**Enhanced Features:**
- Removes email aliases (text after +)
- Smart handling of numbers (preserves in composite names, removes trailing)
- Recognizes contextual suffixes (dev, company, sales, years)
- Handles complex multi-part names
- Proper name capitalization
- Filters out common non-name prefixes (admin, support, info, etc.)

#### `detectNameFromEmail(params: IDetectNameParams): DetectedName | null`
Advanced name detection with custom method support.

```typescript
const customMethod = (email: string) => {
  // Your custom logic
  return { firstName: 'Custom', lastName: 'Name', confidence: 1.0 };
};

const name = detectNameFromEmail({
  email: 'user@mydomain.com',
  customMethod: customMethod
});
```

**Parameters:**
- `email` (string): Email address
- `customMethod` (function): Custom detection logic

#### `defaultNameDetectionMethod(email: string): DetectedName | null`
The default name detection implementation, exported for custom extensions.

#### Algorithm-Specific Name Cleaning

##### `cleanNameForAlgorithm(name: string): string`
Clean a name by removing special characters (dots, underscores, asterisks). Specifically designed for Algorithm name processing.

```typescript
import { cleanNameForAlgorithm } from '@emailcheck/email-validator-js';

const cleanedName = cleanNameForAlgorithm('john.doe_smith*');
// Returns: 'johndoesmith'

const cleanedName2 = cleanNameForAlgorithm('first_name.last');
// Returns: 'firstnamelast'
```

##### `detectNameForAlgorithm(email: string): DetectedName | null`
Enhanced name detection for Algorithm with aggressive cleaning. Removes dots, underscores, and asterisks from detected names.

```typescript
import { detectNameForAlgorithm } from '@emailcheck/email-validator-js';

const result = detectNameForAlgorithm('john.doe_smith@company.com');
// Returns: { firstName: 'John', lastName: 'Doesmith', confidence: 0.9025 }

// Compared to regular detection:
import { detectName } from '@emailcheck/email-validator-js';

const normalResult = detectName('john.doe_smith@company.com');
// Returns: { firstName: 'John', lastName: 'Doe_smith', confidence: 0.95 }
```

**Key Differences:**
- Removes all dots (.), underscores (_), and asterisks (*) from detected names
- Slightly reduces confidence (95% of original) due to cleaning process
- Ideal for systems requiring clean, sanitized names without special characters
- Normalizes multiple spaces to single spaces

### Domain Suggestion Functions

#### `suggestEmailDomain(email: string, commonDomains?: string[]): DomainSuggestion | null`
Detect and suggest corrections for misspelled email domains.

```typescript
const suggestion = suggestEmailDomain('user@gmial.com');
// Returns: { original: 'user@gmial.com', suggested: 'user@gmail.com', confidence: 0.95 }

// With custom domain list
const customDomains = ['company.com', 'enterprise.org'];
const customSuggestion = suggestEmailDomain('user@compny.com', customDomains);
```

**Features:**
- 70+ common email domains by default
- String similarity algorithm
- Known typo patterns (95% confidence)
- Smart thresholds based on domain length
- 24-hour caching for performance

#### `suggestDomain(params: ISuggestDomainParams): DomainSuggestion | null`
Advanced domain suggestion with custom method support.

```typescript
const suggestion = suggestDomain({
  domain: 'gmial.com',
  customMethod: myCustomMethod,
  commonDomains: ['company.com']
});
```

**Parameters:**
- `domain` (string): Domain to check
- `customMethod` (function): Custom suggestion logic
- `commonDomains` (string[]): Custom domain list

#### `defaultDomainSuggestionMethod(domain: string, commonDomains?: string[]): DomainSuggestion | null`
The default domain suggestion implementation, exported for custom extensions.

#### `isCommonDomain(domain: string, commonDomains?: string[]): boolean`
Check if a domain is in the common domains list.

```typescript
isCommonDomain('gmail.com'); // true
isCommonDomain('mycompany.com'); // false

// With custom list
isCommonDomain('mycompany.com', ['mycompany.com']); // true
```

#### `getDomainSimilarity(domain1: string, domain2: string): number`
Calculate similarity score between two domains (0-1).

```typescript
getDomainSimilarity('gmail.com', 'gmial.com'); // 0.8
getDomainSimilarity('gmail.com', 'yahoo.com'); // 0.3
```

### WHOIS Functions

> **Note:** WHOIS functions use PSL (Public Suffix List) validation to ensure domain validity before performing lookups. Invalid domains or domains without valid TLDs will return `null`.

#### `getDomainAge(domain: string, timeout?: number): Promise<DomainAgeInfo | null>`
Get domain age information via WHOIS lookup.

```typescript
const ageInfo = await getDomainAge('mydomain.com');
// Returns:
// {
//   domain: 'mydomain.com',
//   creationDate: Date,
//   ageInDays: 7890,
//   ageInYears: 21.6,
//   expirationDate: Date,
//   updatedDate: Date
// }

// Works with email addresses and URLs too
await getDomainAge('user@mydomain.com');
await getDomainAge('https://mydomain.com/path');
```

**Parameters:**
- `domain` (string): Domain, email, or URL to check
- `timeout` (number): Timeout in milliseconds (default: 5000)

**Returns:** `DomainAgeInfo` object or `null` if lookup fails

#### `getDomainRegistrationStatus(domain: string, timeout?: number): Promise<DomainRegistrationInfo | null>`
Get detailed domain registration status via WHOIS.

```typescript
const status = await getDomainRegistrationStatus('mydomain.com');
// Returns:
// {
//   domain: 'mydomain.com',
//   isRegistered: true,
//   isAvailable: false,
//   status: ['clientTransferProhibited'],
//   registrar: 'Example Registrar',
//   nameServers: ['ns1.mydomain.com', 'ns2.mydomain.com'],
//   expirationDate: Date,
//   isExpired: false,
//   daysUntilExpiration: 365,
//   isPendingDelete: false,
//   isLocked: true
// }
```

**Parameters:**
- `domain` (string): Domain, email, or URL to check
- `timeout` (number): Timeout in milliseconds (default: 5000)

**Returns:** `DomainRegistrationInfo` object or `null` if lookup fails

**Features:**
- Supports 50+ TLDs with specific WHOIS servers
- Automatic WHOIS server discovery for unknown TLDs
- Parses various WHOIS response formats
- Uses PSL (Public Suffix List) for domain validation
- 1-hour result caching
- Extracts domain from emails and URLs

### Utility Functions

#### `isDisposableEmail(emailOrDomain: string, cache?: ICache, options?: { skipMxCheck?: boolean; skipDomain?: boolean }): boolean`
Check if email uses a disposable provider.

```typescript
// Basic usage
isDisposableEmail('user@tempmail.com'); // true
isDisposableEmail('tempmail.com'); // true
isDisposableEmail('gmail.com'); // false

// With options
isDisposableEmail('user@tempmail.com', null, {
  skipMxCheck: true,     // Skip MX record validation
  skipDomain: true       // Skip domain validation
}); // true
```

#### `isFreeEmail(emailOrDomain: string, cache?: ICache, options?: { skipMxCheck?: boolean; skipDomain?: boolean }): boolean`
Check if email uses a free provider.

```typescript
// Basic usage
isFreeEmail('user@gmail.com'); // true
isFreeEmail('yahoo.com'); // true
isFreeEmail('corporate.com'); // false

// With options
isFreeEmail('user@gmail.com', null, {
  skipMxCheck: true,     // Skip MX record validation
  skipDomain: true       // Skip domain validation
}); // true
```

#### `isValidEmail(emailAddress: string): boolean`
Validate email format (RFC 5321 compliant).

```typescript
isValidEmail('user@mydomain.com'); // true
isValidEmail('invalid.email'); // false
```

**Validation Rules:**
- Proper @ symbol placement
- Local part max 64 characters
- Domain max 253 characters
- No consecutive dots
- No leading/trailing dots
- Valid domain TLD

#### `isValidEmailDomain(emailOrDomain: string): boolean`
Validate if a domain has a valid TLD.

```typescript
isValidEmailDomain('mydomain.com'); // true
isValidEmailDomain('example.invalid'); // false
```

#### Cache Management
```typescript
import { getDefaultCache, clearDefaultCache, resetDefaultCache } from '@emailcheck/email-validator-js';

// Get the default cache instance (singleton)
const defaultCache = getDefaultCache();

// Clear all entries from the default cache
clearDefaultCache();

// Reset to a fresh cache instance
resetDefaultCache();
```

### Types and Interfaces

#### `DetectedName`
```typescript
interface DetectedName {
  firstName?: string;
  lastName?: string;
  confidence: number; // 0-1 scale
}
```

#### `DomainSuggestion`
```typescript
interface DomainSuggestion {
  original: string;
  suggested: string;
  confidence: number; // 0-1 scale
}
```

#### `NameDetectionMethod`
```typescript
type NameDetectionMethod = (email: string) => DetectedName | null;
```

#### `DomainSuggestionMethod`
```typescript
type DomainSuggestionMethod = (domain: string) => DomainSuggestion | null;
```

#### `DomainAgeInfo`
```typescript
interface DomainAgeInfo {
  domain: string;
  creationDate: Date;
  ageInDays: number;
  ageInYears: number;
  expirationDate: Date | null;
  updatedDate: Date | null;
}
```

#### `DomainRegistrationInfo`
```typescript
interface DomainRegistrationInfo {
  domain: string;
  isRegistered: boolean;
  isAvailable: boolean;
  status: string[];
  registrar: string | null;
  nameServers: string[];
  expirationDate: Date | null;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  isPendingDelete?: boolean;
  isLocked?: boolean;
}
```

### Constants

#### `COMMON_EMAIL_DOMAINS`
Array of 70+ common email domains used for typo detection.

```typescript
import { COMMON_EMAIL_DOMAINS } from '@emailcheck/email-validator-js';

console.log(COMMON_EMAIL_DOMAINS);
// ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', ...]
```

**Includes:**
- Popular free providers (Gmail, Yahoo, Outlook, etc.)
- Business email services (Google Workspace, Microsoft, etc.)
- Privacy-focused providers (ProtonMail, Tutanota, etc.)
- Regional providers (GMX, Yandex, QQ, etc.)
- Hosting services (GoDaddy, Namecheap, etc.)

### Error Codes

```typescript
enum VerificationErrorCode {
  invalidFormat = 'INVALID_FORMAT',
  invalidDomain = 'INVALID_DOMAIN',
  noMxRecords = 'NO_MX_RECORDS',
  smtpConnectionFailed = 'SMTP_CONNECTION_FAILED',
  smtpTimeout = 'SMTP_TIMEOUT',
  mailboxNotFound = 'MAILBOX_NOT_FOUND',
  mailboxFull = 'MAILBOX_FULL',
  networkError = 'NETWORK_ERROR',
  disposableEmail = 'DISPOSABLE_EMAIL',
  freeEmailProvider = 'FREE_EMAIL_PROVIDER'
}
```

## Configuration Options

### `timeout`
Set a timeout in milliseconds for the smtp connection. Default: `4000`.

### `verifyMx`
Enable or disable domain checking. This is done in two steps:
1. Verify that the domain does indeed exist
2. Verify that the domain has valid MX records

Default: `false`.

### `verifySmtp`
Enable or disable mailbox checking. Only a few SMTP servers allow this, and even then whether it works depends on your IP's reputation with those servers. This library performs a best effort validation:
* It returns `null` for Yahoo addresses, for failed connections, for unknown SMTP errors
* It returns `true` for valid SMTP responses
* It returns `false` for SMTP errors specific to the address's formatting or mailbox existence

Default: `false`.

### `checkDisposable` (NEW)
Check if the email domain is a known disposable email provider. Default: `false`.

### `checkFree` (NEW)
Check if the email domain is a known free email provider. Default: `false`.

### `detailed` (NEW)
Return detailed verification results with error codes. Default: `false`.

### `retryAttempts` (NEW)
Number of retry attempts for transient failures. Default: `1`.

## Examples

### Basic Usage
```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

const result = await verifyEmail({
  emailAddress: 'foo@email.com',
  verifyMx: true,
  verifySmtp: true,
  timeout: 3000
});
console.log(result.validFormat);  // true
console.log(result.validMx);      // true
console.log(result.validSmtp);    // true
```

### Detailed Verification (NEW)
```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

const result = await verifyEmail({
  emailAddress: 'foo@email.com',
  verifyMx: true,
  verifySmtp: true,
  checkDisposable: true,
  checkFree: true
});
// result.validFormat: true
// result.validMx: true
// result.validSmtp: true
// result.isDisposable: false
// result.isFree: false
// result.metadata.verificationTime: 125
```

### Batch Verification (NEW)
```typescript
import { verifyEmailBatch } from '@emailcheck/email-validator-js';

const emails = ['user1@gmail.com', 'user2@mydomain.com', 'invalid@fake.com'];

const result = await verifyEmailBatch({
  emailAddresses: emails,
  concurrency: 5,
  verifyMx: true,
  checkDisposable: true,
  checkFree: true
});
// result.summary.valid: 2
// result.summary.invalid: 1
// result.summary.processingTime: 234
```

### Enhanced SMTP Verification (NEW)
```typescript
import { verifyMailboxSMTP } from '@emailcheck/email-validator-js';
import { getDefaultCache } from '@emailcheck/email-validator-js';

// Direct SMTP verification with enhanced features
const { result, port, cached, portCached } = await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    ports: [25, 587, 465], // Test multiple ports with TLS support
    timeout: 5000,
    cache: getDefaultCache(), // Smart caching for performance
    debug: false,
    tls: {
      rejectUnauthorized: false, // Lenient TLS for compatibility
      minVersion: 'TLSv1.2',
    },
    hostname: 'your-domain.com', // Custom EHLO hostname
    useVRFY: true, // Enable VRFY command as fallback
  },
});

// result: boolean - SMTP verification result
// port: number - The successful port used
// cached: boolean - If result was cached
// portCached: boolean - If port was cached from previous successful attempts
console.log(`SMTP result: ${result} via port ${port} (cached: ${cached || portCached})`);
```

### Advanced SMTP Configuration
```typescript
import { verifyMailboxSMTP, SMTPStep } from '@emailcheck/email-validator-js';

// Custom SMTP command sequence
const { result } = await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    sequence: {
      steps: [
        SMTPStep.greeting,
        SMTPStep.ehlo,    // Extended SMTP
        SMTPStep.startTls, // Upgrade to TLS
        SMTPStep.mailFrom,
        SMTPStep.rcptTo,
        SMTPStep.vrfy,    // Additional verification
      ],
      from: '<noreply@yourdomain.com>', // Custom MAIL FROM
    },
    ports: [587, 465], // Try STARTTLS first, then implicit TLS
    maxRetries: 2,
  },
});

// Port-specific optimization
const testPorts = async (email: string, mxHosts: string[]) => {
  const [local, domain] = email.split('@');

  const { result, port, portCached } = await verifyMailboxSMTP({
    local,
    domain,
    mxRecords: mxHosts,
    options: {
      cache: getDefaultCache(),
      // Port order matters: tests in sequence, stops at first success
      ports: [587, 465, 25], // STARTTLS -> SMTPS -> SMTP
    },
  });

  console.log(`Optimal port for ${domain}: ${port} (cached: ${portCached})`);
  return { result, port };
};
```

### Running Examples

All examples have been recently improved with:
- ✅ Consistent import styles and error handling
- ✅ Fixed async/await patterns
- ✅ Enhanced documentation and comments
- ✅ Renamed files for better clarity

**Development (Recommended):**
```bash
# Run examples with ts-node for full type checking
npx ts-node examples/smtp-usage.ts
npx ts-node examples/smtp-test.ts
npx ts-node examples/smtp-enhanced.ts
npx ts-node examples/smtp-comprehensive-tests.ts
npx ts-node examples/custom-cache-memory.ts
npx ts-node examples/smtp-sequences.ts
npx ts-node examples/algolia-integration.ts
```

**Direct TypeScript Execution (v2.14.0+):**
```bash
# After the next release (v2.14.0) with updated distribution exports:
yarn build
node --experimental-strip-types examples/smtp-usage.ts

# Requires Node.js 20.10+ or Node.js 21.0+ for --experimental-strip-types support
```

**For current development, use `npx ts-node` which imports directly from source files with full type checking.**

### Name Detection (ENHANCED)
```typescript
import { detectName, verifyEmail } from '@emailcheck/email-validator-js';

// Standalone name detection - now with composite name support
const name = detectName('john.doe@mydomain.com');
// name: { firstName: 'John', lastName: 'Doe', confidence: 0.9 }

// Handle alphanumeric composite names
const composite = detectName('mo1.test2@mydomain.com');
// composite: { firstName: 'Mo1', lastName: 'Test2', confidence: 0.6 }

// Smart handling of numbers and suffixes
const withNumbers = detectName('john.doe123@mydomain.com');
// withNumbers: { firstName: 'John', lastName: 'Doe', confidence: 0.8 }

const withSuffix = detectName('jane.smith.dev@mydomain.com');
// withSuffix: { firstName: 'Jane', lastName: 'Smith', confidence: 0.7 }

// Integrated with email verification
const result = await verifyEmail({
  emailAddress: 'jane_smith@mydomain.com',
  detectName: true
});
// result.detectedName: { firstName: 'Jane', lastName: 'Smith', confidence: 0.8 }

// Custom detection method
const customMethod = (email: string) => {
  // Your custom logic here
  return { firstName: 'Custom', lastName: 'Name', confidence: 1.0 };
};

const resultCustom = await verifyEmail({
  emailAddress: 'user@mydomain.com',
  detectName: true,
  nameDetectionMethod: customMethod
});
```

### Domain Typo Detection (NEW)
```typescript
import { suggestEmailDomain, verifyEmail } from '@emailcheck/email-validator-js';

// Standalone domain suggestion
const suggestion = suggestEmailDomain('user@gmial.com');
// suggestion: { original: 'user@gmial.com', suggested: 'user@gmail.com', confidence: 0.95 }

// Integrated with email verification (enabled by default in detailed mode)
const result = await verifyEmail({
  emailAddress: 'john@yaho.com',
  suggestDomain: true  // Default: true for detailed verification
});
// result.domainSuggestion: { original: 'john@yaho.com', suggested: 'john@yahoo.com', confidence: 0.9 }

// With custom domain list
const customDomains = ['company.com', 'enterprise.org'];
const resultCustom = await verifyEmail({
  emailAddress: 'user@compny.com',
  suggestDomain: true,
  commonDomains: customDomains
});
// resultCustom.domainSuggestion: { suggested: 'user@company.com', confidence: 0.85 }
```

### Handling Different Validation Scenarios

When a domain does not exist or has no MX records:
```typescript
const result = await verifyEmail({
  emailAddress: 'foo@bad-domain.com',
  verifyMx: true,
  verifySmtp: true
});
// result.validFormat: true (format is valid)
// result.validMx: false (no MX records)
// result.validSmtp: null (couldn't be performed)
```

### Using Detailed Verification for Better Insights

```typescript
const result = await verifyEmail({
  emailAddress: 'user@suspicious-domain.com',
  verifyMx: true,
  verifySmtp: true,
  checkDisposable: true,
  checkFree: true
});

if (!result.validFormat) {
  console.log('Invalid email format');
} else if (!result.validMx) {
  console.log('Invalid domain - no MX records');
} else if (result.isDisposable) {
  console.log('Disposable email detected');
} else if (result.metadata?.error) {
  switch (result.metadata.error) {
    case VerificationErrorCode.disposableEmail:
      console.log('Rejected: Disposable email');
      break;
    case VerificationErrorCode.noMxRecords:
      console.log('Rejected: Invalid domain');
      break;
    case VerificationErrorCode.mailboxNotFound:
      console.log('Rejected: Mailbox does not exist');
      break;
  }
}
```

### Batch Processing for Large Lists

```typescript
const emails = [
  'valid@gmail.com',
  'test@tempmail.com',
  'user@company.com',
  // ... hundreds more
];

const batch = await verifyEmailBatch({
  emailAddresses: emails,
  concurrency: 10, // Process 10 emails simultaneously
  verifyMx: true,
  checkDisposable: true,
  detailed: true
});

console.log(`Processed ${batch.summary.total} emails`);
console.log(`Valid: ${batch.summary.valid}`);
console.log(`Invalid: ${batch.summary.invalid}`);
console.log(`Time: ${batch.summary.processingTime}ms`);

// Filter out invalid emails
const validEmails = [];
for (const [email, result] of batch.results) {
  if (result.validFormat) {
    validEmails.push(email);
  }
}
```

### Performance Optimization with Caching

```typescript
// First verification - hits DNS and SMTP
const first = await verifyEmail({
  emailAddress: 'cached@mydomain.com',
  verifyMx: true
});
// Takes ~500ms

// Second verification - uses cache
const second = await verifyEmail({
  emailAddress: 'cached@mydomain.com',
  verifyMx: true
});
// Takes ~1ms (cached)

// Clear cache if needed
clearAllCaches();
```

## 🚀 Custom Cache Injection

The library supports parameter-based cache injection, allowing you to use custom cache backends like Redis, Memcached, or any LRU-compatible cache implementation.

### 📦 Performance & Caching

The library includes a built-in LRU cache for all operations. By default, it uses a lazy-loaded singleton cache instance.

#### Default Cache Usage
```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

// No cache setup needed - uses default LRU cache automatically
const result = await verifyEmail({
  emailAddress: 'user@example.com',
  verifyMx: true,
  verifySmtp: true
});

// Subsequent calls with the same email will use cached results
const result2 = await verifyEmail({
  emailAddress: 'user@example.com',
  verifyMx: true,
  verifySmtp: true
});
```

#### Custom Cache Implementation

Create your own cache by implementing the `ICache` interface:

```typescript
import { verifyEmail, type ICache, ICacheStore, DEFAULT_CACHE_OPTIONS } from '@emailcheck/email-validator-js';
import { LRUAdapter } from '@emailcheck/email-validator-js';

// Create custom cache with LRU adapters
const customCache: ICache = {
  mx: new LRUAdapter<string[]>(DEFAULT_CACHE_OPTIONS.maxSize.mx, DEFAULT_CACHE_OPTIONS.ttl.mx),
  disposable: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.disposable, DEFAULT_CACHE_OPTIONS.ttl.disposable),
  free: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.free, DEFAULT_CACHE_OPTIONS.ttl.free),
  domainValid: new LRUAdapter<boolean>(DEFAULT_CACHE_OPTIONS.maxSize.domainValid, DEFAULT_CACHE_OPTIONS.ttl.domainValid),
  smtp: new LRUAdapter<boolean | null>(DEFAULT_CACHE_OPTIONS.maxSize.smtp, DEFAULT_CACHE_OPTIONS.ttl.smtp),
  domainSuggestion: new LRUAdapter<{ suggested: string; confidence: number } | null>(
    DEFAULT_CACHE_OPTIONS.maxSize.domainSuggestion,
    DEFAULT_CACHE_OPTIONS.ttl.domainSuggestion
  ),
  whois: new LRUAdapter<any>(DEFAULT_CACHE_OPTIONS.maxSize.whois, DEFAULT_CACHE_OPTIONS.ttl.whois),
};

// Use with email verification
const result = await verifyEmail({
  emailAddress: 'user@mydomain.com',
  verifyMx: true,
  verifySmtp: true,
  cache: customCache  // Pass the cache instance
});
```

#### Redis Cache Implementation

```typescript
import { verifyEmail, type ICache, ICacheStore } from '@emailcheck/email-validator-js';
import { RedisAdapter } from '@emailcheck/email-validator-js';
import Redis from 'ioredis';

// Create Redis client
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// Create Redis cache
const redisCache: ICache = {
  mx: new RedisAdapter(redis, {
    keyPrefix: 'email:mx:',
    ttl: 1800000, // 30 minutes
  }),
  disposable: new RedisAdapter(redis, {
    keyPrefix: 'email:disposable:',
    ttl: 86400000, // 24 hours
  }),
  free: new RedisAdapter(redis, {
    keyPrefix: 'email:free:',
    ttl: 86400000, // 24 hours
  }),
  domainValid: new RedisAdapter(redis, {
    keyPrefix: 'email:domain:',
    ttl: 86400000, // 24 hours
  }),
  smtp: new RedisAdapter(redis, {
    keyPrefix: 'email:smtp:',
    ttl: 1800000, // 30 minutes
  }),
  domainSuggestion: new RedisAdapter(redis, {
    keyPrefix: 'email:suggest:',
    ttl: 86400000, // 24 hours
  }),
  whois: new RedisAdapter(redis, {
    keyPrefix: 'email:whois:',
    ttl: 3600000, // 1 hour
  }),
};

// Use with batch verification
import { verifyEmailBatch } from '@emailcheck/email-validator-js';

const batchResult = await verifyEmailBatch({
  emailAddresses: ['user1@mydomain.com', 'user2@mydomain.com'],
  verifyMx: true,
  verifySmtp: true,
  cache: redisCache,
  concurrency: 10
});
```

#### Custom Cache Store Implementation

Create your own cache adapter by implementing the `ICacheStore` interface:

```typescript
import { verifyEmail, type ICacheStore } from '@emailcheck/email-validator-js';

class MyCustomCache<T> implements ICacheStore<T> {
  private store = new Map<string, { value: T; expiry: number }>();

  async get(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiry = Date.now() + (ttlMs || 3600000);
    this.store.set(key, { value, expiry });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const item = this.store.get(key);
    if (!item) return false;

    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Use custom cache store
const customCache = {
  mx: new MyCustomCache<string[]>(),
  disposable: new MyCustomCache<boolean>(),
  free: new MyCustomCache<boolean>(),
  domainValid: new MyCustomCache<boolean>(),
  smtp: new MyCustomCache<boolean | null>(),
  domainSuggestion: new MyCustomCache<{ suggested: string; confidence: number } | null>(),
  whois: new MyCustomCache<any>(),
};

const result = await verifyEmail({
  emailAddress: 'user@example.com',
  cache: customCache
});
```

### Cache Options

Default cache TTL and size settings:

```typescript
import { DEFAULT_CACHE_OPTIONS } from '@emailcheck/email-validator-js';

// TTL (Time To Live) in milliseconds
DEFAULT_CACHE_OPTIONS.ttl = {
  mx: 3600000,              // 1 hour
  disposable: 86400000,      // 24 hours
  free: 86400000,           // 24 hours
  domainValid: 86400000,    // 24 hours
  smtp: 1800000,            // 30 minutes
  domainSuggestion: 86400000, // 24 hours
  whois: 3600000,           // 1 hour
};

// Maximum number of entries per cache type
DEFAULT_CACHE_OPTIONS.maxSize = {
  mx: 500,
  disposable: 1000,
  free: 1000,
  domainValid: 1000,
  smtp: 500,
  domainSuggestion: 1000,
  whois: 200,
};
```
## 🌐 Serverless Deployment

The package includes serverless adapters for major cloud platforms. The serverless implementation provides email validation without Node.js dependencies, making it suitable for edge computing environments.

### AWS Lambda

```javascript
import { apiGatewayHandler } from '@emailcheck/email-validator-js/serverless/aws';

export const handler = apiGatewayHandler;
```

### Vercel Edge Functions

```javascript
import { edgeHandler } from '@emailcheck/email-validator-js/serverless/vercel';

export const config = {
  runtime: 'edge',
};

export default edgeHandler;
```

### Cloudflare Workers

```javascript
import { workerHandler } from '@emailcheck/email-validator-js/serverless/cloudflare';

export default {
  async fetch(request, env, ctx) {
    return workerHandler(request, env, ctx);
  },
};
```

### Features in Serverless Mode

- ✅ Syntax validation
- ✅ Typo detection and domain suggestions
- ✅ Disposable email detection (full database)
- ✅ Free email provider detection (full database)
- ✅ Batch processing
- ✅ Built-in caching
- ❌ MX record validation (requires DNS)
- ❌ SMTP verification (requires TCP sockets)

For detailed serverless documentation and more platform examples, see [docs/SERVERLESS.md](SERVERLESS.md).

## 📊 Performance & Caching

The library includes intelligent caching to improve performance:

| Cache Type | TTL | Description |
|------------|-----|-------------|
| MX Records | 1 hour | DNS MX record lookups |
| Disposable | 24 hours | Disposable email checks |
| Free Provider | 24 hours | Free email provider checks |
| Domain Valid | 24 hours | Domain validation results |
| SMTP | 30 minutes | SMTP verification results |
| Domain Suggestions | 24 hours | Domain typo suggestions |

### Performance Tips

1. **Use Batch Processing**: For multiple emails, use `verifyEmailBatch()` for parallel processing
2. **Enable Caching**: Caching is automatic and reduces repeated lookups by ~90%
3. **Adjust Timeouts**: Lower timeouts for faster responses, higher for accuracy
4. **Skip SMTP**: If you only need format/MX validation, skip SMTP for 10x faster results
5. **Domain Suggestions**: Cached for 24 hours to avoid recalculating similarity scores
6. **Name Detection**: Lightweight operation with minimal performance impact

## 🗂️ Email Provider Databases

### Disposable Email Providers (✅ Always Updated)
[View List](./src/disposable-email-providers.json) - 5,000+ disposable email domains

### Free Email Providers (✅ Always Updated)  
[View List](./src/free-email-providers.json) - 1,000+ free email providers

### Common Email Domains (✅ NEW)
Access the list of 70+ common email domains used for typo detection:

```typescript
import { COMMON_EMAIL_DOMAINS } from '@emailcheck/email-validator-js';

console.log(COMMON_EMAIL_DOMAINS);
// ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', ...]

// Use with your own domain validation
const isCommon = COMMON_EMAIL_DOMAINS.includes('gmail.com'); // true
```

## Testing

Run the test suite:
```bash
yarn test
```

Run with coverage:
```bash
yarn test --coverage
```

Lint the code:
```bash
yarn lint
yarn lint-fix  # Auto-fix issues
```

Build the project:
```bash
yarn build
```

## Code Quality & Maintenance

### Quality Assurance
- ✅ **TypeScript Strict Mode**: Full type safety with comprehensive type checking
- ✅ **ESLint + Biome**: Automated code quality and formatting
- ✅ **Jest Test Suite**: Comprehensive test coverage with 600+ test cases
- ✅ **CI/CD Pipeline**: Automated testing and linting on all PRs
- ✅ **All Tests Pass**: 615 tests passing, 1 skipped

### Recent Code Improvements (v3.x)
- **Naming Convention Migration**: All enum values and constants now use `camelCase` for consistency with TypeScript/JavaScript conventions
- **Async Code Fixes**: Replaced `forEach` with `for...of` loops for proper async handling
- **Import Standardization**: Consistent ES6 imports across all files
- **Mock Improvements**: Enhanced Jest spy usage with proper cleanup
- **Error Handling**: Added null checks and better error boundaries
- **File Organization**: Split long test files and renamed for clarity
- **Type Safety**: Fixed enum usage and property naming consistency
- **Documentation Updates**: Comprehensive README with migration guide and updated examples

### Breaking Changes in v3.x
- **Enum camelCase Migration**: `EmailProvider.GMAIL` → `EmailProvider.gmail`
- **Error Code camelCase Migration**: `VerificationErrorCode.INVALID_FORMAT` → `VerificationErrorCode.invalidFormat`
- **SMTP Step camelCase Migration**: `SMTPStep.GREETING` → `SMTPStep.greeting`
- **Constants camelCase Migration**: `CHECK_IF_EMAIL_EXISTS_CONSTANTS.DEFAULT_TIMEOUT` → `checkIfEmailExistsConstants.defaultTimeout`

### Project Structure
```
email-validator-js/
├── src/                 # Source code
│   ├── index.ts        # Main entry point
│   ├── smtp.ts         # SMTP verification
│   ├── dns.ts          # DNS/MX lookups
│   ├── validator.ts    # Format validation
│   ├── cache.ts        # Caching system
│   ├── batch.ts        # Batch processing
│   └── types.ts        # TypeScript types
├── __tests__/          # Test files (200+ tests)
├── examples/           # Usage examples (20+ files)
└── dist/              # Compiled output
```

### Scripts
```bash
yarn build      # Build TypeScript with Rollup
yarn test       # Run tests with Jest
yarn lint       # Run Biome linting
yarn lint-fix   # Auto-fix linting issues
yarn typecheck  # Run TypeScript type checking
```

### Build Optimizations
- **Type Safety**: Improved type inference reduces redundant type declarations
- **Bundle Size**: Optimized with tree-shaking and minification
- **Performance**: Faster builds with parallelized compilation
- **Code Quality**: Strict TypeScript mode with comprehensive type checking

## Contributing

We welcome contributions! Please feel free to open an issue or create a pull request and fix bugs or add features. All contributions are welcome!

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
# Clone the repo
git clone https://github.com/email-check-app/email-validator-js.git
cd email-validator-js

# Install dependencies
yarn install

# Run tests
yarn test

# Build
yarn build
```

## Support

For issues, questions, or commercial licensing:

🐛 [Open an Issue](https://github.com/email-check-app/email-validator-js/issues)
📧 [Email Support](mailto:support@email-check.app)
📄 [Commercial License](https://email-check.app/license/email-validator)
🌐 [Visit email-check.app](https://email-check.app)

## LICENSE
Business Source License 1.1 - see [LICENSE](LICENSE.md) file for details.

### 📝 When Do You Need a Commercial License?

The BSL allows use only for non-production purposes. Here's a comprehensive guide to help you understand when you need a commercial license:

| Use Case | Commercial License Required? | Details |
|----------|-----------|---------|
| **Personal & Learning** | | |
| 🔬 Exploring email-validator-js for research or learning | ✅ **No** | Use freely for educational purposes |
| 🎨 Personal hobby projects (non-commercial) | ✅ **No** | Build personal tools and experiments |
| 🧪 Testing and evaluation in development environment | ✅ **No** | Test all features before purchasing |
| **Development & Prototyping** | | |
| 💡 Building proof-of-concept applications | ✅ **No** | Create demos and prototypes |
| 🛠️ Internal tools (not customer-facing) | ✅ **No** | Use for internal development tools |
| 📚 Open source projects (non-commercial) | ✅ **No** | Contribute to the community |
| **Commercial & Production Use** | | |
| 💰 Revenue-generating applications | ❌ **Yes** | Any app that generates income |
| ☁️ Software as a Service (SaaS) products | ❌ **Yes** | Cloud-based service offerings |
| 📦 Distributed commercial software | ❌ **Yes** | Software sold to customers |
| 🏢 Enterprise production systems | ❌ **Yes** | Business-critical applications |
| 🔄 Forking for commercial purposes | ❌ **Yes** | Creating derivative commercial products |
| 🏭 Production use in any form | ❌ **Yes** | Live systems serving real users |
| **Specific Scenarios** | | |
| 🎓 Student projects and coursework | ✅ **No** | Academic use is encouraged |
| 🏗️ CI/CD pipelines (for commercial products) | ❌ **Yes** | Part of commercial development |
| 📧 Email validation in production APIs | ❌ **Yes** | Production service usage |
| 🛒 E-commerce checkout validation | ❌ **Yes** | Revenue-related validation |
| 📱 Mobile apps (free with ads or paid) | ❌ **Yes** | Monetized applications |

### 💡 Quick Decision Guide

Ask yourself these questions:
1. **Will real users interact with this in production?** → You need a license
2. **Will this help generate revenue?** → You need a license  
3. **Is this for learning or testing only?** → No license needed
4. **Is this an internal prototype or POC?** → No license needed

### 🎯 Why Choose Our Commercial License?

✨ **Unlimited Usage** - Use in all your production applications  
🚀 **Priority Support** - Direct support from our engineering team  
🔄 **Regular Updates** - Get the latest features and improvements  
🛡️ **Legal Protection** - Full commercial rights and warranty  
🏢 **Enterprise Ready** - Suitable for large-scale deployments

### 📄 Get Your Commercial License

Ready to use email-validator-js in production?

🛍️ **[Purchase a License](https://email-check.app/license/email-validator)** - Simple pricing, instant activation  
📧 **[Contact Sales](mailto:sales@email-check.app?subject=Interested%20in%20email-validator-js%20commercial%20license)** - For enterprise or custom needs  
