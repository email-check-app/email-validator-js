/**
 * CLI flag parsing — black-box tests over the public `parseArgs` contract:
 *   - sensible defaults
 *   - --flag / --no-flag toggles
 *   - --flag value AND --flag=value syntactic forms
 *   - explicit error reporting + exit codes
 *   - help / version short-circuit
 */
import { describe, expect, it } from 'bun:test';
import { parseArgs } from '../src/cli/parse-args';

function assertArgs(
  result: ReturnType<typeof parseArgs>
): asserts result is { kind: 'args' } & ReturnType<typeof parseArgs> & { email: string } {
  if (result.kind !== 'args') throw new Error(`expected args, got ${result.kind}`);
}

describe('0700 CLI parseArgs — defaults', () => {
  it('with just an email, returns sensible defaults', () => {
    const out = parseArgs(['alice@example.com']);
    assertArgs(out);
    expect(out.email).toBe('alice@example.com');
    expect(out.verifyMx).toBe(true);
    expect(out.verifySmtp).toBe(true); // CLI default — interactive checks expect full validation
    expect(out.checkDisposable).toBe(true);
    expect(out.checkFree).toBe(true);
    expect(out.suggestDomain).toBe(true);
    expect(out.detectName).toBe(true);
    expect(out.checkDomainAge).toBe(false); // WHOIS off by default (slow)
    expect(out.checkDomainRegistration).toBe(false);
    expect(out.captureTranscript).toBe(true);
    expect(out.format).toBe('pretty');
    expect(out.logDir).toBe('./logs');
    expect(out.quiet).toBe(false);
    expect(out.debug).toBe(false);
  });
});

describe('0700 CLI parseArgs — boolean toggles', () => {
  it('--no-smtp turns SMTP off', () => {
    const out = parseArgs(['x@y.com', '--no-smtp']);
    assertArgs(out);
    expect(out.verifySmtp).toBe(false);
  });

  it('--no-mx turns MX off', () => {
    const out = parseArgs(['x@y.com', '--no-mx']);
    assertArgs(out);
    expect(out.verifyMx).toBe(false);
  });

  it('--whois-age and --whois-registration enable opt-in WHOIS', () => {
    const out = parseArgs(['x@y.com', '--whois-age', '--whois-registration']);
    assertArgs(out);
    expect(out.checkDomainAge).toBe(true);
    expect(out.checkDomainRegistration).toBe(true);
  });

  it('--no-detect-name disables name detection', () => {
    const out = parseArgs(['x@y.com', '--no-detect-name']);
    assertArgs(out);
    expect(out.detectName).toBe(false);
  });

  it('--no-transcript disables capture', () => {
    const out = parseArgs(['x@y.com', '--no-transcript']);
    assertArgs(out);
    expect(out.captureTranscript).toBe(false);
  });

  it('--no-log-file collapses logDir to null', () => {
    const out = parseArgs(['x@y.com', '--no-log-file']);
    assertArgs(out);
    expect(out.logDir).toBeNull();
  });

  it('--quiet + --debug both flip true', () => {
    const out = parseArgs(['x@y.com', '--quiet', '--debug']);
    assertArgs(out);
    expect(out.quiet).toBe(true);
    expect(out.debug).toBe(true);
  });
});

describe('0700 CLI parseArgs — value flags', () => {
  it('--port accepts a single integer', () => {
    const out = parseArgs(['x@y.com', '--port', '587']);
    assertArgs(out);
    expect(out.smtpPort).toBe(587);
  });

  it('--ports accepts a CSV list', () => {
    const out = parseArgs(['x@y.com', '--ports', '25,587,465']);
    assertArgs(out);
    expect(out.ports).toEqual([25, 587, 465]);
  });

  it('--timeout sets timeoutMs', () => {
    const out = parseArgs(['x@y.com', '--timeout', '8000']);
    assertArgs(out);
    expect(out.timeoutMs).toBe(8000);
  });

  it('--whois-timeout sets whoisTimeoutMs', () => {
    const out = parseArgs(['x@y.com', '--whois-timeout', '10000']);
    assertArgs(out);
    expect(out.whoisTimeoutMs).toBe(10000);
  });

  it('--hostname sets the EHLO hostname', () => {
    const out = parseArgs(['x@y.com', '--hostname', 'mta.acme.com']);
    assertArgs(out);
    expect(out.hostname).toBe('mta.acme.com');
  });

  it('--log-dir overrides the default', () => {
    const out = parseArgs(['x@y.com', '--log-dir', '/tmp/email-logs']);
    assertArgs(out);
    expect(out.logDir).toBe('/tmp/email-logs');
  });

  it('--format accepts text|json|pretty', () => {
    expect((parseArgs(['x@y.com', '--format', 'json']) as { format: string }).format).toBe('json');
    expect((parseArgs(['x@y.com', '--format', 'text']) as { format: string }).format).toBe('text');
    expect((parseArgs(['x@y.com', '--format', 'pretty']) as { format: string }).format).toBe('pretty');
  });

  it('--flag=value form works', () => {
    const out = parseArgs(['x@y.com', '--port=587', '--format=json']);
    assertArgs(out);
    expect(out.smtpPort).toBe(587);
    expect(out.format).toBe('json');
  });
});

describe('0700 CLI parseArgs — errors', () => {
  it('reports missing email', () => {
    const out = parseArgs([]);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.exitCode).toBe(2);
      expect(out.messages.some((m) => m.includes('Missing required argument'))).toBe(true);
    }
  });

  it('reports two emails', () => {
    const out = parseArgs(['a@b.com', 'c@d.com']);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.messages.some((m) => m.includes('Expected one email'))).toBe(true);
    }
  });

  it('rejects unknown flag', () => {
    const out = parseArgs(['x@y.com', '--mystery']);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.messages[0]).toContain('Unknown flag');
    }
  });

  it('rejects invalid port', () => {
    const out = parseArgs(['x@y.com', '--port', 'abc']);
    expect(out.kind).toBe('error');
  });

  it('rejects invalid format value', () => {
    const out = parseArgs(['x@y.com', '--format', 'xml']);
    expect(out.kind).toBe('error');
    if (out.kind === 'error') {
      expect(out.messages[0]).toContain('--format must be one of');
    }
  });

  it('rejects missing value for value flag', () => {
    const out = parseArgs(['x@y.com', '--port']);
    expect(out.kind).toBe('error');
  });

  it('rejects empty ports CSV', () => {
    const out = parseArgs(['x@y.com', '--ports', '']);
    expect(out.kind).toBe('error');
  });

  it('rejects negative port', () => {
    const out = parseArgs(['x@y.com', '--port', '-5']);
    expect(out.kind).toBe('error');
  });
});

describe('0700 CLI parseArgs — help / version', () => {
  it('--help short-circuits', () => {
    expect(parseArgs(['--help']).kind).toBe('help');
    expect(parseArgs(['-h']).kind).toBe('help');
  });

  it('--version short-circuits', () => {
    expect(parseArgs(['--version']).kind).toBe('version');
    expect(parseArgs(['-v']).kind).toBe('version');
  });

  it('--help wins even if a positional and other flags are present', () => {
    expect(parseArgs(['x@y.com', '--smtp', '--help']).kind).toBe('help');
  });
});
