/**
 * SMTP mailbox probe.
 *
 * Walks `mxRecords` in priority order, then `ports` in the configured order.
 * Returns the first attempt that yields a definitive answer (250 / 550 / 552 /
 * 452); on indeterminate outcomes (timeouts, connection resets, EHLO failures,
 * unrecognized responses), falls through to the next MX×port pair.
 *
 * Per-attempt dialogue:
 *   greeting → EHLO → MAIL FROM → RCPT TO real → RCPT TO probe → RSET
 *
 * The probe RCPT uses a guaranteed-nonexistent random local-part so we can
 * detect catch-all MXes (Outlook / Yahoo / Office 365 / ProtonMail / many
 * corporates accept every recipient at the MX layer and bounce later).
 * When both real + probe return 250, `result.isCatchAll = true` and callers
 * know the deliverability signal is unreliable but that the address syntax
 * was at least accepted.
 *
 * The envelope (real RCPT + probe RCPT + RSET) is batched via PIPELINING
 * (RFC 2920) when the MX advertises support — roughly halves wire-level
 * latency. Tests can disable with `pipelining: 'never'` for deterministic
 * `socket.write()` call counts.
 *
 * Every result carries a `metrics` block with `mxAttempts`, `portAttempts`,
 * `mxHostsTried`, `mxHostUsed?`, `totalDurationMs` — useful for region-health
 * dashboards and root-cause-analysis when probes go wrong.
 */

import { randomBytes } from 'node:crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { getCacheStore } from './cache';
import type {
  SMTPSequence,
  SMTPTLSConfig,
  SMTPVerifyOptions,
  SmtpProbeMetrics,
  SmtpVerificationResult,
  VerifyMailboxSMTPParams,
} from './types';
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

function dsnToString(dsn: ParsedDsn): string {
  return `${dsn.class}.${dsn.subject}.${dsn.detail}`;
}

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
 * 16 hex characters + suffix — long enough to never collide with any real
 * mailbox, structured so it's clearly synthetic and passes the local-part
 * syntax checks of every common MX.
 */
function defaultProbeLocal(): string {
  return `${randomBytes(8).toString('hex')}-noexist`;
}

/**
 * Public entry point. Walks `mxRecords × ports` and returns the first
 * definitive answer. Always:
 *   - iterates MX records on indeterminate outcomes (no flag)
 *   - runs the catch-all dual-probe (no flag)
 *   - populates `result.metrics` and `result.enhancedStatus`
 *
 * Opt-in only:
 *   - `captureTranscript: true` returns the wire transcript on the result
 *   - `pipelining: 'never'` disables PIPELINING for deterministic tests
 *   - `catchAllProbeLocal` overrides the random-local generator
 */
export async function verifyMailboxSMTP(
  params: VerifyMailboxSMTPParams
): Promise<{ smtpResult: SmtpVerificationResult; cached: boolean; port: number; portCached: boolean }> {
  const { local, domain, options = {} } = params;
  // Coerce null → empty array (destructuring default only fires on undefined).
  const mxRecords = params.mxRecords ?? [];
  // Filter out non-integer / out-of-range ports — net.connect throws RangeError
  // synchronously for those, which would crash the promise executor.
  const ports = (options.ports ?? DEFAULT_PORTS).filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const tlsConfig = options.tls ?? true;
  const hostname = options.hostname ?? 'localhost';
  const debug = options.debug ?? false;
  const captureTranscript = options.captureTranscript ?? false;
  const sequence = options.sequence;
  const cache = options.cache;
  const log = debug ? (...args: unknown[]) => console.log('[SMTP]', ...args) : () => {};

  const startedAtMs = Date.now();

  const primaryMx = mxRecords[0];
  if (!primaryMx) {
    log('No MX records found');
    const metrics = makeMetrics([], 0, 0, undefined, startedAtMs);
    return { smtpResult: failureResult('no_mx_records', metrics), cached: false, port: 0, portCached: false };
  }
  log(`Verifying ${local}@${domain} via ${primaryMx} (mx count=${mxRecords.length})`);

  const transcript: string[] = [];
  const commands: string[] = [];

  const probeOptions: ProbeOptions = {
    local,
    domain,
    timeout,
    tlsConfig,
    hostname,
    sequence,
    log,
    catchAllProbeLocal: options.catchAllProbeLocal,
    pipelining: options.pipelining ?? 'auto',
  };

  // Cache short-circuits — keyed on the primary MX so the cache key matches
  // what callers compute from `mxRecords[0]`.
  const verdictCache = cache ? getCacheStore<SmtpVerificationResult>(cache, 'smtp') : null;
  const verdictKey = `${primaryMx}:${local}@${domain}`;
  if (verdictCache) {
    const cachedResult = await safeCacheGet(verdictCache, verdictKey);
    if (cachedResult) {
      log(`Using cached SMTP result: ${cachedResult.isDeliverable}`);
      return { smtpResult: cachedResult, cached: true, port: 0, portCached: false };
    }
  }

  const portCache = cache ? getCacheStore<number>(cache, 'smtpPort') : null;
  const cachedPort = portCache ? await safeCacheGet(portCache, primaryMx) : null;

  const mxHostsTried: string[] = [];
  let mxAttempts = 0;
  let portAttempts = 0;
  let lastReason = 'all_attempts_failed';
  let lastEnhancedStatus: string | undefined;
  let lastResponseCode: number | undefined;

  for (const mxHost of mxRecords) {
    mxHostsTried.push(mxHost);
    mxAttempts++;

    // Cached-port fast path: only valid for the primary MX.
    const portsForThisMx =
      mxHost === primaryMx && cachedPort ? [cachedPort, ...ports.filter((p) => p !== cachedPort)] : ports;

    for (const port of portsForThisMx) {
      portAttempts++;
      log(`Testing ${mxHost}:${port}`);
      const probe = await runProbe({ ...probeOptions, mxHost, port });
      collectTranscript(transcript, commands, probe, mxHost, port);
      lastReason = probe.reason;
      if (probe.enhancedStatus !== undefined) lastEnhancedStatus = probe.enhancedStatus;
      if (probe.responseCode !== undefined) lastResponseCode = probe.responseCode;

      // Definitive answer (250/251 deliverable, 550/552/etc. rejected) ends
      // the search. Indeterminate (null) falls through to the next port/MX.
      if (probe.result !== null) {
        const metrics = makeMetrics(mxHostsTried, mxAttempts, portAttempts, mxHost, startedAtMs);
        const smtpResult = toSmtpVerificationResult(probe, {
          transcript: captureTranscript ? transcript : undefined,
          commands: captureTranscript ? commands : undefined,
          metrics,
        });
        await safeCacheSet(verdictCache, verdictKey, smtpResult);
        if (mxHost === primaryMx) await safeCacheSet(portCache, primaryMx, port);
        return { smtpResult, cached: false, port, portCached: cachedPort === port };
      }
    }
  }

  // Every MX×port returned indeterminate — surface the LAST attempt's reason
  // so callers can see the failure mode (e.g. tls_error tells a different
  // story than connection_timeout).
  log(`All MX×port attempts failed (mx=${mxAttempts}, port=${portAttempts})`);
  const metrics = makeMetrics(mxHostsTried, mxAttempts, portAttempts, undefined, startedAtMs);
  const smtpResult: SmtpVerificationResult = {
    ...failureResult(lastReason, metrics),
    ...(lastEnhancedStatus !== undefined ? { enhancedStatus: lastEnhancedStatus } : {}),
    ...(lastResponseCode !== undefined ? { responseCode: lastResponseCode } : {}),
    ...(captureTranscript ? { transcript: [...transcript], commands: [...commands] } : {}),
  };
  return { smtpResult, cached: false, port: 0, portCached: false };
}

function makeMetrics(
  mxHostsTried: string[],
  mxAttempts: number,
  portAttempts: number,
  mxHostUsed: string | undefined,
  startedAtMs: number
): SmtpProbeMetrics {
  return {
    mxAttempts,
    portAttempts,
    mxHostsTried: [...mxHostsTried],
    ...(mxHostUsed !== undefined ? { mxHostUsed } : {}),
    totalDurationMs: Date.now() - startedAtMs,
  };
}

function collectTranscript(
  transcript: string[],
  commands: string[],
  probe: ProbeResult,
  mxHost: string,
  port: number
): void {
  const prefix = `${mxHost}:${port}`;
  for (const line of probe.transcript) transcript.push(`${prefix}|s| ${line}`);
  for (const cmd of probe.commands) commands.push(`${prefix}|c| ${cmd}`);
}

function failureResult(reason: string, metrics: SmtpProbeMetrics): SmtpVerificationResult {
  return {
    canConnectSmtp: false,
    hasFullInbox: false,
    isCatchAll: false,
    isDeliverable: false,
    isDisabled: false,
    error: reason,
    providerUsed: EmailProvider.everythingElse,
    checkedAt: Date.now(),
    metrics,
  };
}

interface ToResultExtras {
  transcript?: string[];
  commands?: string[];
  metrics: SmtpProbeMetrics;
}

function toSmtpVerificationResult(probe: ProbeResult, extras: ToResultExtras): SmtpVerificationResult {
  const result = probe.result;
  const out: SmtpVerificationResult = {
    canConnectSmtp: result !== null,
    hasFullInbox: probe.reason === 'over_quota',
    isCatchAll: probe.isCatchAll ?? false,
    isDeliverable: result === true,
    isDisabled: result === false,
    error: result === true ? undefined : probe.reason,
    providerUsed: EmailProvider.everythingElse,
    checkedAt: Date.now(),
    metrics: extras.metrics,
    ...(probe.enhancedStatus !== undefined ? { enhancedStatus: probe.enhancedStatus } : {}),
    ...(probe.responseCode !== undefined ? { responseCode: probe.responseCode } : {}),
  };
  if (extras.transcript) out.transcript = [...extras.transcript];
  if (extras.commands) out.commands = [...extras.commands];
  return out;
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

interface ProbeOptions {
  local: string;
  domain: string;
  timeout: number;
  tlsConfig: boolean | SMTPTLSConfig;
  hostname: string;
  sequence?: SMTPSequence;
  log: (...args: unknown[]) => void;
  catchAllProbeLocal?: SMTPVerifyOptions['catchAllProbeLocal'];
  pipelining: 'auto' | 'never' | 'force';
}

interface ProbeParams extends ProbeOptions {
  mxHost: string;
  port: number;
}

interface ProbeResult {
  /** true=deliverable, false=hard-rejected, null=indeterminate */
  result: boolean | null;
  /** Short reason vocabulary — propagated to `SmtpVerificationResult.error`. */
  reason: string;
  /** RFC 3463 enhanced status from the most recent reply that carried one. */
  enhancedStatus?: string;
  /** SMTP response code from the most recent reply (e.g. 250, 550). */
  responseCode?: number;
  /**
   * Catch-all flag from the dual-probe. `true` when both real + probe RCPT
   * returned 250; `false` otherwise; `undefined` only if the probe never
   * reached the envelope phase (indeterminate before MAIL FROM).
   */
  isCatchAll?: boolean;
  /** Server lines, in arrival order, no port prefix. */
  transcript: string[];
  /** Client commands sent, in send order, no port prefix. */
  commands: string[];
}

async function runProbe(p: ProbeParams): Promise<ProbeResult> {
  return new SMTPProbeConnection(p).run();
}

/** Buckets a numeric SMTP RCPT-TO reply into the dual-probe state machine. */
type RcptOutcome = 'pending' | 'accept' | 'soft_reject' | 'hard_reject';

/** Phase of the dual-probe envelope (after MAIL FROM is accepted). */
type DualPhase = 'idle' | 'rcpt_real' | 'rcpt_probe' | 'rset';

/**
 * One SMTP connection attempt. Lives for one MX×port; resolves to:
 *   true   — RCPT TO real accepted (with `isCatchAll` set when probe also 250)
 *   false  — RCPT TO real definitively rejected / over-quota
 *   null   — indeterminate (timeout, hangup, unrecognized, ehlo failure, etc.)
 */
class SMTPProbeConnection {
  // ── Connection state ─────────────────────────────────────────────────────
  private socket?: net.Socket | tls.TLSSocket;
  private buffer = '';
  private resolved = false;
  private currentStepIndex = 0;
  private readonly isTLS: boolean;
  private connectionTimer?: NodeJS.Timeout;
  private stepTimer?: NodeJS.Timeout;
  private resolveFn!: (value: ProbeResult) => void;

  // ── Dialogue tracking ────────────────────────────────────────────────────
  private readonly steps: SMTPStep[];
  private readonly tlsOptions: tls.ConnectionOptions;
  private readonly transcript: string[] = [];
  private readonly commands: string[] = [];
  /** Last RFC 3463 enhanced status seen (last-write semantics — most recent wins). */
  private lastEnhancedStatus?: string;
  /** Last 3-digit SMTP response code seen (last-write semantics). */
  private lastResponseCode?: number;

  // ── EHLO capability advertisement ────────────────────────────────────────
  private supportsPipelining = false;

  // ── Dual-probe (catch-all detection) ─────────────────────────────────────
  private readonly probeLocal: string;
  private dualPhase: DualPhase = 'idle';
  private realOutcome: RcptOutcome = 'pending';
  private probeOutcome: RcptOutcome = 'pending';
  private dualPipelined = false;
  /**
   * Pipelined-only escape hatch. When the real RCPT is rejected mid-batched-
   * envelope, the probe + RSET are already on the wire; we stash the verdict
   * and commit it after the response loop drains.
   */
  private pendingDecision: { result: boolean | null; reason: string } | null = null;
  private isCatchAllFlag?: boolean;

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
    this.probeLocal = p.catchAllProbeLocal ? p.catchAllProbeLocal(p.local, p.domain) : defaultProbeLocal();
  }

  run(): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      this.resolveFn = resolve;
      try {
        this.connect();
        this.armConnectionTimer();
      } catch (error) {
        this.finish(null, `connect_throw:${error instanceof Error ? error.message : 'unknown'}`);
      }
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
    const step = this.steps[this.currentStepIndex];
    if (step === undefined) {
      this.finish(true, 'sequence_complete');
      return;
    }
    this.executeStep(step);
  }

  private executeStep(step: SMTPStep): void {
    if (this.resolved) return;
    switch (step) {
      case SMTPStep.greeting:
        return; // server-driven; nothing to send
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
        this.executeEnvelope();
        return;
    }
  }

  /**
   * Send the dual-probe envelope (real RCPT + probe RCPT + RSET). Pipelined
   * when the MX advertised PIPELINING (or `pipelining: 'force'`); sequential
   * otherwise.
   */
  private executeEnvelope(): void {
    const wantsPipelining = this.p.pipelining === 'force' || (this.p.pipelining === 'auto' && this.supportsPipelining);

    const realCmd = `RCPT TO:<${this.p.local}@${this.p.domain}>`;

    if (wantsPipelining) {
      // Batch real + probe + RSET into one socket.write(). Response phases
      // (rcpt_real → rcpt_probe → rset) demux replies in order.
      this.dualPipelined = true;
      const probeCmd = `RCPT TO:<${this.probeLocal}@${this.p.domain}>`;
      const rsetCmd = 'RSET';
      this.commands.push(realCmd, probeCmd, rsetCmd);
      this.p.log(`→ ${realCmd}`);
      this.p.log(`→ ${probeCmd}`);
      this.p.log(`→ ${rsetCmd}`);
      this.socket?.write(`${realCmd}\r\n${probeCmd}\r\n${rsetCmd}\r\n`);
      this.dualPhase = 'rcpt_real';
      return;
    }

    // Sequential — send real RCPT first; rest follows in handleEnvelopeReply.
    this.dualPipelined = false;
    this.send(realCmd);
    this.dualPhase = 'rcpt_real';
  }

  private processLine(line: string): void {
    if (this.resolved) return;
    this.transcript.push(line);
    this.p.log(`← ${line}`);

    // Parse code + DSN up-front so the result carries them even when a
    // heuristic short-circuits before dispatch.
    const codeStr = line.slice(0, 3);
    const numericCode = /^\d{3}$/.test(codeStr) ? parseInt(codeStr, 10) : null;
    if (numericCode !== null) this.lastResponseCode = numericCode;
    const dsn = parseDsn(line);
    if (dsn) this.lastEnhancedStatus = dsnToString(dsn);

    // Heuristic early-returns fire pre-envelope and on the real-RCPT response.
    // Inside the probe/rset phases we ignore them — a probe response shouldn't
    // be classified as "high volume" or "not found" (those signals refer to
    // the real recipient). Multi-line replies (e.g. `452-4.2.2 over quota...`)
    // trigger the heuristics here BEFORE the multiline check returns early.
    if (this.dualPhase === 'idle' || this.dualPhase === 'rcpt_real') {
      if (isHighVolume(line)) {
        this.finish(true, 'high_volume');
        return;
      }
      if (isOverQuota(line)) {
        this.isCatchAllFlag = false;
        this.finish(false, 'over_quota');
        return;
      }
      if (isInvalidMailboxError(line)) {
        this.isCatchAllFlag = false;
        this.finish(false, 'not_found');
        return;
      }
    }

    // Multi-line continuation. Capture EHLO advertisements so we know
    // whether to use PIPELINING when the envelope phase fires.
    if (MULTILINE_RE.test(line)) {
      const step = this.steps[this.currentStepIndex];
      if ((step === SMTPStep.ehlo || step === SMTPStep.helo) && line.startsWith('250-')) {
        const upper = line.toUpperCase();
        if (upper.includes('PIPELINING')) this.supportsPipelining = true;
      }
      return;
    }

    if (numericCode === null) {
      this.finish(null, 'unrecognized_response');
      return;
    }

    this.dispatch(numericCode, line);
  }

  private dispatch(code: number, line: string): void {
    const step = this.steps[this.currentStepIndex];

    // Inside the envelope, route by phase.
    if (this.dualPhase !== 'idle' && step === SMTPStep.rcptTo) {
      this.handleEnvelopeReply(code, line);
      return;
    }

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
        // Only reachable if dualPhase is idle on rcptTo — should never happen
        // in practice (executeEnvelope sets it). Treat as fall-through.
        this.handleEnvelopeReply(code, line);
        return;
    }
  }

  /**
   * Dual-probe / pipelined-envelope reply router. Demuxes server replies for
   * the three queued commands (real RCPT, probe RCPT, RSET) and resolves
   * with the catch-all-aware verdict.
   */
  private handleEnvelopeReply(code: number, line: string): void {
    if (this.dualPhase === 'rcpt_real') {
      this.realOutcome = classifyRcpt(code);

      // Over-quota short-circuits — the catch-all probe gives no extra signal.
      if (code === 552 || code === 452 || isOverQuota(line)) {
        this.isCatchAllFlag = false;
        if (this.dualPipelined) {
          this.pendingDecision = { result: false, reason: 'over_quota' };
          this.dualPhase = 'rcpt_probe';
          return;
        }
        this.finish(false, 'over_quota');
        return;
      }

      // Soft reject — temporary; further probing would hit the same rate-limit.
      if (this.realOutcome === 'soft_reject') {
        if (this.dualPipelined) {
          this.pendingDecision = { result: null, reason: 'temporary_failure' };
          this.dualPhase = 'rcpt_probe';
          return;
        }
        this.finish(null, 'temporary_failure');
        return;
      }

      // Hard reject — distinguish "user unknown" (clean not_found) from policy /
      // spam-flagged 5xx (genuinely ambiguous).
      if (this.realOutcome === 'hard_reject') {
        const reason = isInvalidMailboxError(line) ? 'not_found' : 'ambiguous';
        const result = reason === 'not_found' ? false : null;
        this.isCatchAllFlag = false;
        if (this.dualPipelined) {
          this.pendingDecision = { result, reason };
          this.dualPhase = 'rcpt_probe';
          return;
        }
        this.finish(result, reason);
        return;
      }

      // Real RCPT accepted — advance to probe phase.
      if (this.dualPipelined) {
        this.dualPhase = 'rcpt_probe';
      } else {
        this.send(`RCPT TO:<${this.probeLocal}@${this.p.domain}>`);
        this.dualPhase = 'rcpt_probe';
      }
      return;
    }

    if (this.dualPhase === 'rcpt_probe') {
      this.probeOutcome = classifyRcpt(code);
      if (this.dualPipelined) {
        this.dualPhase = 'rset';
      } else {
        this.send('RSET');
        this.dualPhase = 'rset';
      }
      return;
    }

    if (this.dualPhase === 'rset') {
      // RSET response received. We don't care about its code — it's just the
      // demux marker that the envelope is fully drained.
      if (this.pendingDecision) {
        // Pre-decided verdict from a real-RCPT reject; commit it now.
        this.finish(this.pendingDecision.result, this.pendingDecision.reason);
        return;
      }
      this.decideDualProbe();
      return;
    }
  }

  /** Final decision after both RCPT outcomes are known. Catch-all only when both 250. */
  private decideDualProbe(): void {
    if (this.realOutcome === 'accept' && this.probeOutcome === 'accept') {
      this.isCatchAllFlag = true;
      this.finish(true, 'valid');
    } else if (this.realOutcome === 'accept') {
      this.isCatchAllFlag = false;
      this.finish(true, 'valid');
    } else if (this.realOutcome === 'hard_reject') {
      this.isCatchAllFlag = false;
      this.finish(false, 'not_found');
    } else if (this.realOutcome === 'soft_reject') {
      this.finish(null, 'temporary_failure');
    } else {
      this.finish(null, 'ambiguous');
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

    this.resolveFn({
      result,
      reason,
      ...(this.lastEnhancedStatus !== undefined ? { enhancedStatus: this.lastEnhancedStatus } : {}),
      ...(this.lastResponseCode !== undefined ? { responseCode: this.lastResponseCode } : {}),
      ...(this.isCatchAllFlag !== undefined ? { isCatchAll: this.isCatchAllFlag } : {}),
      transcript: this.transcript,
      commands: this.commands,
    });
  }
}

function classifyRcpt(code: number): RcptOutcome {
  if (code === 250 || code === 251) return 'accept';
  if (code >= 400 && code < 500) return 'soft_reject';
  return 'hard_reject';
}
