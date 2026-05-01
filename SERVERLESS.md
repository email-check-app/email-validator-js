# Serverless usage

`@emailcheck/email-validator-js` ships a serverless-friendly subset that runs
without Node.js APIs (no `node:net`, no `node:dns`, no `node:tls`). It's
suitable for **AWS Lambda**, **Vercel Edge Functions**, **Cloudflare Workers**,
**Netlify Edge Functions**, and **Deno Deploy**.

If you need MX or SMTP, see the [Limitations](#limitations) section — those
require a DNS resolver or full Node.js, and have specific guidance per
platform.

## Table of contents

- [What's included vs excluded](#whats-included-vs-excluded)
- [Package entry points](#package-entry-points)
- [Core API — `validateEmailCore` / `validateEmailBatch`](#core-api)
- [Platform adapters](#platform-adapters)
  - [AWS Lambda](#aws-lambda)
  - [Vercel](#vercel)
  - [Cloudflare Workers](#cloudflare-workers)
  - [Netlify Edge Functions](#netlify-edge-functions)
  - [Deno Deploy](#deno-deploy)
- [DNS resolver injection (for MX checks)](#dns-resolver-injection)
- [Caching](#caching)
- [Bundle size](#bundle-size)
- [Limitations](#limitations)
- [Migrating from the Node.js API](#migrating-from-the-nodejs-api)

## What's included vs excluded

| Capability                        | Edge runtime | Node.js runtime |
| --------------------------------- | :----------: | :-------------: |
| Syntax check                      |      ✅      |       ✅        |
| Domain typo suggestion            |      ✅      |       ✅        |
| Disposable / free provider lists  |      ✅      |       ✅        |
| MX records (with `DNSResolver`)   |      ✅¹     |       ✅        |
| SMTP probe                        |      ❌      |       ✅        |
| WHOIS                             |      ❌      |       ✅        |
| Built-in in-memory `EdgeCache`    |      ✅      |       ✅        |
| Cloudflare KV write-through       |      ✅      |       N/A       |

¹ MX is only checked when you pass a `dnsResolver` instance — the adapters
don't bring one. See [DNS resolver injection](#dns-resolver-injection).

## Package entry points

The serverless build is published as separate entry points so you only pull in
what you need. Each one is bundled CJS + ESM.

```json
{
  "@emailcheck/email-validator-js/serverless":            "verifier + all adapters",
  "@emailcheck/email-validator-js/serverless/verifier":   "validateEmailCore, EdgeCache, types",
  "@emailcheck/email-validator-js/serverless/aws":        "AWS Lambda adapter",
  "@emailcheck/email-validator-js/serverless/vercel":     "Vercel Edge / Node adapter",
  "@emailcheck/email-validator-js/serverless/cloudflare": "Workers + Durable Objects"
}
```

Edge users should import the platform-specific subpath — it tree-shakes the
adapters they don't use.

## Core API

The whole serverless surface is built on two functions:

### `validateEmailCore(email, options?)`

Validates one email. Each step is independently flag-gated.

```typescript
import { validateEmailCore } from '@emailcheck/email-validator-js/serverless/verifier';

const result = await validateEmailCore('alice@gmial.com');
// {
//   valid: false,                   // overall verdict (syntax + typo + disposable + mx)
//   email: 'alice@gmial.com',
//   local: 'alice',
//   domain: 'gmial.com',
//   validators: {
//     syntax:     { valid: true },
//     typo:       { valid: false, suggestion: 'gmail.com' },
//     disposable: { valid: true },
//     free:       { valid: true }
//   }
// }
```

### `validateEmailBatch(emails, options?)`

Validates many emails with concurrency control (`options.batchSize`, default 10).

```typescript
import { validateEmailBatch } from '@emailcheck/email-validator-js/serverless/verifier';

const results = await validateEmailBatch(['a@gmail.com', 'b@gmial.com'], {
  validateTypo: true,
  batchSize: 25,
});
```

### `ValidateEmailOptions`

```typescript
interface ValidateEmailOptions {
  validateSyntax?: boolean;       // default: true
  validateTypo?: boolean;         // default: true
  validateDisposable?: boolean;   // default: true
  validateFree?: boolean;         // default: true
  validateMx?: boolean;           // default: false (also requires dnsResolver)
  validateSMTP?: boolean;         // ignored on edge — see Limitations
  skipCache?: boolean;            // default: false
  batchSize?: number;             // default: 10 (validateEmailBatch only)
  domainSuggesterOptions?: {
    threshold?: number;           // edit-distance threshold (default 2)
    customDomains?: string[];     // additional canonical domains
  };
  // Edge-specific extension:
  dnsResolver?: DNSResolver;      // see "DNS resolver injection"
}
```

### `EmailValidationResult`

```typescript
interface EmailValidationResult {
  valid: boolean;          // syntax + typo + disposable + mx all OK
  email: string;
  local?: string;
  domain?: string;
  validators: {
    syntax?:     { valid: boolean };
    typo?:       { valid: boolean; suggestion?: string };
    disposable?: { valid: boolean };
    free?:       { valid: boolean };
    mx?:         { valid: boolean; records?: string[]; error?: string };
    smtp?:       { valid: boolean; error?: string };
  };
}
```

> **`free` is informational, not a gate.** A free-provider email
> (`alice@gmail.com`) is still considered `valid: true` — the gating
> validators are syntax + typo + disposable + mx. The `valid: false` on
> `validators.free` is just a label.

## Platform adapters

Each adapter wraps `validateEmailCore` / `validateEmailBatch` with the
request/response shape that platform expects, plus CORS, JSON parsing, batch
limits (`MAX_BATCH_SIZE = 100`), and a `/health` endpoint.

The adapters share three routed paths (where applicable):

| Method   | Path                   | Body / Query                                    |
| -------- | ---------------------- | ----------------------------------------------- |
| `GET`    | `/health`              | —                                               |
| `POST`   | `/validate`            | `{ "email": "..." }`                            |
| `POST`   | `/validate/batch`      | `{ "emails": ["...", "..."] }` (max 100)        |

> Vercel's routed handler uses `/api/health`, `/api/validate`, `/api/validate/batch`
> to match the `app/api/*` convention.

### AWS Lambda

Three handler shapes are exported. Pick the one that matches your invocation
style.

```typescript
import {
  apiGatewayHandler, // legacy: API Gateway, no path routing
  lambdaHandler,     // direct invocation, no API Gateway envelope
  handler,           // routed: /health, /validate, /validate/batch
  cacheHandler,      // cache management: { action: 'clear' | 'stats' }
} from '@emailcheck/email-validator-js/serverless/aws';
```

#### Routed handler with API Gateway

```typescript
// handler.ts
export { handler } from '@emailcheck/email-validator-js/serverless/aws';
```

**`serverless.yml`:**

```yaml
service: email-validator
provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
functions:
  validate:
    handler: handler.handler
    events:
      - http: { path: /validate,        method: post, cors: true }
      - http: { path: /validate/batch,  method: post, cors: true }
      - http: { path: /health,          method: get,  cors: true }
```

**SAM template:**

```yaml
Resources:
  EmailValidator:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handler.handler
      Runtime: nodejs20.x
      Events:
        Validate:
          Type: Api
          Properties: { Path: /{proxy+}, Method: ANY }
```

#### Direct invocation (no HTTP gateway)

```typescript
import { lambdaHandler } from '@emailcheck/email-validator-js/serverless/aws';

const response = await lambdaHandler(
  { email: 'alice@example.com' },
  // a partial LambdaContext is fine — the adapter doesn't use most fields
  { functionName: 'fn', functionVersion: '1', awsRequestId: 'x', remainingTimeInMillis: 30000 },
);
// { success: true, data: { ... EmailValidationResult ... } }
```

#### Cache control

```typescript
import { cacheHandler } from '@emailcheck/email-validator-js/serverless/aws';

await cacheHandler({ action: 'clear' });   // wipe in-memory cache
await cacheHandler({ action: 'stats' });   // { size: number }
```

### Vercel

Three handler shapes for Vercel:

```typescript
import {
  edgeHandler,  // Web Request/Response, no path routing — body or query
  nodeHandler,  // Express-style req/res, for the Node.js runtime
  handler,      // routed Web handler: /api/health, /api/validate, /api/validate/batch
  config,       // { runtime: 'edge', regions: ['iad1'] } — re-export, can override
} from '@emailcheck/email-validator-js/serverless/vercel';
```

#### Edge function (App Router)

```typescript
// app/api/validate/route.ts
import { handler } from '@emailcheck/email-validator-js/serverless/vercel';

export const runtime = 'edge';

export async function GET(request: Request)  { return handler(request); }
export async function POST(request: Request) { return handler(request); }
```

#### Pages-router edge function

```typescript
// pages/api/validate.ts
import { edgeHandler, config } from '@emailcheck/email-validator-js/serverless/vercel';

export { config };          // { runtime: 'edge', regions: ['iad1'] }
export default edgeHandler;
```

#### Node.js runtime (Pages Router)

```typescript
// pages/api/validate.ts
import { nodeHandler } from '@emailcheck/email-validator-js/serverless/vercel';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function (req: VercelRequest, res: VercelResponse) {
  // Cast — the adapter's interface is Web-API-shaped enough for Vercel's req/res.
  return nodeHandler(req as never, res as never);
}
```

### Cloudflare Workers

```typescript
import worker, {
  workerHandler,        // (request, env, ctx) => Response — direct
  EmailValidatorDO,     // Durable Object class with /validate, /cache/clear, /cache/stats
} from '@emailcheck/email-validator-js/serverless/cloudflare';

export default worker;        // { fetch: workerHandler, workerHandler, EmailValidatorDO }
export { EmailValidatorDO };  // re-export for the binding
```

The Workers adapter accepts both `GET` and `POST` and reads optional flags
from the URL (`?email=...&validateTypo=true&validateMx=true`). When the
`EMAIL_CACHE` KV namespace is bound, it writes through to KV and short-circuits
on hit — using `ctx.waitUntil` so the write doesn't block the response.

#### `wrangler.toml`

```toml
name = "email-validator"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "EMAIL_CACHE"
id = "your-kv-namespace-id"

[[durable_objects.bindings]]
name = "EMAIL_VALIDATOR"
class_name = "EmailValidatorDO"
```

#### Workers (no DO)

```typescript
// src/worker.ts
export { default } from '@emailcheck/email-validator-js/serverless/cloudflare';
```

#### With Durable Objects

```typescript
// src/worker.ts
import { EmailValidatorDO } from '@emailcheck/email-validator-js/serverless/cloudflare';

export { EmailValidatorDO };

export default {
  async fetch(request: Request, env: { EMAIL_VALIDATOR: DurableObjectNamespace }) {
    const id = env.EMAIL_VALIDATOR.idFromName('global');
    return env.EMAIL_VALIDATOR.get(id).fetch(request);
  },
};
```

The DO supports `POST /validate`, `POST /cache/clear`, and `GET /cache/stats`.
Validation cache lives in DO instance memory (1000 entries, 1-hour TTL).

### Netlify Edge Functions

The Netlify runtime is V8 (Deno-based) and supports the Web API. Use
`validateEmailCore` directly:

```typescript
// netlify/edge-functions/validate.ts
import { validateEmailCore } from '@emailcheck/email-validator-js/serverless/verifier';

export default async (request: Request) => {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response('email required', { status: 400 });

  const result = await validateEmailCore(email);
  return Response.json(result);
};

export const config = { path: '/api/validate' };
```

### Deno Deploy

```typescript
import { validateEmailCore } from 'npm:@emailcheck/email-validator-js/serverless/verifier';

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const email = new URL(req.url).searchParams.get('email');
    if (!email) return new Response('email required', { status: 400 });
    return Response.json(await validateEmailCore(email));
  }
  if (req.method === 'POST') {
    const { email, emails } = await req.json();
    if (email) return Response.json(await validateEmailCore(email));
    if (emails) {
      const { validateEmailBatch } = await import('npm:@emailcheck/email-validator-js/serverless/verifier');
      return Response.json(await validateEmailBatch(emails));
    }
  }
  return new Response('method not allowed', { status: 405 });
});
```

## DNS resolver injection

Edge runtimes don't ship `node:dns`. To resolve MX records on the edge, pass
your own `DNSResolver`:

```typescript
import {
  validateEmailCore,
  type DNSResolver,
} from '@emailcheck/email-validator-js/serverless/verifier';

class CloudflareDoHResolver implements DNSResolver {
  async resolveMx(domain: string) {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      { headers: { Accept: 'application/dns-json' } },
    ).then((r) => r.json() as Promise<{ Answer?: { data: string }[] }>);

    return (r.Answer ?? []).map((a) => {
      const [priority, exchange] = a.data.split(' ');
      return { exchange: exchange.replace(/\.$/, ''), priority: Number(priority) };
    });
  }
}

const result = await validateEmailCore('alice@example.com', {
  validateMx: true,
  dnsResolver: new CloudflareDoHResolver(),
});
// result.validators.mx === { valid: true, records: ['mx.example.com'] }
```

A `StubDNSResolver` is exported for tests — it returns a fixed answer.

> **Cloudflare Workers tip:** the runtime supports `connect()` for raw TCP, so
> a custom resolver against `1.1.1.1:53` is feasible. DoH (the example above)
> is the simplest path because `fetch` is already available.

## Caching

Each module instance has an in-memory `EdgeCache<EmailValidationResult>`
(default: 1000 entries, 1-hour TTL). On warm starts, repeat lookups for the
same address are O(1).

```typescript
import { validationCache, EdgeCache } from '@emailcheck/email-validator-js/serverless/verifier';

validationCache.size();   // current entry count
validationCache.clear();  // wipe

const myCache = new EdgeCache<{ ok: boolean }>(500, 60_000);  // 500 entries, 60s TTL
```

The Cloudflare adapter additionally supports a KV write-through layer when
you bind a namespace as `EMAIL_CACHE` — see the Workers section above.

To skip the in-memory cache for one call, pass `skipCache: true`.

## Bundle size

The bundles are aggressively tree-shaken; numbers below are approximate
production sizes (gzipped):

| Subpath                                             | Size  | Includes                                   |
| --------------------------------------------------- | ----- | ------------------------------------------ |
| `serverless/verifier`                               | ~50 KB | core + EdgeCache + lists                   |
| `serverless/aws`                                    | ~55 KB | core + AWS adapter                         |
| `serverless/vercel`                                 | ~55 KB | core + Vercel adapter                      |
| `serverless/cloudflare`                             | ~58 KB | core + Workers adapter + Durable Object    |
| `serverless` (umbrella — all adapters + verifier)   | ~65 KB | everything                                 |

The bulk of the size is the bundled disposable / free / common-domain JSON.
For a slimmer payload, deep-import only `serverless/verifier` and skip the
adapters.

## Limitations

| Feature           | Why it's missing on edge                                            |
| ----------------- | ------------------------------------------------------------------- |
| **SMTP probe**    | Needs `node:net` and `node:tls` — no equivalent in V8 isolates.     |
| **WHOIS**         | Needs raw TCP to port 43.                                           |
| **Native DNS**    | `node:dns` is unavailable. **Workaround:** inject a `DNSResolver` (see above). |
| **`net.isIP`**    | Only used inside the SMTP probe; doesn't affect the serverless surface. |

### Splitting the pipeline

A common pattern for full validation in serverless is a two-tier split:

1. **Edge** runs syntax + typo + disposable + free against `validateEmailCore`
   to filter out the obvious garbage cheaply (~5 ms).
2. **Node.js worker** (separate Lambda, container, or background job) runs the
   full `verifyEmail` pipeline including MX + SMTP for addresses that pass
   tier 1.

This keeps tier-1 latency low (every hit does the work) and tier-2 cost down
(only the survivors run the expensive checks).

## Migrating from the Node.js API

Both APIs are exported from the same package; the only changes are the import
path and that some checks aren't available on edge.

```diff
- import { verifyEmail } from '@emailcheck/email-validator-js';
+ import { validateEmailCore } from '@emailcheck/email-validator-js/serverless/verifier';

- const result = await verifyEmail({
-   emailAddress: 'alice@example.com',
-   verifyMx: true,
-   verifySmtp: true,
- });
+ const result = await validateEmailCore('alice@example.com', {
+   validateMx: true,
+   dnsResolver: new MyDnsResolver(),     // bring your own DNS
+   // SMTP not available on edge — see "Splitting the pipeline" above
+ });
```

The result shape **is different**:

| Node API (`verifyEmail`)               | Serverless (`validateEmailCore`)              |
| -------------------------------------- | --------------------------------------------- |
| `result.validFormat`                   | `result.validators.syntax?.valid`             |
| `result.validMx`                       | `result.validators.mx?.valid`                 |
| `result.validSmtp` / `isDeliverable`   | _(not available — splice in tier 2)_          |
| `result.isDisposable`                  | `!result.validators.disposable?.valid`        |
| `result.isFree`                        | `!result.validators.free?.valid`              |
| `result.suggestedDomain`               | `result.validators.typo?.suggestion`          |

Use whichever fits your platform — they share the same disposable / free /
typo data, so verdicts on overlapping checks match.
