# Change Log

## v5.0.0 - 2026-05-02

### 🎯 SMTP probe: full control surface, clearer names, RFC-correct dialogue

The v4 refactor shipped multi-MX iteration, the catch-all dual-probe,
PIPELINING, enhanced-status surfacing, and operational metrics — all
hard-coded with no caller-side knobs. v5 adds the missing control
surface (deadline / retry / max-failures / max-MX), restores STARTTLS
upgrade (which v4 dropped on a wrong assumption), normalizes the
reason vocabulary, and renames the ambiguous fields callers had been
complaining about.

### ⚠️ Breaking changes

#### 1. Renamed `SMTPVerifyOptions` fields for clarity

Old names were unitless or ambiguous about scope. No aliases —
TypeScript flags every old call site with a `Did you mean…?` hint.

| Before | After | Why |
| --- | --- | --- |
| `timeout` | `perAttemptTimeoutMs` | Per-MX×port budget; units in name |
| `tls` | `tlsConfig` | Matches the `SMTPTLSConfig` type name |
| `hostname` | `heloHostname` | What it actually is — the EHLO/HELO identity |

#### 2. Renamed `VerifyEmailParams` fields (and `BatchVerifyParams`)

| Before | After | Why |
| --- | --- | --- |
| `timeout` | `smtpPerAttemptTimeoutMs` | Scope (SMTP only) + units in name |
| `whoisTimeout` | `whoisTimeoutMs` | Units in name |

`BatchVerifyParams.timeout` likewise renamed to `smtpPerAttemptTimeoutMs`.

#### 3. SMTP reason vocabulary normalized

`connect_throw:<message>` (synchronous net/tls.connect throws) is gone
— those now resolve as plain `connection_error`, same key as async
failures. The diagnostic message is `console.log()`'d via the debug
logger but no longer baked into the result. One stable value to filter
on; prefix-matching `startsWith('connect_throw:')` patterns can collapse
to plain equality checks.

#### 4. Default SMTP sequence includes STARTTLS

The default per-attempt step list went from
`[greeting, ehlo, mailFrom, rcptTo]` (v4) to
`[greeting, ehlo, startTls, mailFrom, rcptTo]` (v5). The startTls step
is conditional — skipped when the port is already TLS (465), when EHLO
didn't advertise STARTTLS in `'auto'` mode, or when
`startTls === 'never'` — so existing scripts that don't include
STARTTLS in their EHLO multi-line continue to work unchanged. Tests
that DO advertise STARTTLS need to add a `220 ready` line for the
upgrade response or pass `startTls: 'never'`.

Without this, port 587 submission MXes (Gmail / Outlook / Office 365 /
ProtonMail / many corporates) reject `MAIL FROM` with
`530 Must issue STARTTLS first` — v4 had a real-world correctness gap.

#### 5. Dead-weight fields removed from `SmtpVerificationResult`

`success?`, `canConnect?`, `providerUsed?`, `providerSpecific?` —
declared in the type but never set by the verifier. Removed for a
cleaner public surface. Provider detection is intentionally
consumer-side (too domain-specific for a generic library).

#### 6. Dead enum values removed from `VerificationErrorCode`

`mailboxFull` and `freeEmailProvider` were declared but never set or
read anywhere. `over_quota` is surfaced via the SMTP probe's `error`
string + `hasFullInbox` boolean; free-email is a positive signal
(`result.isFree`) and never an error.

### ✨ Added

#### `verifyMailboxSMTP` control options

All on `SMTPVerifyOptions` (and re-exported on `VerifyEmailParams`
with an `smtp` prefix):

```ts
await verifyMailboxSMTP({
  local: 'alice', domain: 'example.com', mxRecords: [...],
  options: {
    perAttemptTimeoutMs: 3000,        // bound a single MX × port attempt
    totalDeadlineMs: 8000,            // bound the entire probe (NEW)
    maxConsecutiveFailures: 3,        // bail after 3 connection-class failures in a row (NEW)
    maxMxHosts: 2,                    // try first N MXes only (NEW)
    retry: {                          // retry connection-class failures (NEW)
      attempts: 1,
      delayMs: 200,
      backoff: 'exponential',         // or 'fixed'
    },
  },
});
```

For `verifyEmail`, the same knobs are available as
`smtpTotalDeadlineMs`, `smtpMaxConsecutiveFailures`, `smtpMaxMxHosts`,
`smtpRetry`. Real-world example — a Yahoo MX-timeout case from a user
log:

```ts
await verifyEmail({
  emailAddress: 'maria.hernandez+news@yahoo.com',
  verifySmtp: true,
  smtpTotalDeadlineMs: 5000,         // bail after 5s total
  smtpMaxConsecutiveFailures: 3,     // OR after 3 timeouts in a row
});
// → isDeliverable: false, error: 'connection_timeout' in ~5s
// instead of 9 attempts × 3s = 27s wall-clock.
```

#### STARTTLS upgrade (restored from v3)

```ts
// 'auto' (default) — upgrade if the MX advertises STARTTLS in EHLO.
// 'never'          — never upgrade; send MAIL FROM in plaintext.
// 'force'          — send STARTTLS unconditionally; testing only.
options: { startTls: 'auto' }
```

After 220, the plaintext socket is wrapped via
`tls.connect({ socket: plain, ... })` in place. RFC 3207 §4.2 mandates
re-EHLO after upgrade — pre-TLS state is discarded and capabilities
are re-read from the post-TLS EHLO. New reasons in the vocabulary:
`tls_upgrade_failed` (server returned non-220 to STARTTLS) and
`tls_handshake_failed` (TLS layer errored after 220).

#### `refineReasonByEnhancedStatus` (RFC 3463 helper)

Pure utility that maps RFC 3463 enhanced-status codes to richer reason
strings. Pure function, no I/O — opt-in refinement, never mutates
input.

```ts
import { refineReasonByEnhancedStatus, verifyMailboxSMTP } from '@emailcheck/email-validator-js';

const { smtpResult } = await verifyMailboxSMTP({ ... });
const refined = refineReasonByEnhancedStatus(smtpResult.error, smtpResult.enhancedStatus);
// 'mailbox_does_not_exist' instead of 'not_found' when MX returned 550 5.1.1
```

Mappings: `5.1.1` → `mailbox_does_not_exist`, `5.1.2`/`5.1.3` →
`bad_destination_*`, `5.1.6` → `mailbox_moved`, `5.2.x` →
`mailbox_disabled` / `mailbox_full` / `message_too_long` /
`mailing_list_expansion_problem`, `4.4.x` → `no_answer_from_host` /
`bad_connection`, `5.7.x` → `delivery_not_authorized` /
`no_reverse_dns` / `multiple_authentication_failures`. Codes outside
the table return the input reason unchanged.

#### `result.responseCode` — last SMTP response code

`SmtpVerificationResult.responseCode?: number` carries the most recent
3-digit SMTP code observed during the probe (e.g. `250`, `550`).
Removes the need for callers to re-parse `result.transcript` for the
last code. The type field already existed in v4; v5 actually populates
it.

#### Public API surface — re-export missing utilities

These were exported from their submodules but weren't reachable from
the package root (deep imports aren't part of `package.json#exports`):

- `verifyMailboxSMTP` (the direct SMTP probe — primary consumer-facing
  function)
- `parseDsn` + `ParsedDsn` (RFC 3463 enhanced-status parser)
- `parseWhoisData` + `ParsedWhoisResult` (TLD-aware WHOIS parser)
- `resolveMxRecords` (DNS MX lookup with cache)
- `defaultDomainSuggestionMethodAsync` (async variant)

`src/index.ts` reorganised with section comments documenting the
"every `src/*.ts` `export` re-exports through this barrel" rule.

### 🔧 Internal cleanups

- Removed dead `VerificationErrorCode` values (`mailboxFull`,
  `freeEmailProvider`) and dead `SmtpVerificationResult` fields
  (`success`, `canConnect`, `providerUsed`, `providerSpecific`).
- Removed `parseCompositeNamePart`'s `.base` backward-compat field.
- Cleared the last `noExplicitAny` in `src/`
  (`CacheStore<T = any>` → `CacheStore<T = unknown>`).
- Adapter doc-blocks no longer claim "backward compatibility" for
  legitimate deploy-mode variants (AWS Lambda's
  `apiGatewayHandler` / `lambdaHandler` / `handler` and Vercel's
  `edgeHandler` / `nodeHandler` / `handler` are deploy modes, not
  legacy).

### 📚 Documentation

- **`SMTPVerifyOptions`, `VerifyEmailParams`, `BatchVerifyParams`** —
  every field has a JSDoc block listing the default value and
  explaining when each value is the right choice. Fields grouped into
  sections (Connection envelope / Caching / Time budget + early-stop /
  Dialogue customization) so the interface reads top-down.
- README — new "Time-budget controls" section showing the
  `smtpTotalDeadlineMs` / `smtpMaxConsecutiveFailures` /
  `smtpMaxMxHosts` / `smtpRetry` recipes.
- `MIGRATION_email-smtp-probe.md` — updated step-7 (sequence handling
  now reflects STARTTLS in the default sequence) and step-6 (reason
  refinement helper now ships in the library).

### Tests

- `__tests__/unit/0117-smtp-control-options.test.ts` — 7 new tests
  covering every control-option decision path
- `__tests__/unit/0115-smtp-starttls.test.ts` — 8 new tests for
  STARTTLS auto / never / force / port 465 no-op / 5xx rejection
- `__tests__/unit/0116-refine-reason.test.ts` — 23 new tests
  covering every RFC 3463 mapping + null/undefined handling

Total: **807 unit + 37 isolated + 207 extras = 1051 tests passing.**

---

## v4.0.0 - 2026-05-01

### 🚀 Major refactor: Bun-first toolchain, CLI, transcripts, full serverless coverage

This release rebuilds the project around three goals: a faster runtime
toolchain (Bun + Biome instead of yarn + jest + eslint), a structured
verification transcript across the entire pipeline, and a properly-shipped
serverless surface covering the big six platforms. Plus a new
`email-validate` CLI for one-off checks and shell scripting.

### ⚠️ Breaking changes

#### 1. Stricter email format validator

The local-part allow-list is now **positive**: `[a-zA-Z0-9._+'-]`. Characters
that are RFC-5322-valid but virtually never seen in real mailboxes are now
rejected as likely typos:

| Was accepted in v3 | Now rejected |
| ------------------ | :----------: |
| `hey=mo@gmail.com` | ✓ rejected |
| `foo?bar@gmail.com` | ✓ rejected |
| `foo^bar@gmail.com`, `foo!bar@…`, `foo$bar@…`, `foo&bar@…`, `foo|bar@…` | ✓ all rejected |

Standard sub-addressing with `+`, dots, underscores, hyphens, and
apostrophes (`o'brien@…`) is unchanged. If you need full RFC-5322
permissiveness, validate elsewhere; this library now mirrors what mainstream
validators (HTML5 `type="email"`, npm `email-validator`) accept in practice.

#### 2. Out-of-scope module moved to `extras/`

`check-if-email-exists.ts` and its companion fixtures are no longer part of
the published `src/` tree. Imports change:

```diff
- import { ... } from '@emailcheck/email-validator-js/check-if-email-exists';
+ import { ... } from '@emailcheck/email-validator-js/extras/check-if-email-exists';
```

The module is still tested via the opt-in `bun run test:extras` runner
(~200 tests).

#### 3. `validateBatchEmailsField` now returns a discriminated union

The internal helper used by serverless adapters now returns either
`{ ok: true; emails: string[] }` or `{ ok: false; status; message }`,
eliminating a non-null assertion at every call site. Adapter authors
re-implementing this layer should mirror the new shape.

#### 4. Test layout reorganized

Tests now live under `__tests__/unit/` (default suite) and
`__tests__/isolated/` (tests using `mock.module` that need a separate
process). External tooling that targeted specific paths needs to update.

#### 5. Examples reorganized by topic

Files like `examples/smtp-usage.ts` have moved to
`examples/smtp/usage.ts`, `examples/cache/custom-redis.ts`, etc. See the
new [examples/README.md](./examples/README.md) for the full layout.

#### 6. Minimum Node.js bumped from 18 to 22

`engines.node` is now `>= 22.0`. Node 18 reached end-of-life on
**2025-04-30** and Node 20 on **2026-04-30** — both stopped receiving
security patches before this release. Supported lines:

| Line  | Status                | EOL          |
| ----- | --------------------- | ------------ |
| 22.x  | Maintenance LTS       | 2027-04-30   |
| 24.x  | Active LTS            | 2028-04-30   |

CI runs the test matrix against both. Older Node lines may still
work — `npm install` issues an `EBADENGINE` warning rather than a hard
failure — but they're no longer covered by tests or security updates
upstream.

### ✨ Added

#### `email-validate` CLI

```bash
bun add -g @emailcheck/email-validator-js
email-validate alice@example.com
```

- Full pipeline by default (format / MX / SMTP probe / disposable / free / typo)
- Transcript captured automatically
- JSON log written to `./logs/` (configurable, opt-out)
- Exit codes: `0` deliverable / format-MX OK; `1` undeliverable / no MX / indeterminate; `2` bad CLI arguments
- Output formats: `pretty` (default), `text`, `json`
- Programmatic surface: `parseArgs`, `run`, `exitCodeFor`, `logFileNameFor` exported from `@emailcheck/email-validator-js/cli`

See [examples/cli-usage.md](./examples/cli-usage.md) for recipes.

#### Structured verification transcript

Pass `captureTranscript: true` to `verifyEmail` (or
`verifyMailboxSMTP`/`isDisposableEmail`/etc.) and get a per-step trace:

```typescript
const result = await verifyEmail({
  emailAddress: 'alice@example.com',
  verifyMx: true,
  verifySmtp: true,
  captureTranscript: true,
});
for (const step of result.transcript ?? []) {
  console.log(`[${step.kind}] ${step.durationMs}ms ok=${step.ok}`, step.details);
}
```

Step kinds: `syntax`, `domain-validation`, `mx-lookup`, `smtp-probe`,
`disposable`, `free`, `domain-suggestion`, `name-detection`,
`whois-age`, `whois-registration`. The SMTP step includes the wire-level
transcript with `<port>|s|` server lines and `<port>|c|` client commands.

#### Three new serverless platform adapters

| Subpath                                            | Platform                            |
| -------------------------------------------------- | ----------------------------------- |
| `@emailcheck/email-validator-js/serverless/gcp`    | GCP Cloud Functions (2nd gen)       |
| `@emailcheck/email-validator-js/serverless/netlify` | Netlify Functions                   |
| `@emailcheck/email-validator-js/serverless/azure`  | Azure Functions (v4 model)          |

Each ships two handler shapes — a routed handler (`/health`, `/validate`,
`/validate/batch`) and a single-route convenience that infers single vs.
batch from the body. Combined with the existing AWS / Vercel / Cloudflare
adapters, this covers the six biggest serverless platforms.

#### Built-in `DoHResolver` for edge MX support

```typescript
import { validateEmailCore, DoHResolver } from '@emailcheck/email-validator-js/serverless/verifier';

const result = await validateEmailCore('alice@example.com', {
  validateMx: true,
  dnsResolver: new DoHResolver(),  // Cloudflare 1.1.1.1 by default
});
```

Works in any runtime with `fetch` — Cloudflare Workers, Vercel Edge, Deno,
browsers, Node 22+. Configurable endpoint (Google / NextDNS / self-hosted),
per-query timeout, custom fetch. Compatible with the
[`cf-doh`](https://www.npmjs.com/package/cf-doh) package — same
`DNSResolver` interface, drop-in interchangeable. The built-in keeps the
package zero-dep so the same code works everywhere without an extra
install step.

#### `parseSmtpError` standalone module

```typescript
import { parseSmtpError } from '@emailcheck/email-validator-js';

parseSmtpError('552 5.2.2 mailbox over quota');
// { isDisabled: false, hasFullInbox: true, isCatchAll: false, isInvalid: false }
```

Four orthogonal flags, 49 unit tests covering false-positive guards.

### 🔧 Changed

- **Bun is now the canonical toolchain.** `yarn` + `jest` + `ts-jest` + `eslint`
  all removed; replaced with `bun install` / `bun:test` / `biome`. CI and
  release workflows updated. `bun.lock` committed.
- **Zero `!` non-null assertions in `src/`.** Each was replaced with a proper
  guard (extracted local + check, or a `BatchValidation`-style discriminated
  union). Per `AGENTS.md`, this is now a project rule.
- **SMTP probe hardened** at the function boundary:
  - `null` `mxRecords` no longer crashes (`?? []` guard)
  - Invalid ports (-1, 0, 65536, non-integer) are filtered before
    `net.connect` (which throws `ERR_SOCKET_BAD_PORT` synchronously)
  - `try/catch` around `connect()` inside the Promise executor as a
    belt-and-braces guard for any other synchronous net/tls.connect throws
- **Class-based SMTP state machine** (`SMTPProbeConnection`) replacing the
  closure-with-mutation implementation. One instance per port attempt,
  clearly-owned variables.
- **Lookup tables replace `if`/`else if` chains** in WHOIS parsing
  (`TLD_REGEX`) and typo suggestion (`TYPO_LOOKUP`).
- **Data extracted to `src/data/*.json`**: common first/last names, common
  email domains, typo patterns, WHOIS server table.
- **Stricter port walk semantics:** the probe now walks ports sequentially
  with no per-port retry. Total runtime is bounded by `timeout` per port.
  Tests asserting old retry/exponential-backoff behavior were removed.
- **Test count: ~770 default suite** (was ~600) — gained from new adapter
  tests (44), CLI tests (44), DSN parsing (35), transcript (10),
  parseSmtpError (49), and previously-orphaned cache tests (12).

### 🐛 Fixed

- `verifyMailboxSMTP` no longer rejects with `RangeError` when the caller
  passes invalid ports — the probe returns a structured failure result
  instead.
- `verifyMailboxSMTP` no longer crashes with `TypeError` when the caller
  passes `null` for `mxRecords` (the destructuring default only fires on
  `undefined`).
- `parseDate` in `src/whois-parser.ts` no longer throws on invalid date
  strings — returns `null` for unparseable input.
- Mock-module pollution between adapter tests and unit tests (the `0501`
  / `0502` / `0512` tests use `mock.module` which mutates the registry).
  Solved by splitting into `__tests__/isolated/` with its own bun-test
  process.

### 📚 Documentation

- **[SERVERLESS.md](./SERVERLESS.md) rewritten end-to-end** against the
  actual API surface — the previous version described an aspirational
  shape that didn't exist (`/serverless/core`, fictional handler names,
  wrong result shape). New file documents all six platforms, the
  DNSResolver injection pattern, KV write-through, Durable Object routes,
  bundle-size table, and a Node-vs-edge migration diff.
- **[examples/cli-usage.md](./examples/cli-usage.md)** — recipes for the
  new CLI (interactive check, JSON for `jq`, shell scripting with exit
  codes, full WHOIS reputation, custom port walk, debug mode).
- **[AGENTS.md](./AGENTS.md)** — single source of truth for code style,
  architecture, and toolchain rules. `CLAUDE.md` and
  `.github/copilot-instructions.md` are thin pointers to it.
- **README.md** — tightened, deduplicated; now points to the topic-specific
  docs (`SERVERLESS.md`, `examples/cli-usage.md`, `AGENTS.md`) instead of
  inlining everything.

### 🛠️ Internal

- Rollup configs unified — one for the main package, one for the
  serverless build (now 6 adapters + verifier + umbrella).
- TypeScript strict mode in both `tsconfig.json` (src) and
  `tsconfig.test.json` (src + tests + examples).
- New `__tests__/helpers/fake-net.ts` shared mock for `node:net` /
  `node:tls` / `node:dns` — no more per-file `FakeSocket` collisions.
- Six new domain-specific test scripts (`test:smtp`, `test:cache`,
  `test:whois`, `test:names`, `test:serverless`, `test:cli`) for fast
  inner-loop runs during development.

## v3.2.0 - 2025-12-29

### 🔧 Maintenance

### Changed
- **Domain List**: Removed `forwardemail.net` from common email domains list
- Updated package version to 3.2.0

## v3.1.0 - 2025-12-29

### 🎉 Algorithm-Specific Name Functions Release

This release adds specialized name detection functions for Algorithm that aggressively clean special characters from detected names.

### Added
- **`cleanNameForAlgorithm()`** - Remove dots, underscores, and asterisks from names
- **`detectNameForAlgorithm()`** - Enhanced name detection with automatic special character cleaning
- Name cleaning removes: dots (`.`), underscores (`_`), and asterisks (`*`)
- Normalizes multiple spaces to single spaces
- Slightly reduces confidence (95% of original) due to cleaning process

### Features
- Ideal for systems requiring clean, sanitized names without special characters
- Handles complex patterns like `john.doe_smith*` → `John Doesmith`
- Comprehensive test coverage for all cleaning scenarios
- Example integration in `examples/algolia-integration.ts`

## v3.0.0 - 2025-12-28

### 💥 Breaking Change - Enum and Constant Naming Convention

This release introduces a **breaking change** to improve code consistency with TypeScript/JavaScript conventions. All enum values and constants now use `camelCase` instead of `SCREAMING_SNAKE_CASE`.

### ⚠️ Breaking Changes

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

### Migration Guide
See the [Migration Guide in README](./README.md#migration-guide-to-v3x) for detailed instructions.

### Important Notes
1. **String values remain unchanged**: The underlying string values are preserved. Only property names changed.
2. **Runtime compatibility**: Comparing enum values to strings still works as before.
3. **All existing functionality is preserved**: This is purely a naming convention change.

### Documentation
- Updated README with comprehensive migration guide
- All examples updated to use new camelCase naming
- TypeScript strict mode compatibility ensured

## v2.13.0 - 2025-12-12

### 🚀 Enhanced SMTP Verification Release

This major release introduces comprehensive SMTP verification enhancements with TLS/SSL support, multi-port testing, custom SMTP sequences, and smart caching, providing enterprise-grade email validation capabilities.

### ✨ Enhanced SMTP Features

- **Multi-Port SMTP Testing** - Automatic testing of ports 25 (SMTP), 587 (STARTTLS), and 465 (SMTPS) with intelligent port optimization
- **TLS/SSL Support** - Full support for STARTTLS (port 587) and implicit TLS (port 465) with configurable security options
- **Custom SMTP Sequences** - Complete control over SMTP command sequences with enum-based step control (GREETING, EHLO, HELO, STARTTLS, MAIL_FROM, RCPT_TO, VRFY, QUIT)
- **Smart Port Caching** - Remembers successful ports per domain to significantly improve performance on subsequent verifications
- **Enhanced Error Handling** - Improved detection of over quota responses, multiline SMTP greetings, and specific error conditions
- **IP Address Detection** - Robust detection of IP addresses vs domain names for proper TLS servername configuration
- **Debug Logging** - Comprehensive debug mode for detailed SMTP transaction logging

### 🔧 New API

- **`verifyMailboxSMTP()`** - New direct SMTP verification function with enhanced capabilities
- **`SMTPStep` enum** - Control over SMTP command sequences and protocol flow
- **`SMTPVerifyOptions` interface** - Comprehensive configuration options for TLS, ports, retries, and caching
- **`VerifyMailboxSMTPParams` interface** - Clean separation of required parameters and optional configuration

### 📊 Performance Optimizations

- **Port Performance Caching** - Caches successful ports per host/domain to avoid repeated port testing
- **Connection Reuse** - Optimized connection handling with proper cleanup and error management
- **Configurable Timeouts** - Per-port timeout configuration with retry logic
- **Cache Performance** - Added `smtpPort` cache store with 30-minute TTL for port performance data

### 🛠️ API Changes

```typescript
// Enhanced SMTP verification
const { result, port, cached, portCached } = await verifyMailboxSMTP({
  local: 'user',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: {
    ports: [25, 587, 465], // Multi-port testing
    timeout: 5000,
    maxRetries: 2,
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    cache: getDefaultCache(),
    debug: false,
    hostname: 'your-domain.com',
    useVRFY: true,
  },
});
```

### 🔐 Security Enhancements

- **TLS Configuration** - Configurable TLS minimum versions and certificate validation
- **Hostname Support** - Custom EHLO/HELO hostname configuration for better SMTP server identification
- **Secure by Default** - Appropriate TLS settings for different security requirements

### 📝 Examples & Documentation

- **Comprehensive Examples** - 13 new TypeScript examples demonstrating all enhanced features
- **Direct Execution Support** - Examples can be run directly with `node --experimental-strip-types`
- **Performance Testing** - Built-in performance benchmarks and cache testing utilities
- **Custom Cache Examples** - Memory and Redis cache implementation examples
- **Test Coverage** - Complete test suite with 16/16 socket-mock-tests passing

### 🏗️ Cache Enhancements

- **`smtpPort` Cache Store** - New cache for storing successful ports per host/domain
- **Enhanced Cache Interface** - Updated `ICache` interface with smtpPort support
- **Cache Performance** - Improved cache TTL and sizing for optimal performance

### 🧪 Testing Improvements

- **Socket Mock Tests** - Comprehensive SMTP protocol testing with proper multiline response handling
- **Over Quota Detection** - Enhanced testing for 452 over quota responses
- **Multiline Greeting Support** - Proper handling of multi-line SMTP greetings (220- responses)
- **Error Scenario Testing** - Comprehensive error condition testing and validation

### 📦 Dependencies

- **No New Dependencies** - All enhancements built with existing dependencies
- **Improved Type Safety** - Full TypeScript support with strict type checking
- **Backward Compatibility** - All existing APIs remain unchanged

### 🔄 Migration Notes

This release is **fully backward compatible**. All existing code continues to work unchanged. The new enhanced SMTP features are available through the new `verifyMailboxSMTP()` function and do not affect existing `verifyEmail()` functionality.

### 📚 Documentation Updates

- **Updated README** - Comprehensive enhanced SMTP documentation with examples
- **Examples README** - Complete examples guide with direct execution commands
- **Type Documentation** - Enhanced JSDoc comments throughout the codebase
- **Performance Guide** - Updated caching and performance optimization documentation

## v2.12.0 - 2025-12-03
- Update dependencies to latest versions
- Update name detection algorithms for better accuracy

## v2.11.0 - 2025-11-22

### 🔧 Maintenance & Improvements

### Changed
- **Build System**: Reverted from Rolldown back to Rollup for better stability and ecosystem compatibility
- **Type System**: Improved TypeScript type inference throughout the codebase
  - Removed duplicate type definitions
  - Leveraged automatic type inference where possible
  - Reduced redundant type declarations for better maintainability
  - Maintained strict type safety while simplifying code

### Fixed
- **Dependencies**: Updated all non-major dependencies to latest versions (#529)
- **Build Configuration**: Restored stable Rollup configuration for consistent builds

### Technical Details
- Removed redundant `types.d.ts` file (271 lines of duplicate definitions)
- Improved type inference in batch processing, domain suggestion, and name detection modules
- Simplified array and object type declarations using TypeScript's inference capabilities
- All tests passing with enhanced type safety

## v2.10.1 - 2025-08-29

### 🐛 Bug Fixes & Improvements

### Fixed
- **Serverless Adapters**: Added missing `handler` export for AWS Lambda and Vercel Edge Functions adapters
- **TypeScript**: Fixed type casting issues in serverless adapter tests
- **Dependencies**: Added `@types/aws-lambda` for proper TypeScript support

### Added
- **Testing**: Comprehensive test suites for AWS Lambda adapter (287 lines)
- **Testing**: Comprehensive test suites for Vercel Edge Functions adapter (328 lines)
- **Testing**: All serverless adapters now have full test coverage

### Improved
- **Code Quality**: Fixed all linting issues with proper type annotations
- **Test Coverage**: 241 tests passing across 15 test suites
- **Developer Experience**: Better TypeScript support for serverless environments

## v2.10.0 - 2025-08-28

### 🚀 Serverless Platform Support

This release introduces comprehensive serverless platform support with dedicated adapters for AWS Lambda, Cloudflare Workers, Vercel Edge Functions, and Deno Deploy, enabling email validation at the edge with optimized performance.

### Added
- **Serverless Core Module**
  - Edge-optimized email validation without Node.js dependencies
  - Built-in EdgeCache for high-performance caching at the edge
  - Batch validation support with configurable concurrency
  - Lightweight bundle size (~15KB gzipped)

- **Platform Adapters**
  - **AWS Lambda**: Full support for API Gateway v1/v2 and ALB triggers
  - **Cloudflare Workers**: Native Workers API with KV storage integration
  - **Vercel Edge Functions**: Edge runtime support with streaming responses
  - **Deno Deploy**: Native Deno server with TypeScript support

- **API Features**
  - RESTful endpoints for single and batch validation
  - CORS support with configurable origins
  - Rate limiting and request validation
  - Comprehensive error handling and logging
  - Health check endpoints

- **Performance Optimizations**
  - Edge caching with TTL configuration
  - Parallel batch processing
  - Minimal cold start times
  - Optimized bundle sizes per platform

### Improved
- **Module System**: New modular exports for tree-shaking
- **TypeScript Support**: Enhanced types for serverless environments
- **Documentation**: Comprehensive serverless deployment guides
- **Testing**: Platform-specific test suites

### Technical Details
- Zero Node.js dependencies in serverless core
- Platform-agnostic validation logic
- Streaming response support for large batches
- Environment-based configuration

## v2.6.0 - 2025-08-26

### 🚀 Enhanced Name Detection Release

This release introduces significant improvements to the name detection functionality, providing more accurate and intelligent extraction of first and last names from complex email address patterns.

### Added
- **Enhanced Composite Name Detection**
  - Support for alphanumeric composite names (e.g., "mo1.test2@example.com")
  - Smart handling of mixed letter-number patterns
  - Preservation of alphanumeric identities when contextually appropriate
  - Confidence scoring adjusted for composite patterns (0.6 for full alphanumeric, 0.8 for mixed)

- **Intelligent Number Processing**
  - Context-aware number handling in email addresses
  - Smart extraction of base names from trailing numbers ("john123" → "John")
  - Mixed case processing ("john2.doe" → "John", "Doe")
  - Alphanumeric pattern preservation for composite identities

- **Advanced Contextual Suffix Recognition**
  - Extended suffix detection for modern email patterns
  - Recognition of development suffixes ("dev", "company", "team")
  - Year pattern detection and filtering (1900-2099)
  - Corporate and organizational suffix handling

- **Complex Multi-Part Name Parsing**
  - Enhanced handling of 3+ part email structures
  - Intelligent first/last name extraction from complex patterns
  - Mixed separator support (dots, underscores, hyphens)
  - Smart suffix filtering in multi-component addresses

- **Refined Confidence Scoring System**
  - Granular confidence levels (0.4-0.9) based on pattern complexity
  - Higher confidence for standard patterns (dot-separated: 0.9)
  - Appropriate confidence for alphanumeric patterns (0.6)
  - Context-aware scoring for extracted vs. preserved patterns

### Improved
- **Name Detection Accuracy**: Significantly improved detection rates for modern email patterns
- **Pattern Recognition**: Better handling of development, gaming, and platform email formats
- **International Support**: Enhanced parsing of hyphenated and compound names
- **Edge Case Handling**: Robust processing of unusual email structures
- **Performance**: Maintained linear time complexity with enhanced functionality

### Technical Enhancements
- **Composite Name Parsing**: New `parseCompositeNamePart()` function for alphanumeric analysis
- **Smart Capitalization**: Enhanced capitalization that preserves alphanumeric formatting
- **Pattern Validation**: Improved `isLikelyName()` with number-aware validation
- **Comprehensive Testing**: 212 test cases covering various pattern types and edge cases

### Use Cases
- Development team email patterns ("dev1.ops2@company.com")
- Gaming and platform usernames ("player1.guild2@platform.com")
- Corporate year-based patterns ("john.smith.2024@corp.com")
- Mixed alphanumeric systems ("user123.admin@service.com")
- International naming conventions with enhanced accuracy

### Backward Compatibility
- All existing API signatures remain unchanged
- Previous detection results maintain consistency
- New capabilities are purely additive
- No breaking changes to confidence thresholds

## v2.4.1 - 2025-01-26

### Improvements
- **Enhanced Domain Validation**: WHOIS functions now use PSL (Public Suffix List) for consistent domain validation
- **Type Safety**: Fixed TypeScript type assertions in WHOIS cache
- **Code Quality**: Removed non-null assertions for safer code

### Changed
- WHOIS domain validation now uses `psl.isValid()` matching email domain validation
- Invalid domains without valid TLDs now correctly return `null`

## v2.4.0 - 2025-01-26

### 🎉 WHOIS Domain Information Release

This release adds WHOIS lookup capabilities to retrieve domain age and registration status, providing deeper insights into email domain validity and reputation.

### Added
- **Domain Age Detection via WHOIS**
  - New `getDomainAge()` function retrieves domain creation date and age
  - Calculates age in days and years
  - Returns expiration and last updated dates
  - Supports extraction from email addresses and URLs
  - 1-hour caching for performance optimization

- **Domain Registration Status via WHOIS**
  - New `getDomainRegistrationStatus()` function checks domain registration
  - Detects if domain is registered or available
  - Returns registrar information and name servers
  - Provides domain status codes (locked, pending deletion, etc.)
  - Calculates days until expiration
  - Identifies expired domains

- **WHOIS Infrastructure**
  - Support for 50+ TLDs with specific WHOIS servers
  - Automatic WHOIS server discovery for unknown TLDs
  - Intelligent parsing of various WHOIS response formats
  - Robust error handling and timeout support
  - Built-in caching with 1-hour TTL

- **New Type Definitions**
  - `DomainAgeInfo` interface for domain age results
  - `DomainRegistrationInfo` interface for registration status
  - `WhoisData` interface for raw WHOIS data

### Performance
- WHOIS results cached for 1 hour to reduce network calls
- Timeout support (default 5 seconds) for unresponsive WHOIS servers
- Graceful degradation when WHOIS servers are unavailable

### Testing
- Added comprehensive test suite for WHOIS functions
- 19 tests covering various scenarios and edge cases
- Integration tests with real WHOIS servers

## v2.3.0 - 2025-01-26

### 🎉 Name Detection & Domain Suggestion Release

This release introduces intelligent name detection from email addresses and domain typo detection with suggestions, enhancing the email validation capabilities.

### Added
- **Name Detection from Email Addresses**
  - New `detectName()` function extracts first and last names from email addresses
  - Supports common separators: dot (.), underscore (_), hyphen (-)
  - Handles camelCase patterns (e.g., johnDoe@example.com)
  - Removes email aliases (text after +) before detection
  - Confidence scoring based on pattern reliability
  - Custom detection method support via `nameDetectionMethod` parameter
  - Integrated into `verifyEmail()` and `verifyEmailDetailed()` with `detectName` parameter
  
- **Domain Typo Detection and Suggestions**
  - New `suggestEmailDomain()` function detects and corrects domain typos
  - Supports 70+ common email domains (Gmail, Yahoo, Outlook, etc.)
  - Uses string similarity algorithm from `string-similarity-js` package
  - Smart similarity thresholds based on domain length
  - Known typo patterns detected with 95% confidence
  - Custom domain list support via `commonDomains` parameter
  - Cached suggestions for 24-hour performance optimization
  - Enabled by default in `verifyEmailDetailed()`
  
- **New Utility Functions**
  - `isCommonDomain()` - Check if domain is in common list
  - `getDomainSimilarity()` - Calculate similarity between two domains
  - `COMMON_EMAIL_DOMAINS` - Exported constant with 70+ common domains
  
- **Enhanced Type Definitions**
  - `DetectedName` interface for name detection results
  - `DomainSuggestion` interface for domain suggestions
  - `NameDetectionMethod` type for custom detection functions
  - `DomainSuggestionMethod` type for custom suggestion functions

### Changed
- Updated `verifyEmail()`, `verifyEmailDetailed()`, and `verifyEmailBatch()` to support name detection and domain suggestions
- Enhanced caching system to include domain suggestions (24-hour TTL)
- Added `string-similarity-js` as a dependency for similarity calculations

### Performance
- Domain suggestions cached for 24 hours to avoid recalculating similarity scores
- Name detection is lightweight with minimal performance impact
- All features are optional and don't affect performance when disabled

## v2.2.1 - 2025-01-26

### Changed
- Move `@types/psl` from dependencies to devDependencies for cleaner production installs
- Update `typescript-eslint` to v8.41.0
- Update `eslint` to v9.34.0
- Update README documentation

### Fixed
- Reduced production dependencies footprint by correctly categorizing development-only packages

## v2.1.0 - 2024-01-19

### 🎉 Major Improvements Release

This release brings significant performance improvements, new features, and better developer experience while maintaining full backward compatibility.

### Added
- **Batch Email Verification** - New `verifyEmailBatch()` function for parallel processing of multiple emails with concurrency control
- **Detailed Verification Results** - New `verifyEmailDetailed()` function returns comprehensive results with error codes
- **Advanced Caching System** - Integrated `tiny-lru` for intelligent caching with configurable TTL:
  - MX Records: 1 hour TTL
  - Disposable checks: 24 hours TTL
  - Free provider checks: 24 hours TTL
  - Domain validation: 24 hours TTL
  - SMTP results: 30 minutes TTL
- **Error Code System** - New `VerificationErrorCode` enum for precise error identification
- **Retry Mechanism** - Automatic retry for transient failures with exponential backoff
- **Multiple MX Fallback** - Automatically tries up to 3 MX servers if the first fails
- **Cache Management** - New `clearAllCaches()` utility function
- **TypeScript Enhancements** - Strict mode enabled with comprehensive type definitions
- **RFC 5321 Compliance** - Enhanced email validation with proper length checks (64 char local, 253 char domain)
- **New Test Coverage** - Added comprehensive tests for batch processing, caching, and detailed verification

### Changed
- **Socket Cleanup** - Fixed memory leaks with proper socket cleanup and event listener removal
- **Performance** - ~90% reduction in DNS lookups through caching
- **Email Validation** - Enhanced pattern detection (consecutive dots, leading/trailing dots)
- **Dependencies** - Added `tiny-lru` for efficient LRU caching
- **TypeScript Configuration** - Enabled strict mode for better type safety
- **Jest Configuration** - Updated to use new transform syntax (removed deprecated globals)

### Fixed
- Memory leak in socket connections preventing proper cleanup
- Socket cleanup issues causing "Cannot log after tests are done" errors
- Caching for negative results (now caches both positive and negative results)
- TypeScript strict null check issues throughout the codebase
- Test isolation issues with shared cache between tests

### Performance Improvements
- Caching reduces repeated DNS lookups by ~90%
- Batch processing enables parallel verification of multiple emails
- Smart MX record fallback reduces false negatives
- Connection reuse through SMTP result caching
- Optimized memory usage with proper cleanup

### Developer Experience
- Comprehensive JSDoc documentation for all public APIs
- New examples directory with advanced usage patterns
- Migration guide for upgrading from v2.0.0
- Improved error messages with specific error codes
- Better TypeScript support with exported types
- All tests passing with 100% reliability

### Documentation
- Complete API reference in README
- Performance optimization guide
- Migration guide (MIGRATION.md)
- Advanced usage examples
- Commercial licensing information at https://email-check.app/license/email-validator

### Migration Notes
This release is **fully backward compatible**. All existing code will continue to work without changes. New features are opt-in through new functions. See [MIGRATION.md](./MIGRATION.md) for details.

## v2.0.1
- Update release script

## v2.0.0
- Update license from MIT to BSL-1.1
- Improve performance use es6 set to speed up domain lookups thanks to [@ArsenyYankovsky](https://github.com/ArsenyYankovsky) [#221](https://github.com/email-check-app/email-validator-js/pull/221)
- Update dependencies
- Update lists

## v1.0.19
- allow passing `smtpPort` to `verifyEmail` function

## v1.0.18
- Fix npm release folder

## v1.0.17
- Update dependencies
- Update disposable email domains
- Update free email domains

## v1.0.14
- add socket.on('timeout') event
- add socket.on('close') event
- enhance email regex validation

## v1.0.13
- minor refactoring
- adding more tests and real dns tests
- change free email domains to json file
- change disposable email domains to json file

## v1.0.12
- change default value verifyMx to false
- fix validMx value check when verifySmtp is true

## v1.0.11
- remove yahoo exclusion in smtp

## v1.0.10
- change response validEmailFormat to validFormat

## v1.0.9
- change response wellFormed to validEmailFormat
- change response validDomain to validMx
- change response validMailbox to validSmtp

## v1.0.8
- change params verifyDomain to verifyMx
- change params verifyMailbox to verifySmtp

## v1.0.7
- Add PSL to support ( isValidEmailDomain )
- Refactor tests

## v1.0.0
- Initial release
