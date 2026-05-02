# Email Validator JS — Examples

Runnable examples for the public API, grouped by topic. Bun runs TypeScript
directly, so any standalone `.ts` example below executes with:

```bash
bun run examples/<folder>/<file>.ts
```

## Quick start

```bash
bun install         # uses bun.lock
bun run typecheck   # tsc against src + tests + examples
bun run test        # default test suite
```

## Layout

```
examples/
├── README.md
├── cli-usage.md             ← `email-validate` CLI recipes
├── smtp/                    ← Direct SMTP-probe API (verifyMailboxSMTP)
├── cache/                   ← Custom CacheStore<T> implementations
├── high-level/              ← verifyEmail orchestration + name / domain
├── integrations/            ← Plugging the validator into other tools
└── serverless/              ← Deploy-ready scaffolding per platform
```

## SMTP — direct probe API

| File                                          | What it shows                                                     |
| --------------------------------------------- | ----------------------------------------------------------------- |
| [`smtp/usage.ts`](./smtp/usage.ts)             | Minimal `verifyMailboxSMTP` call: pre-resolved MX, port walk      |
| [`smtp/test.ts`](./smtp/test.ts)               | Multi-port smoke test: 25/587/465 with timeouts                   |
| [`smtp/enhanced.ts`](./smtp/enhanced.ts)       | TLS configuration + custom step sequence + caching                |
| [`smtp/caching.ts`](./smtp/caching.ts)         | Cache hit-rate measurement, port-cache reuse                      |

## Caching

| File                                              | Backend                                       |
| ------------------------------------------------- | --------------------------------------------- |
| [`cache/custom-memory.ts`](./cache/custom-memory.ts) | Custom in-memory `CacheStore<T>` implementation |
| [`cache/custom-redis.ts`](./cache/custom-redis.ts)   | `RedisAdapter` + `ioredis`-compatible client |

## High-level API

| File                                                              | Topic                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| [`high-level/advanced-usage.ts`](./high-level/advanced-usage.ts)  | Full `verifyEmail` orchestration with every flag     |
| [`high-level/domain-suggestion.ts`](./high-level/domain-suggestion.ts) | Typo detection / closest-domain suggestion       |
| [`high-level/name-detection.ts`](./high-level/name-detection.ts)  | First/last name extraction from local-part           |

## Integrations

| File                                                  | Topic                                                |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [`integrations/algolia.ts`](./integrations/algolia.ts) | Pattern for plugging the validator into a search UI |

## CLI

| File                                       | What it shows                                         |
| ------------------------------------------ | ----------------------------------------------------- |
| [`cli-usage.md`](./cli-usage.md)           | `email-validate` recipes, flags, JSON log file shape, programmatic embedding |

## Serverless deployments

Deploy-ready scaffolding for the serverless build
(`@emailcheck/email-validator-js/serverless/*`). See
[../SERVERLESS.md](../SERVERLESS.md) for the full API surface, DNS resolver
patterns, KV write-through, and Durable Objects.

| Folder                                                                       | Platform                            |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| [`serverless/aws-lambda/`](./serverless/aws-lambda/)                         | AWS Lambda + Serverless Framework   |
| [`serverless/gcp/`](./serverless/gcp/)                                       | GCP Cloud Functions (2nd gen)       |
| [`serverless/vercel-edge/`](./serverless/vercel-edge/)                       | Vercel Edge Function                |
| [`serverless/cloudflare-worker/`](./serverless/cloudflare-worker/)           | Cloudflare Workers + Durable Object |
| [`serverless/netlify/`](./serverless/netlify/)                               | Netlify Functions                   |
| [`serverless/azure/`](./serverless/azure/)                                   | Azure Functions (v4 model)          |
| [`serverless/deno-deploy/`](./serverless/deno-deploy/)                       | Deno Deploy                         |
| [`serverless/browser/`](./serverless/browser/)                               | Browser-side (no Node APIs)         |

## Common patterns

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
  options: { ports: [25, 587], perAttemptTimeoutMs: 5000, captureTranscript: true },
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

## Contributing examples

If you add a new example:

1. Drop it into the topic folder that fits — `smtp/`, `cache/`, `high-level/`,
   `integrations/`, or `serverless/<platform>/`. New topic? Add the folder
   + one short row in this README.
2. Keep it self-contained — one runnable script, one topic.
3. Comment the *why*, not the *what* — readers can read the API, they want
   to know when to use it.
4. Run `bun run typecheck` before committing.
