/**
 * Minimal flag parser for the `email-validate` CLI.
 *
 * Accepts `argv` (everything after `node bin / email-validate`) and produces a
 * `ParsedArgs` shape, or throws a `CliArgError` with `messages[]` and an
 * `exitCode` for the caller to propagate.
 *
 * Why hand-rolled: the CLI surface is small (~15 flags), and pulling in
 * `commander` / `yargs` would balloon the published bundle for every consumer
 * regardless of whether they ever run the CLI. The trade-off is no
 * sub-command tree — just one flat command — which fits the tool fine.
 */

export interface ParsedArgs {
  /** Email address to validate (positional). */
  email: string;
  // SMTP / MX flags
  verifyMx: boolean;
  verifySmtp: boolean;
  ports?: number[];
  smtpPort?: number;
  hostname?: string;
  timeoutMs?: number;
  // Disposable / free / suggestion flags
  checkDisposable: boolean;
  checkFree: boolean;
  suggestDomain: boolean;
  detectName: boolean;
  // WHOIS flags
  checkDomainAge: boolean;
  checkDomainRegistration: boolean;
  whoisTimeoutMs?: number;
  // Output flags
  format: 'text' | 'json' | 'pretty';
  quiet: boolean;
  debug: boolean;
  captureTranscript: boolean;
  logDir: string | null; // null => no file, default './logs'
}

export interface ParsedHelp {
  kind: 'help';
}

export interface ParsedVersion {
  kind: 'version';
}

export interface CliArgError {
  kind: 'error';
  messages: string[];
  exitCode: number;
}

export type ParseResult = ({ kind: 'args' } & ParsedArgs) | ParsedHelp | ParsedVersion | CliArgError;

const HELP_TEXT = `email-validate <email> [options]

Run the full email-validator-js pipeline against one address. By default,
runs format / MX / SMTP probe / disposable / free-provider / typo-suggest /
name-detection, captures a structured transcript, prints it to stdout, and
writes the JSON result to ./logs/.

WHOIS lookups are off by default (they're slow); enable with --whois-age or
--whois-registration.

Options:
  --mx, --no-mx                  Resolve MX records                    (default: on)
  --smtp, --no-smtp              Run live SMTP probe                   (default: on)
  --disposable, --no-disposable  Check disposable-email list           (default: on)
  --free, --no-free              Check free-provider list              (default: on)
  --suggest-domain, --no-suggest-domain
                                 Suggest a corrected domain on typos   (default: on)
  --detect-name, --no-detect-name
                                 Extract first/last name from local    (default: on)
  --whois-age                    Look up domain creation date          (default: off)
  --whois-registration           Look up domain registration status    (default: off)

  --port <n>                     Force a single SMTP port (e.g. 587)
  --ports <n,n,...>              Comma-separated SMTP port walk        (default: 25,587,465)
  --hostname <name>              EHLO/HELO identity                    (default: localhost)
  --timeout <ms>                 SMTP timeout per port                 (default: 5000)
  --whois-timeout <ms>           WHOIS query timeout                   (default: 5000)

  --format <text|json|pretty>    Stdout format                         (default: pretty)
  --no-transcript                Skip the per-step transcript capture
  --log-dir <path>               Directory to write the JSON result    (default: ./logs)
  --no-log-file                  Skip writing the result file
  --quiet                        Print only the final verdict to stdout
  --debug                        Verbose console logging during the run

  -h, --help                     Show this help
  -v, --version                  Print version

Examples:
  # Quick interactive check — full pipeline, pretty output, log saved to ./logs
  email-validate alice@example.com

  # Skip the SMTP probe (fast, just format / MX / lists / typos)
  email-validate alice@example.com --no-smtp

  # Add WHOIS age + registration for full domain reputation picture
  email-validate alice@example.com --whois-age --whois-registration

  # Pipe JSON to jq for tooling
  email-validate alice@example.com --format json --quiet --no-log-file | jq

  # Silent verdict for shell scripting (exit code 0=ok, 1=undeliverable/invalid)
  email-validate alice@example.com --quiet --no-log-file
  if email-validate "$EMAIL" --quiet --no-log-file > /dev/null; then …

  # Pin the SMTP probe to one port + custom HELO + custom log path
  email-validate alice@example.com --port 587 --hostname mta.acme.com --log-dir /var/log/email

  # Debug a specific delivery quirk (full transcript + console logs)
  email-validate alice@example.com --debug --format pretty
`;

const TRUE_FLAGS = new Set([
  'mx',
  'smtp',
  'disposable',
  'free',
  'suggest-domain',
  'detect-name',
  'whois-age',
  'whois-registration',
  'transcript',
  'log-file',
  'quiet',
  'debug',
]);

const VALUE_FLAGS = new Set(['port', 'ports', 'hostname', 'timeout', 'whois-timeout', 'format', 'log-dir']);

/** Strip a leading `no-` prefix from a flag name; return the stripped name + the polarity. */
function splitNo(flag: string): { name: string; positive: boolean } {
  if (flag.startsWith('no-')) return { name: flag.slice(3), positive: false };
  return { name: flag, positive: true };
}

function parseIntOr(value: string, what: string, errors: string[]): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    errors.push(`Invalid ${what}: "${value}" (expected a positive integer)`);
    return undefined;
  }
  return n;
}

function parsePortsCsv(value: string, errors: string[]): number[] | undefined {
  const ports = value
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => parseIntOr(p, 'port', errors))
    .filter((n): n is number => n !== undefined);
  if (ports.length === 0) {
    errors.push(`--ports requires at least one valid port (got "${value}")`);
    return undefined;
  }
  return ports;
}

export function parseArgs(argv: readonly string[]): ParseResult {
  const errors: string[] = [];
  const positional: string[] = [];

  // CLI-friendly defaults — different from the library defaults because the
  // CLI is for interactive checks, where users want the full pipeline by
  // default. WHOIS is still opt-in (it's slow + adds an external dependency).
  const result: ParsedArgs = {
    email: '',
    verifyMx: true,
    verifySmtp: true,
    checkDisposable: true,
    checkFree: true,
    suggestDomain: true,
    detectName: true,
    checkDomainAge: false,
    checkDomainRegistration: false,
    format: 'pretty',
    quiet: false,
    debug: false,
    captureTranscript: true,
    logDir: './logs',
  };
  let logFile = true;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;

    // Positional (the email)
    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }

    if (token === '-h' || token === '--help') return { kind: 'help' };
    if (token === '-v' || token === '--version') return { kind: 'version' };

    if (!token.startsWith('--')) {
      errors.push(`Unknown short flag: "${token}"`);
      continue;
    }

    // Allow `--flag=value` form.
    const eqIdx = token.indexOf('=');
    const rawName = eqIdx === -1 ? token.slice(2) : token.slice(2, eqIdx);
    const inlineValue = eqIdx === -1 ? undefined : token.slice(eqIdx + 1);

    if (TRUE_FLAGS.has(rawName) || (rawName.startsWith('no-') && TRUE_FLAGS.has(rawName.slice(3)))) {
      const { name, positive } = splitNo(rawName);
      switch (name) {
        case 'mx':
          result.verifyMx = positive;
          break;
        case 'smtp':
          result.verifySmtp = positive;
          break;
        case 'disposable':
          result.checkDisposable = positive;
          break;
        case 'free':
          result.checkFree = positive;
          break;
        case 'suggest-domain':
          result.suggestDomain = positive;
          break;
        case 'detect-name':
          result.detectName = positive;
          break;
        case 'whois-age':
          result.checkDomainAge = positive;
          break;
        case 'whois-registration':
          result.checkDomainRegistration = positive;
          break;
        case 'transcript':
          result.captureTranscript = positive;
          break;
        case 'log-file':
          logFile = positive;
          break;
        case 'quiet':
          result.quiet = positive;
          break;
        case 'debug':
          result.debug = positive;
          break;
      }
      continue;
    }

    if (VALUE_FLAGS.has(rawName)) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined) {
        errors.push(`Flag --${rawName} requires a value`);
        continue;
      }
      switch (rawName) {
        case 'port': {
          const port = parseIntOr(value, 'port', errors);
          if (port !== undefined) result.smtpPort = port;
          break;
        }
        case 'ports': {
          const ports = parsePortsCsv(value, errors);
          if (ports) result.ports = ports;
          break;
        }
        case 'hostname':
          result.hostname = value;
          break;
        case 'timeout': {
          const ms = parseIntOr(value, '--timeout', errors);
          if (ms !== undefined) result.timeoutMs = ms;
          break;
        }
        case 'whois-timeout': {
          const ms = parseIntOr(value, '--whois-timeout', errors);
          if (ms !== undefined) result.whoisTimeoutMs = ms;
          break;
        }
        case 'format':
          if (value !== 'text' && value !== 'json' && value !== 'pretty') {
            errors.push(`--format must be one of text|json|pretty (got "${value}")`);
          } else {
            result.format = value;
          }
          break;
        case 'log-dir':
          result.logDir = value;
          break;
      }
      continue;
    }

    errors.push(`Unknown flag: "${token}"`);
  }

  if (!logFile) result.logDir = null;

  if (positional.length === 0) errors.push('Missing required argument: <email>');
  if (positional.length > 1) errors.push(`Expected one email, got ${positional.length}: ${positional.join(', ')}`);

  if (errors.length > 0) {
    return { kind: 'error', messages: errors, exitCode: 2 };
  }

  const [email] = positional;
  if (!email) return { kind: 'error', messages: ['Missing required argument: <email>'], exitCode: 2 };
  result.email = email;
  return { kind: 'args', ...result };
}

export function helpText(): string {
  return HELP_TEXT;
}
