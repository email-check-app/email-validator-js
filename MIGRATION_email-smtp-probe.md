# Migration prompt — `email-smtp-probe` → `@emailcheck/email-validator-js@^4`

You have an external project at `/Users/meabed/workspace/any-xyz/module-any-xyz-api/email-smtp-probe`
that holds its own fork of the SMTP probe under `src/vendor/smtp.ts` (~735
lines). The five behaviors that fork added — multi-MX iteration, catch-all
dual-probe, PIPELINING, `enhancedStatus` surfacing, operational metrics — now
ship in `@emailcheck/email-validator-js@4` directly. Time to delete the fork.

---

## Prompt for the consumer's coding agent

> You're working in `module-any-xyz-api/email-smtp-probe`. The library
> `@emailcheck/email-validator-js` published v4 with the SMTP correctness
> work the consumer has been carrying as a vendor fork. Migrate the consumer
> to use the library directly and delete the fork.
>
> ### Context (read first)
>
> Library v4 ships at `https://github.com/email-check-app/email-validator-js`.
> Relevant docs:
> - `src/smtp-verifier.ts` — the new probe with multi-MX + dual-probe + PIPELINING + enhancedStatus + metrics
> - `src/types.ts` — `SmtpVerificationResult`, `SmtpProbeMetrics`, `SMTPVerifyOptions`
> - `__tests__/unit/0114-smtp-features.test.ts` — black-box tests of every new feature
> - `CHANGELOG.md` v4.0.0 entry
>
> The library's `verifyMailboxSMTP` returns:
>
> ```ts
> {
>   smtpResult: SmtpVerificationResult;  // see src/types.ts — flat verdict object
>   cached: boolean;
>   port: number;
>   portCached: boolean;
> }
> ```
>
> Key fields on `smtpResult`:
> - `canConnectSmtp: boolean` — true if any MX×port responded with SMTP
> - `isDeliverable: boolean` — true on `250` / `251` (with catch-all caveat)
> - `isCatchAll: boolean` — true when both real + probe RCPT TO returned 250
> - `hasFullInbox: boolean` — true when reason was `over_quota`
> - `error?: string` — short reason vocabulary (see below)
> - `enhancedStatus?: string` — RFC 3463 X.Y.Z (e.g. `"5.1.1"`)
> - `responseCode?: number` — most recent 3-digit SMTP code
> - `metrics: SmtpProbeMetrics` — `{ mxAttempts, portAttempts, mxHostsTried, mxHostUsed?, totalDurationMs }`
> - `transcript?: string[]` — wire log when `captureTranscript: true`
> - `commands?: string[]` — sent commands when `captureTranscript: true`
>
> Reason vocabulary (the values that `smtpResult.error` can take):
>
>     valid | not_found | over_quota | temporary_failure | ambiguous |
>     high_volume | connection_error | connection_timeout | tls_error |
>     ehlo_failed | helo_failed | mail_from_rejected | no_greeting |
>     no_mx_records | unrecognized_response | step_timeout | sequence_complete
>
> ### What to do
>
> 1. **Bump the dep** in `package.json` to `"@emailcheck/email-validator-js": "^4"`.
>    Run the package manager (`bun install` or `npm install`) to refresh
>    `bun.lock` / `package-lock.json`.
>
> 2. **Delete the vendor fork**: `rm -rf src/vendor/smtp.ts`. Do NOT delete
>    `src/vendor/providers.ts` — the library does not ship provider detection.
>    Keep that helper module if you need it elsewhere.
>
> 3. **Update `src/handler-core.ts` to import from the library:**
>
>    ```diff
>    - import { SMTPStep, verifyMailboxSMTP } from './vendor/smtp';
>    + import { SMTPStep, verifyMailboxSMTP } from '@emailcheck/email-validator-js';
>    ```
>
> 4. **Re-shape the result** consumed by `runProbe`. The library returns
>    `{ smtpResult, cached, port, portCached }` instead of a flat
>    `SmtpProbeOutcome`. Update the call site:
>
>    ```diff
>    - const out = await verifyMailboxSMTP({ ... });
>    -
>    - const response: ProbeResponse = {
>    -   validSmtp: out.result,
>    -   port: out.port,
>    -   durationMs: Date.now() - startedAt,
>    -   source,
>    -   cached: false,
>    -   reason: out.reason,
>    -   responseCode: out.responseCode,
>    -   enhancedStatus: out.enhancedStatus,
>    -   ...(out.isCatchAll !== undefined && { isCatchAll: out.isCatchAll }),
>    -   ...(out.provider && { provider: out.provider }),
>    -   metrics: out.metrics,
>    -   ...(debug && { transcript: out.transcript, commands: out.commands }),
>    - };
>    + const out = await verifyMailboxSMTP({
>    +   local: req.local,
>    +   domain: req.domain,
>    +   mxRecords: req.mxRecords,
>    +   options: {
>    +     timeout: timeoutMs,
>    +     ports,
>    +     hostname: helo,
>    +     debug,
>    +     captureTranscript: debug,  // explicit opt-in for transcript fields
>    +     ...(sequence && { sequence }),
>    +   },
>    + });
>    + const r = out.smtpResult;
>    +
>    + // Reconstruct the consumer's tri-state validSmtp from the library's flat shape.
>    + const validSmtp: boolean | null = r.canConnectSmtp ? r.isDeliverable : null;
>    +
>    + const provider = detectProvider(req.mxRecords[0]);  // from your local providers.ts
>    +
>    + const response: ProbeResponse = {
>    +   validSmtp,
>    +   port: out.port,
>    +   durationMs: Date.now() - startedAt,
>    +   source,
>    +   cached: false,
>    +   reason: r.error ?? 'valid',
>    +   responseCode: r.responseCode ?? null,
>    +   enhancedStatus: r.enhancedStatus ?? null,
>    +   ...(r.isCatchAll !== undefined && { isCatchAll: r.isCatchAll }),
>    +   ...(provider !== 'unknown' && { provider }),
>    +   metrics: r.metrics,
>    +   ...(debug && r.transcript && { transcript: r.transcript, commands: r.commands ?? [] }),
>    + };
>    ```
>
>    Note `captureTranscript: debug` — the library doesn't include the
>    transcript array on the result by default (it has a memory cost), so
>    pass that flag through when the consumer wants the trace.
>
> 5. **Provider detection stays local.** The library doesn't ship
>    `detectProvider` / `getProviderConfig`. Keep `src/vendor/providers.ts`,
>    but it no longer needs to be wired through `verifyMailboxSMTP`'s
>    options — the library has sensible defaults. If you want provider-
>    specific timeouts or port preferences, derive them yourself from
>    `detectProvider(req.mxRecords[0])` and pass them to the library:
>
>    ```ts
>    const provider = detectProvider(req.mxRecords[0]);
>    const cfg = getProviderConfig(provider);
>    const out = await verifyMailboxSMTP({
>      local: req.local,
>      domain: req.domain,
>      mxRecords: req.mxRecords,
>      options: {
>        timeout: req.timeoutMs ?? cfg.timeoutMs ?? 5000,
>        ports: req.ports ?? cfg.preferredPorts ?? [25, 587, 465],
>        hostname: helo,
>        debug,
>        captureTranscript: debug,
>      },
>    });
>    ```
>
> 6. **Reason vocabulary changes.** The library's vocabulary is slightly
>    different from the fork's. Audit `src/schema.ts`'s `reason` examples
>    and the consumer's downstream consumers (API contract, dashboards,
>    log-search queries):
>
>    - `connect_throw:<message>` is gone — synchronous net/tls.connect
>      throws now resolve with `connection_error`, same key as async
>      failures. If your dashboards filtered on the `connect_throw:`
>      prefix, those filters become no-ops; consolidate them into
>      `connection_error`.
>    - `mailbox_does_not_exist`, `mailbox_disabled`, `mailbox_full`,
>      `delivery_not_authorized` etc. (the fork's
>      `refineReasonByEnhancedStatus` output) **now ship in the library**:
>      ```ts
>      import { refineReasonByEnhancedStatus } from '@emailcheck/email-validator-js';
>      const refined = refineReasonByEnhancedStatus(r.error, r.enhancedStatus);
>      ```
>      Pipe `r.error` and `r.enhancedStatus` through it instead of
>      copying the helper from the fork. Mappings cover the same RFC
>      3463 codes the fork used; codes not in the table return the
>      original reason unchanged.
>
> 7. **STARTTLS handling — already in the default sequence.** The library
>    walks `greeting → EHLO → STARTTLS → MAIL FROM → RCPT TO` by default.
>    STARTTLS auto-upgrades when the MX advertises support and is a
>    no-op on implicit-TLS port 465. Pass `startTls: 'never'` to skip,
>    `'force'` for testing, or leave the default `'auto'`. No need to
>    build a custom sequence for the upgrade — the consumer's
>    `defaultSteps = [greeting, ehlo, startTls, mailFrom, rcptTo]` line
>    can go away entirely.
>
>    For the simple case (just override MAIL FROM), pass `sequence.from`:
>
>    ```ts
>    const sequence = fromEmail ? { from: `<${fromEmail}>` } as SMTPSequence : undefined;
>    ```
>
>    Don't pass `steps: []` — that disables the dialogue entirely.
>
> 8. **Test surface.** Run the consumer's test suite. Tests that scripted
>    a 4-line single-RCPT envelope need 2 more lines (probe RCPT response
>    + RSET response) — same pattern as the library's own tests.
>    Reference: `__tests__/unit/0107-socket-mock.test.ts` for the
>    canonical dual-probe envelope script.
>
> 9. **Deletables.** After the migration:
>
>    - `src/vendor/smtp.ts` — DELETE
>    - `src/vendor/providers.ts` — KEEP (provider detection stays local)
>    - Any helper that wrapped `parseDsn` / `extractEnhancedStatus` /
>      `dsnToString` from the fork — DELETE; the library exposes
>      `parseDsn` if needed (it doesn't expose `dsnToString` — but
>      `${parsed.class}.${parsed.subject}.${parsed.detail}` is one line).
>    - Any `ProbeMetrics` type definition the consumer imported from
>      the fork — replace with `import type { SmtpProbeMetrics } from
>      '@emailcheck/email-validator-js'`.
>
> 10. **Verify by running** `bun run test` (or your package manager's
>     equivalent) and a smoke probe against a known-good MX
>     (`gmail-smtp-in.l.google.com`). Confirm:
>
>     - `result.metrics.mxHostUsed` matches the MX you reached
>     - `result.enhancedStatus` is set on 5xx replies
>     - `result.isCatchAll` is `false` for a real Gmail address (Gmail
>       rejects random local-parts)
>     - `result.transcript` is populated only when `debug: true`
>
> ### Expected line-count delta
>
> | File | Before | After | Delta |
> | --- | ---: | ---: | ---: |
> | `src/vendor/smtp.ts` | ~735 | 0 | -735 |
> | `src/handler-core.ts` | ~117 | ~95 | -22 |
> | `src/schema.ts` | (unchanged) | (unchanged) | 0 |
> | `src/vendor/providers.ts` | ~150 | ~150 | 0 |
>
> Net: ~750 fewer lines in the consumer for the same behavior.

---

## Quick reference — field mapping

| Old (fork's `SmtpProbeOutcome`)              | New (library's `SmtpVerificationResult`)                       |
| -------------------------------------------- | -------------------------------------------------------------- |
| `out.result`                                 | `out.smtpResult.canConnectSmtp ? out.smtpResult.isDeliverable : null` |
| `out.reason`                                 | `out.smtpResult.error ?? 'valid'`                               |
| `out.port`                                   | `out.port` *(still on outer object)*                           |
| `out.responseCode`                           | `out.smtpResult.responseCode`                                  |
| `out.enhancedStatus`                         | `out.smtpResult.enhancedStatus`                                |
| `out.isCatchAll`                             | `out.smtpResult.isCatchAll`                                    |
| `out.provider`                               | not shipped — derive locally with your `detectProvider`        |
| `out.metrics`                                | `out.smtpResult.metrics`                                       |
| `out.transcript` / `out.commands`            | `out.smtpResult.transcript` / `.commands` (when `captureTranscript: true`) |

## Things the library now does that the fork used to

| Feature                         | Library behavior                                                |
| ------------------------------- | --------------------------------------------------------------- |
| Multi-MX iteration              | Always on (was a flag in the fork)                              |
| Catch-all dual-probe            | Always on; `catchAllProbeLocal` callback overrides random local |
| PIPELINING                      | `'auto'` default; `'never'` / `'force'` for tests               |
| `enhancedStatus` (RFC 3463)     | Always populated when MX returns a DSN                          |
| `metrics`                       | Always populated                                                |
| Synchronous-throw safety        | `connect_throw:*` reasons collapsed to `connection_error`       |
| Invalid-port filtering          | Done at boundary; `RangeError` no longer leaks                  |
| Null `mxRecords`                | Coerced to `[]`; resolves with `error: 'no_mx_records'`         |

## Things the library does NOT do (keep doing in the consumer)

| Feature                          | Where to keep it                                       |
| -------------------------------- | ------------------------------------------------------ |
| Provider detection / config      | `src/vendor/providers.ts`                              |
| Cache wrapping                   | `TinyLRU` in `src/cache.ts` (request-level cache)      |

## Things the library now ships (delete the fork's copy)

| Feature                          | Library export                                          |
| -------------------------------- | ------------------------------------------------------- |
| STARTTLS upgrade in default flow | Always-on; control via `options.startTls: 'auto' / 'never' / 'force'` |
| Reason refinement via DSN        | `refineReasonByEnhancedStatus(reason, enhancedStatus)`  |
| Synchronous-throw normalization  | All connect-time throws resolve as `connection_error`   |
