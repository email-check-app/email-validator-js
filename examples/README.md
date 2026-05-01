# Email Validator JS — Examples

Runnable examples for the public API. Each file is a standalone script you
can execute with **`bun run examples/<file>`** (Bun runs TypeScript directly
without a compile step).

## 🚀 Quick Start

```bash
# Install (uses bun.lock)
bun install

# Typecheck
bun run typecheck

# Run the default test suite
bun run test
```

## 📁 Examples by topic

### Core SMTP

| File                                           | What it shows                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`smtp-usage.ts`](./smtp-usage.ts)             | Minimal `verifyMailboxSMTP` call — pre-resolved MX records, port walk, cache               |
| [`smtp-test.ts`](./smtp-test.ts)               | Multi-port smoke test: 25/587/465 with timeouts                                            |
| [`smtp-enhanced.ts`](./smtp-enhanced.ts)       | TLS configuration + custom step sequence                                                   |
| [`smtp-caching-example.ts`](./smtp-caching-example.ts) | Cache hit-rate measurement, port-cache reuse                                       |

### Caching

| File                                              | Backend                                       |
| ------------------------------------------------- | --------------------------------------------- |
| [`custom-cache-memory.ts`](./custom-cache-memory.ts) | Custom in-memory `CacheStore<T>` implementation |
| [`custom-cache-redis.ts`](./custom-cache-redis.ts)   | `RedisAdapter` + `ioredis`-compatible client |

### High-level API + integrations

| File                                                              | Topic                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| [`advanced-usage.ts`](./advanced-usage.ts)                        | Full `verifyEmail` orchestration with every flag     |
| [`domain-suggestion-example.ts`](./domain-suggestion-example.ts)  | Typo detection / closest-domain suggestion           |
| [`name-detection-example.ts`](./name-detection-example.ts)        | First/last name extraction from local-part           |
| [`algolia-integration.ts`](./algolia-integration.ts)              | Pattern for plugging the validator into a search UI  |

## 🔧 Running

```bash
# Bun runs .ts directly — no transpile step
bun run examples/smtp-usage.ts
bun run examples/advanced-usage.ts
bun run examples/custom-cache-memory.ts
```

## ⚙️ Common patterns

### Verify with the default cache

```typescript
import { verifyEmail } from '@emailcheck/email-validator-js';

const result = await verifyEmail({
  emailAddress: 'alice@example.com',
  verifyMx: true,
  verifySmtp: true,
});
console.log(result.isDeliverable, result.metadata.error);
```

### Verify with a transcript

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

### Run the SMTP probe directly with transcript capture

```typescript
import { verifyMailboxSMTP } from '@emailcheck/email-validator-js';

const { smtpResult } = await verifyMailboxSMTP({
  local: 'alice',
  domain: 'example.com',
  mxRecords: ['mx.example.com'],
  options: { ports: [25, 587], timeout: 5000, captureTranscript: true },
});

console.log(smtpResult.transcript); // ["25|s| 220 mx ESMTP", ...]
console.log(smtpResult.commands);   // ["25|c| EHLO localhost", ...]
```

### Classify a raw SMTP error string

```typescript
import { parseSmtpError } from '@emailcheck/email-validator-js';

const parsed = parseSmtpError('552 5.2.2 mailbox over quota');
// { isDisabled: false, hasFullInbox: true, isCatchAll: false, isInvalid: false }
```

## 🤝 Contributing examples

If you add a new example:

1. Keep it self-contained — one runnable script, one topic.
2. Comment the *why*, not the *what* — readers can read the API, they want to know when to use it.
3. Add it to the table above with a one-line description.
4. Run `bun run typecheck` before committing.
