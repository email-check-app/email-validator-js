# `email-validate` CLI — usage recipes

The `email-validate` binary ships with `@emailcheck/email-validator-js`. It
runs the full validation pipeline against one address, captures a structured
transcript, prints to stdout, and saves a JSON result to `./logs/` by default.

## Install

```bash
# Zero-install — run the published binary directly via npx / bunx / pnpm dlx
npx -p @emailcheck/email-validator-js email-validate alice@example.com
bunx -p @emailcheck/email-validator-js email-validate alice@example.com
pnpm dlx -p @emailcheck/email-validator-js email-validate alice@example.com

# Pin a version (recommended for CI / reproducible runs)
npx -p @emailcheck/email-validator-js@4.0.0 email-validate alice@example.com

# Globally
bun add -g @emailcheck/email-validator-js
# or npm i -g @emailcheck/email-validator-js
# or pnpm add -g @emailcheck/email-validator-js

# Per-project (use via `bunx` / `npx`)
bun add -d @emailcheck/email-validator-js
bunx email-validate alice@example.com
```

> The `-p <package>` flag is the safe form because the bin name
> (`email-validate`) differs from the package name
> (`@emailcheck/email-validator-js`). The shorthand
> `npx @emailcheck/email-validator-js alice@example.com` also works since the
> package publishes exactly one bin.

## Defaults

Out of the box the CLI runs:

- format / TLD validation
- MX record lookup
- live SMTP probe (port walk: 25 → 587 → 465, 5s timeout per port)
- disposable + free-provider list checks
- domain typo suggestion
- name detection from local-part
- transcript capture for every step
- writes a timestamped JSON result to `./logs/`

WHOIS age and registration are **off** by default (they're slow + add an
external dependency); enable with `--whois-age` and `--whois-registration`.

## Recipes

### One-off interactive check

```bash
email-validate alice@example.com
```

Prints a colored summary plus the per-step transcript table, and saves the
full JSON result to `./logs/email-validate-<UTC-timestamp>-<email>.json`.

### Fast format/MX-only check (no network beyond DNS)

```bash
email-validate alice@example.com --no-smtp
```

Skips the live SMTP probe. Useful when you're checking a list and don't want
to risk IP-reputation hits on the destination MTAs.

### JSON for tooling

```bash
email-validate alice@example.com --format json --quiet --no-log-file | jq
```

`--quiet --no-log-file` suppresses extra stdout and skips the log write — you
get one JSON line on stdout, period.

### Shell scripting with exit codes

```bash
if email-validate "$EMAIL" --quiet --no-log-file > /dev/null; then
  echo "$EMAIL is OK"
else
  echo "$EMAIL failed validation"
fi
```

Exit codes:

| code | meaning |
| ---- | ------- |
| 0    | format/MX OK and (if probed) deliverable |
| 1    | invalid format / no MX / undeliverable / SMTP probed-but-indeterminate |
| 2    | bad CLI arguments |

### Full domain reputation check

```bash
email-validate alice@suspicious-domain.example \
  --whois-age \
  --whois-registration \
  --whois-timeout 8000
```

Adds two WHOIS lookups to the pipeline. The transcript will include
`whois-age` and `whois-registration` steps with the parsed creation date,
expiration date, registrar, and lock status.

### Single SMTP port + custom HELO

```bash
email-validate alice@example.com \
  --port 587 \
  --hostname mta.acme.com \
  --timeout 8000
```

Useful when a destination MX rejects the default `localhost` HELO or only
accepts STARTTLS on port 587.

### Custom port walk

```bash
email-validate alice@example.com --ports 587,465
```

CSV form. The probe attempts each port in order and short-circuits on the
first one that yields a deterministic answer.

### Custom log path

```bash
email-validate alice@example.com --log-dir /var/log/email-validation
```

The directory is created (recursively) if it doesn't exist. Each run writes a
new file named `email-validate-<UTC-timestamp>-<sanitized-email>.json`.

### Disable file logs (stdout-only)

```bash
email-validate alice@example.com --no-log-file
```

### Debug mode

```bash
email-validate alice@example.com --debug --format pretty
```

`--debug` enables verbose console logging from the library during the run, on
top of the structured transcript that's already captured. Useful when you
want to see the SMTP wire-level chatter live.

## Output formats

| `--format` | What you get                                                    |
| ---------- | --------------------------------------------------------------- |
| `pretty`   | (default) Colored summary + per-step transcript table           |
| `text`     | Plain ASCII verdict + key=value pairs, one per line             |
| `json`     | Single JSON line with the full `VerificationResult`             |

## Reading the JSON log file

Each log file is a `VerificationResult` (see the type in
[src/types.ts](../src/types.ts)). With `captureTranscript: true` (the CLI
default), `result.transcript` is a `VerificationStep[]` covering every
subsystem. The SMTP step includes the wire-level transcript:

```json
{
  "email": "alice@example.com",
  "validFormat": true,
  "validMx": true,
  "validSmtp": true,
  "isDisposable": false,
  "isFree": false,
  "metadata": { "verificationTime": 412, "cached": false },
  "transcript": [
    { "kind": "syntax", "durationMs": 0, "ok": true, "details": { "ok": true } },
    { "kind": "domain-validation", "durationMs": 1, "ok": true, "details": { "domain": "example.com", "valid": true } },
    { "kind": "mx-lookup", "durationMs": 28, "ok": true, "details": { "domain": "example.com", "records": ["mx.example.com"], "count": 1 } },
    {
      "kind": "smtp-probe",
      "durationMs": 380,
      "ok": true,
      "details": {
        "cacheHit": false,
        "port": 25,
        "verdict": "deliverable",
        "transcript": [
          "25|s| 220 mx.example.com ESMTP",
          "25|s| 250-mx.example.com Hello",
          "25|s| 250 OK",
          "25|s| 250 sender ok",
          "25|s| 250 recipient ok"
        ],
        "commands": [
          "25|c| EHLO localhost",
          "25|c| MAIL FROM:<alice@example.com>",
          "25|c| RCPT TO:<alice@example.com>"
        ]
      }
    }
  ]
}
```

## Programmatic embedding

The CLI parser, formatter, and runner are also exported as a module:

```typescript
import { parseArgs, run, exitCodeFor } from '@emailcheck/email-validator-js/cli';

// 1. Parse argv (same flag grammar as the binary)
const parsed = parseArgs(['user@example.com', '--no-smtp', '--format', 'json']);
if (parsed.kind === 'error') {
  console.error(parsed.messages.join('\n'));
  process.exit(parsed.exitCode);
}
if (parsed.kind === 'args') {
  // 2. Run with default deps (or inject your own writer / mocks for tests)
  const exitCode = await run(parsed);
  process.exit(exitCode);
}
```

`run()` accepts a `CliRunDeps` second argument so tests can swap out the
verifier, the file writer, the stdout/stderr writers, and `Date.now()`.
See [`__tests__/0701-cli-run.test.ts`](../__tests__/0701-cli-run.test.ts)
for examples.

## Full flag reference

```bash
email-validate --help
```

(Also available verbatim in [`src/cli/parse-args.ts`](../src/cli/parse-args.ts).)
