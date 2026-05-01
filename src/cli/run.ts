/**
 * CLI runner — turns ParsedArgs into a verifyEmail invocation, formats the
 * output, and optionally writes the structured result to a log file.
 *
 * Returns the process exit code:
 *   0 — deliverable / format-and-MX OK / no SMTP probe asked for
 *   1 — undeliverable / no MX records / invalid format / indeterminate
 *   2 — bad CLI arguments (handled in `index.ts` before reaching here)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyEmail } from '../index';
import type { VerificationResult } from '../types';
import { formatJson, formatPretty, formatText, verdictLine } from './format';
import type { ParsedArgs } from './parse-args';

export interface CliRunDeps {
  /** Allow tests to inject a custom verifier — defaults to the real one. */
  verify?: typeof verifyEmail;
  /** Write a string to the given path. Defaults to fs.writeFileSync. */
  writeFile?: (path: string, contents: string) => void;
  /** Ensure a directory exists. Defaults to fs.mkdirSync(recursive). */
  ensureDir?: (path: string) => void;
  /** stdout / stderr writers — tests inject in-memory buffers. */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Used to build the log filename — tests pin it for determinism. */
  now?: () => Date;
}

/** Build the timestamped log filename for an email + run time. */
export function logFileNameFor(email: string, when: Date): string {
  const safeEmail = email.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const stamp =
    `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}` +
    `T${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}Z`;
  return `email-validate-${stamp}-${safeEmail}.json`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export async function run(args: ParsedArgs, deps: CliRunDeps = {}): Promise<number> {
  const verify = deps.verify ?? verifyEmail;
  const stdout = deps.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = deps.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const writeFile = deps.writeFile ?? ((path, contents) => writeFileSync(path, contents, 'utf8'));
  const ensureDir = deps.ensureDir ?? ((path) => mkdirSync(path, { recursive: true }));
  const now = deps.now ?? (() => new Date());

  const result = await verify({
    emailAddress: args.email,
    verifyMx: args.verifyMx,
    verifySmtp: args.verifySmtp,
    timeout: args.timeoutMs ?? 5000,
    debug: args.debug,
    smtpPort: args.smtpPort,
    checkDisposable: args.checkDisposable,
    checkFree: args.checkFree,
    detectName: args.detectName,
    suggestDomain: args.suggestDomain,
    checkDomainAge: args.checkDomainAge,
    checkDomainRegistration: args.checkDomainRegistration,
    whoisTimeout: args.whoisTimeoutMs ?? 5000,
    captureTranscript: args.captureTranscript,
  });

  // Stdout output.
  if (args.quiet) {
    stdout(verdictLine(result));
  } else {
    switch (args.format) {
      case 'json':
        stdout(formatJson(result));
        break;
      case 'text':
        stdout(formatText(result));
        break;
      case 'pretty':
        stdout(formatPretty(result));
        break;
    }
  }

  // Optional file log.
  if (args.logDir) {
    try {
      const dir = resolve(args.logDir);
      ensureDir(dir);
      const path = resolve(dir, logFileNameFor(args.email, now()));
      writeFile(path, JSON.stringify(result, null, 2));
      if (!args.quiet) stderr(`Log written: ${path}`);
    } catch (error) {
      stderr(`Warning: failed to write log file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return exitCodeFor(result);
}

export function exitCodeFor(result: VerificationResult): number {
  if (!result.validFormat) return 1;
  if (result.validMx === false) return 1;
  if (result.validSmtp === false) return 1;
  // `canConnectSmtp` is the reliable "did we actually probe?" signal:
  //   undefined → SMTP not requested  →  exit 0 if format/MX OK
  //   false     → probed but couldn't connect  →  exit 1 (indeterminate)
  //   true      → probed and connected  →  validSmtp drives the verdict above
  const smtpProbed = result.canConnectSmtp !== undefined;
  if (smtpProbed && result.validSmtp === null) return 1;
  return 0;
}
