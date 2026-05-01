/**
 * Output formatters for the CLI. The runner picks one based on `--format`.
 *
 *   pretty  — colored, human-friendly summary + transcript table (default)
 *   text    — plain ASCII single-line verdict + KV pairs (for piping)
 *   json    — full `VerificationResult` as a single JSON line (for tooling)
 */
import type { VerificationResult, VerificationStep } from '../types';

/** Tiny ANSI color helpers — no chalk dependency. Disabled when stdout isn't a TTY. */
function colorize(): {
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
} {
  const enabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';
  const wrap = (open: string, close: string) => (s: string) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return {
    green: wrap('32', '39'),
    red: wrap('31', '39'),
    yellow: wrap('33', '39'),
    dim: wrap('2', '22'),
    bold: wrap('1', '22'),
  };
}

/** Single-line verdict, colored if the terminal supports it. */
export function verdictLine(result: VerificationResult): string {
  const c = colorize();
  if (result.validFormat === false) return c.red(`✗ INVALID FORMAT  ${result.email}`);
  if (result.validMx === false) return c.red(`✗ NO MX RECORDS  ${result.email}`);
  if (result.validSmtp === true) return c.green(`✓ DELIVERABLE     ${result.email}`);
  if (result.validSmtp === false) return c.red(`✗ UNDELIVERABLE   ${result.email}`);
  // `canConnectSmtp` is the reliable signal for "did we actually probe?":
  // undefined → SMTP step skipped; false → probed and couldn't connect.
  const smtpProbed = result.canConnectSmtp !== undefined;
  if (smtpProbed && result.validSmtp === null) return c.yellow(`? INDETERMINATE   ${result.email}`);
  return c.green(`✓ FORMAT/MX OK    ${result.email}  ${c.dim('(SMTP not probed)')}`);
}

export function formatJson(result: VerificationResult): string {
  return JSON.stringify(result);
}

export function formatText(result: VerificationResult): string {
  const lines: string[] = [];
  lines.push(verdictLine(result));
  lines.push(`  format=${result.validFormat} mx=${result.validMx} smtp=${result.validSmtp}`);
  lines.push(`  isDisposable=${result.isDisposable} isFree=${result.isFree}`);
  if (result.mxRecords?.length) lines.push(`  mxRecords=${result.mxRecords.join(', ')}`);
  if (result.domainSuggestion) lines.push(`  suggestion=${result.domainSuggestion.suggested}`);
  if (result.detectedName) {
    const { firstName, lastName, confidence } = result.detectedName;
    lines.push(`  detectedName=${firstName ?? '_'} ${lastName ?? '_'} (conf=${confidence.toFixed(2)})`);
  }
  if (result.metadata.error) lines.push(`  error=${result.metadata.error}`);
  lines.push(`  time=${result.metadata.verificationTime}ms cached=${result.metadata.cached}`);
  return lines.join('\n');
}

export function formatPretty(result: VerificationResult): string {
  const c = colorize();
  const lines: string[] = [];
  lines.push(verdictLine(result));
  lines.push('');

  // Summary block.
  lines.push(c.bold('Summary'));
  lines.push(`  ${c.dim('format:')}        ${formatBool(result.validFormat)}`);
  if (result.validMx !== null)
    lines.push(
      `  ${c.dim('MX records:')}    ${formatBool(result.validMx)}${result.mxRecords ? `  ${c.dim(result.mxRecords.join(', '))}` : ''}`
    );
  if (result.validSmtp !== null) lines.push(`  ${c.dim('SMTP:')}          ${formatBool(result.validSmtp)}`);
  lines.push(
    `  ${c.dim('disposable:')}    ${formatBool(!result.isDisposable)} ${c.dim(result.isDisposable ? '(domain on disposable list)' : '')}`
  );
  lines.push(
    `  ${c.dim('free provider:')} ${formatBool(!result.isFree)} ${c.dim(result.isFree ? '(domain on free list)' : '')}`
  );
  if (result.domainSuggestion) {
    lines.push(
      `  ${c.dim('suggestion:')}    ${c.yellow(result.domainSuggestion.suggested)} ${c.dim(`(conf=${result.domainSuggestion.confidence.toFixed(2)})`)}`
    );
  }
  if (result.detectedName) {
    const { firstName, lastName, confidence } = result.detectedName;
    lines.push(
      `  ${c.dim('detected name:')} ${[firstName, lastName].filter(Boolean).join(' ')} ${c.dim(`(conf=${confidence.toFixed(2)})`)}`
    );
  }
  if (result.domainAge) {
    lines.push(
      `  ${c.dim('domain age:')}    ${result.domainAge.ageInDays} days  ${c.dim(`(${result.domainAge.ageInYears.toFixed(1)} years)`)}`
    );
  }
  if (result.domainRegistration) {
    const r = result.domainRegistration;
    lines.push(
      `  ${c.dim('registration:')}  ${r.isRegistered ? c.green('registered') : c.red('available')}${r.isExpired ? ' ' + c.red('(expired)') : ''}${r.isLocked ? ' ' + c.dim('(locked)') : ''}`
    );
  }
  if (result.metadata.error) lines.push(`  ${c.dim('error:')}         ${c.red(result.metadata.error)}`);
  lines.push(
    `  ${c.dim('elapsed:')}       ${result.metadata.verificationTime} ms${result.metadata.cached ? ' ' + c.dim('(cached)') : ''}`
  );

  // Transcript block (if captured).
  if (result.transcript && result.transcript.length > 0) {
    lines.push('');
    lines.push(c.bold('Transcript'));
    for (const step of result.transcript) {
      lines.push(`  ${formatStep(step, c)}`);
    }
  }

  return lines.join('\n');
}

function formatBool(value: boolean | null): string {
  const c = colorize();
  if (value === true) return c.green('✓');
  if (value === false) return c.red('✗');
  return c.dim('—');
}

function formatStep(step: VerificationStep, c: ReturnType<typeof colorize>): string {
  const okMark = step.ok ? c.green('✓') : c.red('✗');
  const time = `${step.durationMs}ms`.padStart(6);
  const detail = formatStepDetail(step);
  return `${okMark} ${c.dim(time)}  ${c.bold(step.kind.padEnd(20))}  ${detail}`;
}

function formatStepDetail(step: VerificationStep): string {
  const d = step.details;
  switch (step.kind) {
    case 'syntax':
      return `ok=${String(d.ok)}`;
    case 'domain-validation':
      return `domain=${String(d.domain)} valid=${String(d.valid)}`;
    case 'name-detection':
      return d.detected ? `detected ${JSON.stringify(d.detected)}` : 'no name detected';
    case 'domain-suggestion':
      return d.suggestion ? `→ ${JSON.stringify(d.suggestion)}` : 'no suggestion';
    case 'disposable':
      return `domain=${String(d.domain)} isDisposable=${String(d.isDisposable)}`;
    case 'free':
      return `domain=${String(d.domain)} isFree=${String(d.isFree)}`;
    case 'mx-lookup':
      return `domain=${String(d.domain)} count=${String(d.count)}`;
    case 'smtp-probe':
      return d.cacheHit
        ? `cache hit verdict=${String(d.verdict)}`
        : `port=${String(d.port)} verdict=${String(d.verdict)}${d.error ? ` error=${String(d.error)}` : ''}`;
    case 'whois-age':
      return d.found ? `found created=${String(d.creationDate)} ageDays=${String(d.ageInDays)}` : 'not found';
    case 'whois-registration':
      return d.found
        ? `registered=${String(d.isRegistered)} expired=${String(d.isExpired)} locked=${String(d.isLocked)}`
        : 'not found';
  }
}
