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
import { isEmailExistsCore } from '@emailcheck/email-validator-js';

// Basic usage
const result = await isEmailExistsCore({
  emailAddress: 'user@mydomain.com',
  verifyMx: true,
  verifySmtp: true,
  timeout: 5000
});

console.log(result.isReachable);  // 'safe' | 'invalid' | 'risky' | 'unknown'
console.log(result.syntax.isValid);  // true
console.log(result.misc?.providerType);  // 'gmail' | 'yahoo' | etc.
console.log(result.smtp?.isDeliverable);  // true or false
```

### Using the Legacy API

```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

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

## API Reference

### Core Functions (New API - Recommended)

#### `isEmailExistsCore(params: IIsEmailExistsCoreParams): Promise<IsEmailExistsCoreResult>`

Comprehensive email verification with detailed results based on the Rust `check-if-email-exists` implementation.

**Parameters:**
- `emailAddress` (string, required): Email address to verify
- `timeout` (number): Timeout in milliseconds (default: 5000)
- `verifyMx` (boolean): Check MX records (default: true)
- `verifySmtp` (boolean): Verify SMTP connection (default: false)
- `checkDisposable` (boolean): Check for disposable emails (default: true)
- `checkFree` (boolean): Check for free email providers (default: true)
- `debug` (boolean): Enable debug logging (default: false)
- `cache` (ICache): Optional custom cache instance
- `smtpTimeout` (number): SMTP-specific timeout
- `fromEmail` (string): Email address to use in MAIL FROM command
- `helloName` (string): Hostname to use in EHLO/HELO command
- `smtpOptions` (IsEmailExistsSmtpOptions): Advanced SMTP options
- `enableProviderOptimizations` (boolean): Enable provider-specific optimizations
- `useYahooApi` (boolean): Use Yahoo API for verification
- `useYahooHeadless` (boolean): Use Yahoo headless browser verification
- `yahooApiOptions` (YahooApiOptions): Yahoo API configuration
- `useHeadless` (boolean): Use headless browser verification
- `headlessOptions` (HeadlessOptions): Headless browser configuration

**Returns:**
```typescript
{
  email: string;
  isReachable: 'safe' | 'invalid' | 'risky' | 'unknown';
  syntax: {
    isValid: boolean;
    domain?: string;
    localPart?: string;
    error?: string;
  };
  mx: {
    success: boolean;
    records: Array<{ exchange: string; priority: number }>;
    lowestPriority?: { exchange: string; priority: number };
    error?: string;
  } | null;
  smtp: {
    canConnectSmtp: boolean;
    hasFullInbox: boolean;
    isCatchAll: boolean;
    isDeliverable: boolean;
    isDisabled: boolean;
    error?: string;
    providerUsed?: EmailProvider;
  } | null;
  misc: {
    isDisposable: boolean;
    isFree: boolean;
    providerType: EmailProvider;
  } | null;
  duration: number;
  error?: string;
}
```

**Example:**
```typescript
import { isEmailExistsCore } from '@emailcheck/email-validator-js';

const result = await isEmailExistsCore({
  emailAddress: 'user@gmail.com',
  verifyMx: true,
  verifySmtp: true,
  checkDisposable: true,
  checkFree: true,
  enableProviderOptimizations: true,
});

if (result.isReachable === 'safe') {
  console.log('Email is safe to send to');
} else if (result.isReachable === 'invalid') {
  console.log('Email is invalid');
} else if (result.isReachable === 'risky') {
  console.log('Email is risky (catch-all or disabled)');
}
```

### Legacy API

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

### is-email-exists Functions

These functions are ported from the Rust `check-if-email-exists` library and provide low-level email verification capabilities.

#### `validateEmailSyntax(email: string): EmailSyntaxResult`

Validate email address syntax (RFC 5321 compliant).

```typescript
const result = validateEmailSyntax('user@example.com');
// Returns: { isValid: true, email: 'user@example.com', localPart: 'user', domain: 'example.com' }

const invalid = validateEmailSyntax('invalid-email');
// Returns: { isValid: false, error: 'Invalid email format' }
```

#### `queryMxRecords(domain: string, options?: { timeout?: number; cache?: ICache }): Promise<MxLookupResult>`

Query MX records for a domain with caching support.

```typescript
const result = await queryMxRecords('gmail.com');
// Returns:
// {
//   success: true,
//   records: [
//     { exchange: 'gmail-smtp-in.l.google.com.', priority: 5 },
//     { exchange: 'alt1.gmail-smtp-in.l.google.com.', priority: 10 },
//   ],
//   lowestPriority: { exchange: 'gmail-smtp-in.l.google.com.', priority: 5 }
// }
```

#### `verifySmtpConnection(email: string, domain: string, mxHost: string, options?: IsEmailExistsSmtpOptions, provider?: EmailProvider): Promise<SmtpVerificationResult>`

Verify SMTP connection for an email address.

```typescript
const result = await verifySmtpConnection(
  'user@gmail.com',
  'gmail.com',
  'gmail-smtp-in.l.google.com.',
  { timeout: 5000, fromEmail: 'test@example.com', helloName: 'example.com' },
  EmailProvider.GMAIL
);
// Returns:
// {
//   canConnectSmtp: true,
//   hasFullInbox: false,
//   isCatchAll: false,
//   isDeliverable: true,
//   isDisabled: false,
//   providerUsed: 'gmail'
// }
```

#### `getProviderType(domain: string): EmailProvider`

Detect the email provider type from a domain.

```typescript
const provider = getProviderType('gmail.com'); // EmailProvider.GMAIL
const provider2 = getProviderType('yahoo.com'); // EmailProvider.YAHOO
const provider3 = getProviderType('outlook.com'); // EmailProvider.HOTMAIL_B2C
const provider4 = getProviderType('unknown.com'); // EmailProvider.EVERYTHING_ELSE
```

#### `getProviderFromMxHost(mxHost: string): EmailProvider`

Detect the email provider type from an MX record hostname.

```typescript
const provider = getProviderFromMxHost('gmail-smtp-in.l.google.com.'); // EmailProvider.GMAIL
const provider2 = getProviderFromMxHost('mta7.am0.yahoodns.net.'); // EmailProvider.YAHOO
```

#### Provider Detection Helper Functions

```typescript
import { isGmail, isYahoo, isHotmailB2C, isHotmailB2B, isProofpoint, isMimecast } from '@emailcheck/email-validator-js';

isGmail('gmail-smtp-in.l.google.com.'); // true
isYahoo('mta7.am0.yahoodns.net.'); // true
isHotmailB2C('hotmail-com.olc.protection.outlook.com.'); // true
isHotmailB2B('mail.protection.outlook.com.'); // true
isProofpoint('mail.pphosted.com.'); // true
isMimecast('smtp.mimecast.com.'); // true
```

#### Constants

```typescript
import { isEmailExistConstants } from '@emailcheck/email-validator-js';

console.log(isEmailExistConstants.gmailDomains);
// ['gmail.com', 'googlemail.com']

console.log(isEmailExistConstants.yahooDomains);
// ['yahoo.com', 'ymail.com', 'rocketmail.com']

console.log(isEmailExistConstants.hotmailDomains);
// ['hotmail.com', 'outlook.com', 'live.com', 'msn.com']

console.log(isEmailExistConstants.defaultTimeout);
// 5000

console.log(isEmailExistConstants.defaultSmtpPort);
// 25

console.log(isEmailExistConstants.defaultFromEmail);
// 'test@example.com'

console.log(isEmailExistConstants.defaultHelloName);
// 'example.com'
```

#### SmtpErrorParser

Parse SMTP error messages with provider-specific context.

```typescript
import { SmtpErrorParser } from '@emailcheck/email-validator-js';

const parsed = SmtpErrorParser.parseError(
  '550 5.2.1 The email account that you tried to reach is disabled.',
  EmailProvider.GMAIL,
  550
);
// Returns:
// {
//   type: 'disabled',
//   severity: 'permanent',
//   message: 'Account disabled',
//   originalMessage: '550 5.2.1 The email account that you tried to reach is disabled.',
//   providerSpecific: { code: 'DISABLED', action: 'Account is disabled' }
// }
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

#### Algrothin-Specific Name Cleaning

##### `cleanNameForAlgrothin(name: string): string`
Clean a name by removing special characters (dots, underscores, asterisks). Specifically designed for Algrothin name processing.

```typescript
import { cleanNameForAlgrothin } from '@emailcheck/email-validator-js';

const cleanedName = cleanNameForAlgrothin('john.doe_smith*');
// Returns: 'johndoesmith'

const cleanedName2 = cleanNameForAlgrothin('first_name.last');
// Returns: 'firstnamelast'
```

##### `detectNameForAlgrothin(email: string): DetectedName | null`
Enhanced name detection for Algrothin with aggressive cleaning. Removes dots, underscores, and asterisks from detected names.

```typescript
import { detectNameForAlgrothin } from '@emailcheck/email-validator-js';

const result = detectNameForAlgrothin('john.doe_smith@company.com');
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

#### `isDisposableEmail(params: IDisposableEmailParams): Promise<boolean>`
Check if email uses a disposable provider.

```typescript
// Basic usage
const result = await isDisposableEmail({
  emailOrDomain: 'user@tempmail.com'
}); // true

// Check domain directly
await isDisposableEmail({
  emailOrDomain: 'tempmail.com'
}); // true

await isDisposableEmail({
  emailOrDomain: 'gmail.com'
}); // false

// With cache and logger
await isDisposableEmail({
  emailOrDomain: 'user@tempmail.com',
  cache: myCache,
  logger: (message) => console.log(message)
});
```

#### `isFreeEmail(params: IFreeEmailParams): Promise<boolean>`
Check if email uses a free provider.

```typescript
// Basic usage
const result = await isFreeEmail({
  emailOrDomain: 'user@gmail.com'
}); // true

// Check domain directly
await isFreeEmail({
  emailOrDomain: 'yahoo.com'
}); // true

await isFreeEmail({
  emailOrDomain: 'corporate.com'
}); // false

// With cache and logger
await isFreeEmail({
  emailOrDomain: 'user@gmail.com',
  cache: myCache,
  logger: (message) => console.log(message)
});
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

#### `EmailProvider` (enum)

Email provider types for provider-specific optimizations.

```typescript
enum EmailProvider {
  GMAIL = 'gmail',
  HOTMAIL_B2B = 'hotmail_b2b',      // Microsoft 365 business
  HOTMAIL_B2C = 'hotmail_b2c',      // Microsoft consumer (Outlook, Hotmail)
  PROOFPOINT = 'proofpoint',        // Proofpoint enterprise security
  MIMECAST = 'mimecast',            // Mimecast enterprise security
  YAHOO = 'yahoo',
  EVERYTHING_ELSE = 'everything_else'
}
```

#### `IsEmailExistsCoreResult`

Result type from `isEmailExistsCore` verification.

```typescript
interface IsEmailExistsCoreResult {
  email: string;
  isReachable: 'safe' | 'invalid' | 'risky' | 'unknown';
  syntax: {
    isValid: boolean;
    domain?: string;
    localPart?: string;
    error?: string;
  };
  mx: {
    success: boolean;
    records: Array<{ exchange: string; priority: number }>;
    lowestPriority?: { exchange: string; priority: number };
    error?: string;
  } | null;
  smtp: {
    canConnectSmtp: boolean;
    hasFullInbox: boolean;
    isCatchAll: boolean;
    isDeliverable: boolean;
    isDisabled: boolean;
    error?: string;
    providerUsed?: EmailProvider;
  } | null;
  misc: {
    isDisposable: boolean;
    isFree: boolean;
    providerType: EmailProvider;
  } | null;
  duration: number;
  error?: string;
}
```

#### `SmtpVerificationResult`

Result type from SMTP verification.

```typescript
interface SmtpVerificationResult {
  canConnectSmtp: boolean;
  hasFullInbox: boolean;
  isCatchAll: boolean;
  isDeliverable: boolean;
  isDisabled: boolean;
  error?: string;
  providerUsed?: EmailProvider;
}
```

#### `MxLookupResult`

Result type from MX record lookup.

```typescript
interface MxLookupResult {
  success: boolean;
  records: Array<{ exchange: string; priority: number }>;
  lowestPriority?: { exchange: string; priority: number };
  error?: string;
  code?: string;
}
```

#### `EmailSyntaxResult`

Result type from email syntax validation.

```typescript
interface EmailSyntaxResult {
  isValid: boolean;
  email?: string;
  localPart?: string;
  domain?: string;
  error?: string;
}
```

#### `IIsEmailExistsCoreParams`

Parameters for `isEmailExistsCore` function.

```typescript
interface IIsEmailExistsCoreParams {
  emailAddress: string;
  timeout?: number;
  verifyMx?: boolean;
  verifySmtp?: boolean;
  debug?: boolean;
  checkDisposable?: boolean;
  checkFree?: boolean;
  cache?: ICache | null;
  smtpTimeout?: number;
  fromEmail?: string;
  helloName?: string;
  smtpOptions?: IsEmailExistsSmtpOptions;
  enableProviderOptimizations?: boolean;
  useYahooApi?: boolean;
  useYahooHeadless?: boolean;
  yahooApiOptions?: YahooApiOptions;
  useHeadless?: boolean;
  headlessOptions?: HeadlessOptions;
}
```

#### `IsEmailExistsSmtpOptions`

Options for SMTP connection.

```typescript
interface IsEmailExistsSmtpOptions {
  timeout?: number;
  port?: number;
  retries?: number;
  fromEmail?: string;
  helloName?: string;
  useStartTls?: boolean;
  useSsl?: boolean;
  hostName?: string;
  rejectUnauthorized?: boolean;
}
```

#### `YahooApiOptions`

Options for Yahoo API verification.

```typescript
interface YahooApiOptions {
  timeout?: number;
  userAgent?: string;
  retryAttempts?: number;
  proxyUrl?: string;
  headers?: Record<string, string>;
  apiUrl?: string;
}
```

#### `HeadlessOptions`

Options for headless browser verification.

```typescript
interface HeadlessOptions {
  webdriverEndpoint?: string;
  timeout?: number;
  retryAttempts?: number;
  screenshot?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  acceptInsecureCerts?: boolean;
}
```

#### `IDisposableEmailParams`

Parameters for `isDisposableEmail` function.

```typescript
interface IDisposableEmailParams {
  emailOrDomain: string;
  cache?: ICache;
  logger?: (message: string) => void;
}
```

#### `IFreeEmailParams`

Parameters for `isFreeEmail` function.

```typescript
interface IFreeEmailParams {
  emailOrDomain: string;
  cache?: ICache;
  logger?: (message: string) => void;
}
```

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
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_DOMAIN = 'INVALID_DOMAIN',
  NO_MX_RECORDS = 'NO_MX_RECORDS',
  SMTP_CONNECTION_FAILED = 'SMTP_CONNECTION_FAILED',
  SMTP_TIMEOUT = 'SMTP_TIMEOUT',
  MAILBOX_NOT_FOUND = 'MAILBOX_NOT_FOUND',
  MAILBOX_FULL = 'MAILBOX_FULL',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DISPOSABLE_EMAIL = 'DISPOSABLE_EMAIL',
  FREE_EMAIL_PROVIDER = 'FREE_EMAIL_PROVIDER'
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
        SMTPStep.GREETING,
        SMTPStep.EHLO,    // Extended SMTP
        SMTPStep.STARTTLS, // Upgrade to TLS
        SMTPStep.MAIL_FROM,
        SMTPStep.RCPT_TO,
        SMTPStep.VRFY,    // Additional verification
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

**Development (Recommended):**
```bash
# Run examples with ts-node for full type checking
npx ts-node examples/smtp-usage.ts
npx ts-node examples/smtp-test.ts
npx ts-node examples/smtp-enhanced.ts
npx ts-node examples/smtp-comprehensive-tests.ts
npx ts-node examples/custom-cache-memory.ts
npx ts-node examples/smtp-sequences.ts
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
    case VerificationErrorCode.DISPOSABLE_EMAIL:
      console.log('Rejected: Disposable email');
      break;
    case VerificationErrorCode.NO_MX_RECORDS:
      console.log('Rejected: Invalid domain');
      break;
    case VerificationErrorCode.MAILBOX_NOT_FOUND:
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

## Development

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
├── __tests__/          # Test files
├── examples/           # Usage examples
└── dist/              # Compiled output
```

### Scripts
```bash
yarn build      # Build TypeScript with Rollup
yarn test       # Run tests with Jest
yarn lint       # Run ESLint
yarn lint-fix   # Fix ESLint issues
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
