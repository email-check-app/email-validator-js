/**
 * CLI runner tests — black-box over `run()`. We inject a fake `verify` so we
 * never hit the real network, plus in-memory writers for stdout/stderr/file.
 */
import { describe, expect, it } from 'bun:test';
import type { ParsedArgs } from '../src/cli/parse-args';
import { exitCodeFor, logFileNameFor, run } from '../src/cli/run';
import type { VerificationResult } from '../src/types';

function defaultArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    email: 'alice@example.com',
    verifyMx: true,
    verifySmtp: false,
    checkDisposable: true,
    checkFree: true,
    suggestDomain: true,
    detectName: true,
    checkDomainAge: false,
    checkDomainRegistration: false,
    format: 'text',
    quiet: false,
    debug: false,
    captureTranscript: true,
    logDir: null,
    ...overrides,
  };
}

function deliverableResult(email = 'alice@example.com'): VerificationResult {
  return {
    email,
    validFormat: true,
    validMx: true,
    validSmtp: true,
    isDisposable: false,
    isFree: false,
    canConnectSmtp: true,
    isDeliverable: true,
    isDisabled: false,
    hasFullInbox: false,
    isCatchAll: false,
    metadata: { verificationTime: 12, cached: false },
  };
}

interface Capture {
  stdout: string[];
  stderr: string[];
  files: Record<string, string>;
  dirs: string[];
  args: ParsedArgs;
  verify: (params: unknown) => Promise<VerificationResult>;
}

function captureRun(args: Partial<ParsedArgs> = {}, result: VerificationResult = deliverableResult()): Capture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const files: Record<string, string> = {};
  const dirs: string[] = [];
  return {
    stdout,
    stderr,
    files,
    dirs,
    args: defaultArgs(args),
    verify: async () => result,
  };
}

describe('0701 CLI run — verdict + exit code', () => {
  it('returns 0 for deliverable result', async () => {
    const cap = captureRun({}, deliverableResult());
    const code = await run(cap.args, {
      verify: cap.verify,
      stdout: (s) => cap.stdout.push(s),
      stderr: (s) => cap.stderr.push(s),
    });
    expect(code).toBe(0);
    expect(cap.stdout.join('\n')).toContain('DELIVERABLE');
  });

  it('returns 1 for invalid format', async () => {
    const result: VerificationResult = {
      ...deliverableResult(),
      email: 'not-an-email',
      validFormat: false,
      validMx: null,
      validSmtp: null,
      canConnectSmtp: undefined,
      isDeliverable: undefined,
    };
    const cap = captureRun({ email: 'not-an-email' }, result);
    const code = await run(cap.args, {
      verify: cap.verify,
      stdout: (s) => cap.stdout.push(s),
      stderr: (s) => cap.stderr.push(s),
    });
    expect(code).toBe(1);
    expect(cap.stdout.join('\n')).toContain('INVALID FORMAT');
  });

  it('returns 1 when MX missing', async () => {
    const cap = captureRun({}, { ...deliverableResult(), validMx: false, validSmtp: null, canConnectSmtp: undefined });
    const code = await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(code).toBe(1);
  });

  it('returns 1 when SMTP undeliverable', async () => {
    const cap = captureRun({}, { ...deliverableResult(), validSmtp: false, isDeliverable: false });
    const code = await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(code).toBe(1);
  });

  it('returns 1 when SMTP indeterminate (probed but no answer)', async () => {
    const cap = captureRun(
      {},
      { ...deliverableResult(), validSmtp: null, canConnectSmtp: false, isDeliverable: false }
    );
    const code = await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(code).toBe(1);
  });

  it('returns 0 when SMTP not probed but format/MX OK', async () => {
    const cap = captureRun(
      { verifySmtp: false },
      { ...deliverableResult(), validSmtp: null, canConnectSmtp: undefined, isDeliverable: undefined }
    );
    const code = await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(code).toBe(0);
  });
});

describe('0701 CLI run — output formats', () => {
  it('--format json emits a single JSON line', async () => {
    const cap = captureRun({ format: 'json' });
    await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(cap.stdout).toHaveLength(1);
    expect(() => JSON.parse(cap.stdout[0]!)).not.toThrow();
  });

  it('--format text is a multiline summary', async () => {
    const cap = captureRun({ format: 'text' });
    await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    const out = cap.stdout.join('\n');
    expect(out).toContain('format=true');
    expect(out).toContain('mx=true');
  });

  it('--quiet only emits the verdict line', async () => {
    const cap = captureRun({ quiet: true });
    await run(cap.args, { verify: cap.verify, stdout: (s) => cap.stdout.push(s), stderr: () => {} });
    expect(cap.stdout).toHaveLength(1);
    expect(cap.stdout[0]).toContain('DELIVERABLE');
  });
});

describe('0701 CLI run — log file', () => {
  it('writes JSON to logDir + ensures the dir exists', async () => {
    const cap = captureRun({ logDir: '/tmp/email-test-logs', quiet: true });
    await run(cap.args, {
      verify: cap.verify,
      stdout: (s) => cap.stdout.push(s),
      stderr: (s) => cap.stderr.push(s),
      writeFile: (p, c) => {
        cap.files[p] = c;
      },
      ensureDir: (p) => cap.dirs.push(p),
      now: () => new Date('2026-05-01T12:34:56Z'),
    });

    expect(cap.dirs).toContain('/tmp/email-test-logs');
    const written = Object.entries(cap.files);
    expect(written).toHaveLength(1);
    const [path, contents] = written[0]!;
    expect(path).toContain('email-validate-2026-05-01T123456Z-alice_example.com.json');
    expect(JSON.parse(contents).email).toBe('alice@example.com');
  });

  it('logDir=null skips file write entirely', async () => {
    const cap = captureRun({ logDir: null });
    await run(cap.args, {
      verify: cap.verify,
      stdout: (s) => cap.stdout.push(s),
      stderr: () => {},
      writeFile: (p, c) => {
        cap.files[p] = c;
      },
      ensureDir: (p) => cap.dirs.push(p),
    });
    expect(Object.keys(cap.files)).toHaveLength(0);
    expect(cap.dirs).toHaveLength(0);
  });

  it('continues without crashing if writeFile throws', async () => {
    const cap = captureRun({ logDir: '/tmp/x' });
    const code = await run(cap.args, {
      verify: cap.verify,
      stdout: (s) => cap.stdout.push(s),
      stderr: (s) => cap.stderr.push(s),
      writeFile: () => {
        throw new Error('disk full');
      },
      ensureDir: () => {},
    });
    expect(code).toBe(0); // run still returns the verdict code
    expect(cap.stderr.join('\n')).toContain('failed to write log');
  });
});

describe('0701 CLI run — log file naming', () => {
  it('sanitizes the email for safe filenames', () => {
    const name = logFileNameFor('alice+test@sub.example.com', new Date('2026-05-01T01:02:03Z'));
    expect(name).toBe('email-validate-2026-05-01T010203Z-alice_test_sub.example.com.json');
    expect(name).not.toMatch(/[+@]/);
  });

  it('preserves dots, underscores, hyphens', () => {
    const name = logFileNameFor('first.last_name-2@x.y.com', new Date('2026-05-01T00:00:00Z'));
    expect(name).toContain('first.last_name-2_x.y.com');
  });
});

describe('0701 CLI exitCodeFor', () => {
  it('handles every state', () => {
    const base = deliverableResult();
    expect(exitCodeFor(base)).toBe(0);
    expect(exitCodeFor({ ...base, validFormat: false })).toBe(1);
    expect(exitCodeFor({ ...base, validMx: false })).toBe(1);
    expect(exitCodeFor({ ...base, validSmtp: false })).toBe(1);
    // SMTP probed (canConnectSmtp set) but ended indeterminate → exit 1.
    expect(exitCodeFor({ ...base, validSmtp: null, canConnectSmtp: false })).toBe(1);
    // SMTP not probed at all (canConnectSmtp undefined) → fall through to 0.
    expect(exitCodeFor({ ...base, validSmtp: null, canConnectSmtp: undefined })).toBe(0);
  });
});
