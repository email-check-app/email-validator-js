/**
 * SMTP mailbox probe.
 *
 * Walks the standard MX dialogue:
 *   greeting → EHLO → MAIL FROM → RCPT TO
 *
 * Captures the verdict (`canConnectSmtp / isDeliverable / hasFullInbox / …`)
 * plus an optional debug transcript. The connection state machine lives in
 * the `SMTPProbeConnection` class — one instance per port attempt — so each
 * variable has a clear owner instead of being shared via closure mutation.
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import { getCacheStore } from './cache';
import type { SMTPSequence, SMTPTLSConfig, SmtpVerificationResult, VerifyMailboxSMTPParams } from './types';
import { EmailProvider, SMTPStep } from './types';

const DEFAULT_PORTS = [25, 587, 465]; // plain → STARTTLS-able → implicit-TLS
const DEFAULT_TIMEOUT_MS = 3000;
/** ms to wait for QUIT to drain before forcibly destroying the socket. */
const QUIT_DRAIN_MS = 100;

/** Implicit-TLS map. Plain ports advertise STARTTLS via EHLO; we do not auto-upgrade. */
const PORT_TLS: Record<number, boolean> = { 25: false, 587: false, 465: true };

/** True for IPv4 / IPv6 in any form (compressed, mapped, mixed). */
const isIPAddress = (host: string): boolean => net.isIP(host) !== 0;

export interface ParsedDsn {
  /** 2 = success, 4 = transient, 5 = permanent */
  class: number;
  /** 1 addressing, 2 mailbox, 3 mail-system, 4 network, 5 protocol, 6 message, 7 security/policy */
  subject: number;
  detail: number;
}

/**
 * Parse an RFC 3463 enhanced status code at the start of an SMTP reply.
 * Examples: "550 5.1.1 user unknown" → {5,1,1}; "421 4.7.0 try later" → {4,7,0}.
 */
export function parseDsn(reply: string): ParsedDsn | null {
  const match = reply.match(/^\d{3}[ -](\d)\.(\d{1,3})\.(\d{1,3})\b/);
  if (!match) return null;
  return { class: Number(match[1]), subject: Number(match[2]), detail: Number(match[3]) };
}

/** True when the DSN code identifies a policy/reputation block, not a mailbox verdict. */
function isPolicyBlock(reply: string): boolean {
  const dsn = parseDsn(reply);
  return dsn?.class === 5 && dsn?.subject === 7;
}

const HIGH_VOLUME_RE =
  /(high number of|our system has detected unusual activity|contact your service provider for support|\[irr\])/i;
const OVER_QUOTA_RE = /(over quota)/i;
const INVALID_MAILBOX_PREFIX_RE = /^(510|511|513|550|551|553)/;
const INVALID_MAILBOX_FALSE_POSITIVE_RE = /(junk|spam|openspf|spoofing|host|rbl.+blocked)/i;
const MULTILINE_RE = /^\d{3}-/;

const isHighVolume = (reply: string): boolean => HIGH_VOLUME_RE.test(reply);
const isOverQuota = (reply: string): boolean => OVER_QUOTA_RE.test(reply);

function isInvalidMailboxError(reply: string): boolean {
  if (!INVALID_MAILBOX_PREFIX_RE.test(reply)) return false;
  if (INVALID_MAILBOX_FALSE_POSITIVE_RE.test(reply)) return false;
  if (isPolicyBlock(reply)) return false;
  return true;
}

/**
 * Public entry point. Tries each port in order and returns the first port that
 * yields a deterministic answer (deliverable / not-deliverable / over-quota).
 * If every port is indeterminate, returns the most recent failure reason.
 *
 * When `options.captureTranscript === true`, the returned `SmtpVerificationResult`
 * carries `transcript` and `commands` arrays prefixed with `<port>|s| …` for
 * server lines and `<port>|c| …` for our commands. The arrays aggregate across
 * every port attempted, so a debug session shows why earlier ports failed
 * before a later port answered.
 */
export async function verifyMailboxSMTP(
  params: VerifyMailboxSMTPParams
): Promise<{ smtpResult: SmtpVerificationResult; cached: boolean; port: number; portCached: boolean }> {
  const { local, domain, mxRecords = [], options = {} } = params;
  const ports = options.ports ?? DEFAULT_PORTS;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const tlsConfig = options.tls ?? true;
  const hostname = options.hostname ?? 'localhost';
  const debug = options.debug ?? false;
  const captureTranscript = options.captureTranscript ?? false;
  const sequence = options.sequence;
  const cache = options.cache;
  const log = debug ? (...args: unknown[]) => console.log('[SMTP]', ...args) : () => {};

  if (mxRecords.length === 0) {
    log('No MX records found');
    return { smtpResult: failureResult('No MX records found'), cached: false, port: 0, portCached: false };
  }

  const mxHost = mxRecords[0]!;
  log(`Verifying ${local}@${domain} via ${mxHost}`);

  // Aggregate transcript across port attempts for caller-side debugging.
  const transcript: string[] = [];
  const commands: string[] = [];

  // Cache short-circuits.
  const verdictCache = cache ? getCacheStore<SmtpVerificationResult>(cache, 'smtp') : null;
  const verdictKey = `${mxHost}:${local}@${domain}`;
  if (verdictCache) {
    const cachedResult = await safeCacheGet(verdictCache, verdictKey);
    if (cachedResult) {
      log(`Using cached SMTP result: ${cachedResult.isDeliverable}`);
      return { smtpResult: cachedResult, cached: true, port: 0, portCached: false };
    }
  }

  const portCache = cache ? getCacheStore<number>(cache, 'smtpPort') : null;
  if (portCache) {
    const cachedPort = await safeCacheGet(portCache, mxHost);
    if (cachedPort) {
      log(`Using cached port: ${cachedPort}`);
      const probe = await runProbe({
        mxHost,
        port: cachedPort,
        local,
        domain,
        timeout,
        tlsConfig,
        hostname,
        sequence,
        log,
      });
      collectTranscript(transcript, commands, probe, cachedPort);
      const smtpResult = toSmtpVerificationResult(
        probe.result,
        captureTranscript ? { transcript, commands } : undefined
      );
      await safeCacheSet(verdictCache, verdictKey, smtpResult);
      return { smtpResult, cached: false, port: cachedPort, portCached: true };
    }
  }

  // Walk ports in order.
  for (const port of ports) {
    log(`Testing port ${port}`);
    const probe = await runProbe({ mxHost, port, local, domain, timeout, tlsConfig, hostname, sequence, log });
    collectTranscript(transcript, commands, probe, port);
    const smtpResult = toSmtpVerificationResult(probe.result, captureTranscript ? { transcript, commands } : undefined);
    await safeCacheSet(verdictCache, verdictKey, smtpResult);
    if (probe.result !== null) {
      await safeCacheSet(portCache, mxHost, port);
      return { smtpResult, cached: false, port, portCached: false };
    }
  }

  log('All ports failed');
  return {
    smtpResult: {
      ...failureResult('All SMTP connection attempts failed'),
      ...(captureTranscript ? { transcript: [...transcript], commands: [...commands] } : {}),
    },
    cached: false,
    port: 0,
    portCached: false,
  };
}

function collectTranscript(transcript: string[], commands: string[], probe: ProbeResult, port: number): void {
  for (const line of probe.transcript) transcript.push(`${port}|s| ${line}`);
  for (const cmd of probe.commands) commands.push(`${port}|c| ${cmd}`);
}

function failureResult(error: string): SmtpVerificationResult {
  return {
    canConnectSmtp: false,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: false,
    isDisabled: false,
    error,
    providerUsed: EmailProvider.everythingElse,
    checkedAt: Date.now(),
  };
}

function toSmtpVerificationResult(
  result: boolean | null,
  capture?: { transcript: string[]; commands: string[] }
): SmtpVerificationResult {
  // The verifier resolves to one of three states; map each directly. The old
  // implementation routed through a large pattern-matcher in types.ts that
  // never saw any input besides these three literals, so the branching was
  // dead weight.
  const base: SmtpVerificationResult = {
    canConnectSmtp: result !== null,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: result === true,
    isDisabled: result === false,
    error: result === true ? undefined : result === null ? 'ambiguous' : 'not_found',
    providerUsed: EmailProvider.everythingElse,
    checkedAt: Date.now(),
  };
  if (!capture) return base;
  // Snapshot — caller may keep mutating the aggregator.
  return { ...base, transcript: [...capture.transcript], commands: [...capture.commands] };
}

async function safeCacheGet<T>(
  store: { get: (k: string) => Promise<T | null | undefined> | T | null | undefined } | null,
  key: string
): Promise<T | null> {
  if (!store) return null;
  try {
    const v = await store.get(key);
    return v ?? null;
  } catch {
    return null;
  }
}

async function safeCacheSet<T>(
  store: { set: (k: string, v: T) => Promise<void> | void } | null,
  key: string,
  value: T
): Promise<void> {
  if (!store) return;
  try {
    await store.set(key, value);
  } catch {
    // Cache write errors are non-fatal — the next call just re-probes.
  }
}

interface ProbeParams {
  mxHost: string;
  port: number;
  local: string;
  domain: string;
  timeout: number;
  tlsConfig: boolean | SMTPTLSConfig;
  hostname: string;
  sequence?: SMTPSequence;
  log: (...args: unknown[]) => void;
}

interface ProbeResult {
  /** true=deliverable, false=hard-rejected, null=indeterminate */
  result: boolean | null;
  /** Server lines, in arrival order, no port prefix. */
  transcript: string[];
  /** Client commands sent, in send order, no port prefix. */
  commands: string[];
}

async function runProbe(p: ProbeParams): Promise<ProbeResult> {
  return new SMTPProbeConnection(p).run();
}

/**
 * One SMTP connection attempt. Lives for one port; resolves to:
 *   true   — RCPT TO accepted / high-volume reply (deliverable proxy)
 *   false  — RCPT TO definitively rejected / over-quota
 *   null   — indeterminate (timeout, hangup, unrecognized, etc.)
 */
class SMTPProbeConnection {
  private socket?: net.Socket | tls.TLSSocket;
  private buffer = '';
  private resolved = false;
  private currentStepIndex = 0;
  private isTLS: boolean;

  private connectionTimer?: NodeJS.Timeout;
  private stepTimer?: NodeJS.Timeout;
  private resolveFn!: (value: ProbeResult) => void;

  private readonly steps: SMTPStep[];
  private readonly tlsOptions: tls.ConnectionOptions;
  /** Server lines + client commands captured unconditionally (cost is trivial). */
  private readonly transcript: string[] = [];
  private readonly commands: string[] = [];

  constructor(private readonly p: ProbeParams) {
    // Default sequence — every modern MX speaks ESMTP, so EHLO works on port 25 too.
    const defaultSteps = [SMTPStep.greeting, SMTPStep.ehlo, SMTPStep.mailFrom, SMTPStep.rcptTo];
    this.steps = [...(p.sequence?.steps ?? defaultSteps)];
    this.isTLS = PORT_TLS[p.port] === true;
    const servername = isIPAddress(p.mxHost) ? undefined : p.mxHost;
    this.tlsOptions = {
      host: p.mxHost,
      servername,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      ...(typeof p.tlsConfig === 'object' ? p.tlsConfig : {}),
    };
  }

  run(): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      this.resolveFn = resolve;
      this.connect();
      this.armConnectionTimer();
    });
  }

  private connect(): void {
    const onConnect = () => {
      this.p.log(`Connected to ${this.p.mxHost}:${this.p.port}${this.isTLS ? ' with TLS' : ''}`);
      this.socket?.on('data', this.onData);
    };
    if (this.isTLS) {
      this.socket = tls.connect({ ...this.tlsOptions, port: this.p.port }, onConnect);
    } else {
      this.socket = net.connect({ host: this.p.mxHost, port: this.p.port }, onConnect);
    }
    this.socket.setTimeout(this.p.timeout, () => this.finish(null, 'socket_timeout'));
    this.socket.on('error', () => this.finish(null, 'connection_error'));
    this.socket.on('close', () => this.finish(null, 'connection_closed'));
  }

  private armConnectionTimer(): void {
    this.connectionTimer = setTimeout(() => this.finish(null, 'connection_timeout'), this.p.timeout);
  }

  private resetStepTimer(): void {
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = setTimeout(() => this.finish(null, 'step_timeout'), this.p.timeout);
  }

  private onData = (data: Buffer | string): void => {
    if (this.resolved) return;
    this.resetStepTimer();
    this.buffer += typeof data === 'string' ? data : data.toString();
    let pos: number;
    while ((pos = this.buffer.indexOf('\r\n')) !== -1) {
      const line = this.buffer.slice(0, pos).trim();
      this.buffer = this.buffer.slice(pos + 2);
      this.processLine(line);
    }
  };

  private send(cmd: string): void {
    if (this.resolved) return;
    this.commands.push(cmd);
    this.p.log(`→ ${cmd}`);
    this.socket?.write(`${cmd}\r\n`);
  }

  private nextStep(): void {
    this.currentStepIndex++;
    if (this.currentStepIndex >= this.steps.length) {
      this.finish(true, 'sequence_complete');
      return;
    }
    this.executeStep(this.steps[this.currentStepIndex]!);
  }

  private executeStep(step: SMTPStep): void {
    if (this.resolved) return;
    switch (step) {
      case SMTPStep.greeting:
        // Server-driven; nothing to send.
        return;
      case SMTPStep.ehlo:
        this.send(`EHLO ${this.p.hostname}`);
        return;
      case SMTPStep.helo:
        this.send(`HELO ${this.p.hostname}`);
        return;
      case SMTPStep.mailFrom: {
        const from = this.p.sequence?.from ?? `<${this.p.local}@${this.p.domain}>`;
        this.send(`MAIL FROM:${from}`);
        return;
      }
      case SMTPStep.rcptTo:
        this.send(`RCPT TO:<${this.p.local}@${this.p.domain}>`);
        return;
    }
  }

  private processLine(line: string): void {
    if (this.resolved) return;
    this.transcript.push(line);
    this.p.log(`← ${line}`);

    // Heuristics that override per-step interpretation.
    if (isHighVolume(line)) {
      this.finish(true, 'high_volume');
      return;
    }
    if (isOverQuota(line)) {
      this.finish(false, 'over_quota');
      return;
    }
    if (isInvalidMailboxError(line)) {
      this.finish(false, 'not_found');
      return;
    }

    // Multiline continuation — wait for the final line (no leading dash) before
    // dispatching. EHLO advertisements (STARTTLS, VRFY, PIPELINING, …) are
    // captured by the transcript but not parsed; this verifier walks a fixed
    // sequence and never branches on capabilities.
    if (MULTILINE_RE.test(line)) return;

    const code = line.slice(0, 3);
    const numericCode = /^\d{3}$/.test(code) ? parseInt(code, 10) : null;
    if (numericCode === null) {
      this.finish(null, 'unrecognized_response');
      return;
    }

    this.dispatch(numericCode);
  }

  private dispatch(code: number): void {
    const step = this.steps[this.currentStepIndex];
    switch (step) {
      case SMTPStep.greeting:
        if (code === 220) this.nextStep();
        else this.finish(null, 'no_greeting');
        return;
      case SMTPStep.ehlo:
        if (code === 250) this.nextStep();
        else this.finish(null, 'ehlo_failed');
        return;
      case SMTPStep.helo:
        if (code === 250) this.nextStep();
        else this.finish(null, 'helo_failed');
        return;
      case SMTPStep.mailFrom:
        if (code === 250) this.nextStep();
        else this.finish(null, 'mail_from_rejected');
        return;
      case SMTPStep.rcptTo:
        if (code === 250 || code === 251) this.finish(true, 'valid');
        else if (code === 552 || code === 452) this.finish(false, 'over_quota');
        else if (code >= 400 && code < 500) this.finish(null, 'temporary_failure');
        else this.finish(null, 'ambiguous');
        return;
    }
  }

  private finish(result: boolean | null, reason: string): void {
    if (this.resolved) return;
    this.resolved = true;
    this.p.log(`${this.p.port}: ${reason}`);

    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    if (this.stepTimer) clearTimeout(this.stepTimer);

    try {
      this.socket?.setTimeout(0);
    } catch {
      // Already destroyed.
    }
    try {
      this.socket?.write('QUIT\r\n');
    } catch {
      // Already destroyed.
    }
    const drain = setTimeout(() => this.socket?.destroy(), QUIT_DRAIN_MS);
    drain.unref?.();

    this.resolveFn({ result, transcript: this.transcript, commands: this.commands });
  }
}
