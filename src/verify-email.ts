/**
 * `verifyEmail` orchestrator + its private helpers.
 *
 * Lives in its own file so `batch-verifier.ts` can import `verifyEmail`
 * without going through `./index.ts` — that re-export was the source of the
 * `index.ts -> batch-verifier.ts -> index.ts` circular dependency Rollup
 * warned about.
 */
import { parse } from 'psl';
import { getCacheStore } from './cache';
import { suggestEmailDomain } from './domain-suggester';
import { isValidEmail, isValidEmailDomain } from './email-validator';
import { isDisposableEmail } from './is-disposable-email';
import { isFreeEmail } from './is-free-email';
import { resolveMxRecords } from './mx-resolver';
import { detectNameFromEmail } from './name-detector';
import { verifyMailboxSMTP } from './smtp-verifier';
import { ArrayTranscriptCollector, NULL_COLLECTOR, type TranscriptCollector } from './transcript';
import {
  type DomainSuggestion,
  type SmtpVerificationResult,
  VerificationErrorCode,
  type VerificationResult,
  type VerifyEmailParams,
} from './types';
import { getDomainAge, getDomainRegistrationStatus } from './whois';

type Logger = (...args: unknown[]) => void;

/** Per-MX-domain port overrides — picked when no explicit `smtpPort` was passed. */
export const domainPorts: Record<string, number> = {
  // 465 or 587
  // https://help.ovhcloud.com/csm/en-ca-web-paas-development-email?id=kb_article_view&sysparm_article=KB0053893
  'ovh.net': 465,
};

/**
 * Copy SMTP verification fields onto the flat result + derive validSmtp.
 * `validSmtp` is null when we couldn't connect (so the caller knows verification
 * was inconclusive, not negative), otherwise tracks `isDeliverable`.
 */
function applySmtpResult(result: VerificationResult, smtp: SmtpVerificationResult): void {
  result.canConnectSmtp = smtp.canConnectSmtp;
  result.hasFullInbox = smtp.hasFullInbox;
  result.isCatchAll = smtp.isCatchAll;
  result.isDeliverable = smtp.isDeliverable;
  result.isDisabled = smtp.isDisabled;
  result.validSmtp = smtp.canConnectSmtp ? smtp.isDeliverable : null;
}

/** Pick a port override from explicit param > known per-MX-domain map > library default. */
function resolveSmtpPorts(explicitPort: number | undefined, primaryMx: string | undefined): number[] | undefined {
  if (explicitPort) return [explicitPort];
  if (!primaryMx) return undefined;
  const mxDomain = parse(primaryMx);
  if (!('domain' in mxDomain) || !mxDomain.domain) return undefined;
  const known = domainPorts[mxDomain.domain];
  return known ? [known] : undefined;
}

/**
 * Verify an email address — orchestrates format / disposable / free / MX / SMTP /
 * WHOIS / name-detection / domain-suggestion checks. Each helper below owns one
 * step and runs only when its flag is enabled. Early returns short-circuit on
 * format/domain failures.
 */
export async function verifyEmail(params: VerifyEmailParams): Promise<VerificationResult> {
  const startTime = Date.now();
  const debug = params.debug ?? false;
  const log: Logger = debug ? console.debug : () => {};
  const result = blankResult(params.emailAddress);

  // Capture collector — opt-in via `captureTranscript`. The NULL_COLLECTOR is
  // a no-op so call sites don't need to branch.
  const captureTranscript = params.captureTranscript ?? false;
  const collector: TranscriptCollector = captureTranscript ? new ArrayTranscriptCollector() : NULL_COLLECTOR;

  // 1. Format check — bail fast.
  const syntaxValid = await collector.record(
    'syntax',
    () => isValidEmail(params.emailAddress),
    (ok) => ({ ok })
  );
  if (!syntaxValid) {
    return finalize(result, VerificationErrorCode.invalidFormat, startTime, collector);
  }
  result.validFormat = true;

  // 2. Name detection (cheap, runs on local part only).
  if (params.detectName) {
    result.detectedName = await collector.record(
      'name-detection',
      () => detectNameFromEmail({ email: params.emailAddress, customMethod: params.nameDetectionMethod }),
      (detected) => ({ detected: detected ?? null })
    );
  }

  // 3. Domain suggestion (cheap, runs on domain only).
  if (params.suggestDomain ?? true) {
    result.domainSuggestion = await collector.record(
      'domain-suggestion',
      () => runSuggestDomain(params),
      (suggestion) => ({ suggestion: suggestion ?? null })
    );
  }

  const [local, domain] = params.emailAddress.split('@');
  if (!domain || !local) {
    return finalize(result, VerificationErrorCode.invalidFormat, startTime, collector);
  }
  const domainValid = await collector.record(
    'domain-validation',
    () => isValidEmailDomain(domain, params.cache),
    (valid) => ({ domain, valid })
  );
  if (!domainValid) {
    return finalize(result, VerificationErrorCode.invalidDomain, startTime, collector);
  }

  // 4. Disposable + free provider checks.
  if (params.checkDisposable ?? true) {
    result.isDisposable = await collector.record(
      'disposable',
      () => isDisposableEmail({ emailOrDomain: params.emailAddress, cache: params.cache, logger: log }),
      (isDisposable) => ({ domain, isDisposable })
    );
    log(`[verifyEmail] disposable: ${result.isDisposable}`);
    if (result.isDisposable) result.metadata.error = VerificationErrorCode.disposableEmail;
  }
  if (params.checkFree ?? true) {
    result.isFree = await collector.record(
      'free',
      () => isFreeEmail({ emailOrDomain: params.emailAddress, cache: params.cache, logger: log }),
      (isFree) => ({ domain, isFree })
    );
    log(`[verifyEmail] free: ${result.isFree}`);
  }

  const skipMx = (params.skipMxForDisposable ?? false) && result.isDisposable;
  const skipWhois = (params.skipDomainWhoisForDisposable ?? false) && result.isDisposable;

  // 5. WHOIS-driven domain age + registration (skipped for disposable when configured).
  await runWhoisChecks(domain, params, result, skipWhois, log, collector);

  // 6. MX + SMTP — runs when either flag is on, unless we're skipping
  //    disposable addresses (the address is already known to be junk).
  const wantsMxOrSmtp = (params.verifyMx ?? true) || (params.verifySmtp ?? false);
  if (wantsMxOrSmtp && skipMx) {
    log(`[verifyEmail] skipping MX/SMTP for disposable: ${params.emailAddress}`);
  } else if (wantsMxOrSmtp) {
    await runMxAndSmtp(local, domain, params, result, log, collector);
  }

  result.metadata.verificationTime = Date.now() - startTime;
  if (captureTranscript) result.transcript = (collector as ArrayTranscriptCollector).steps;
  return result;
}

function blankResult(email: string): VerificationResult {
  return {
    email,
    validFormat: false,
    validMx: null,
    validSmtp: null,
    isDisposable: false,
    isFree: false,
    metadata: { verificationTime: 0, cached: false },
  };
}

function finalize(
  result: VerificationResult,
  error: VerificationErrorCode,
  startTime: number,
  collector: TranscriptCollector
): VerificationResult {
  result.metadata.error = error;
  result.metadata.verificationTime = Date.now() - startTime;
  if (collector instanceof ArrayTranscriptCollector) {
    result.transcript = collector.steps;
  }
  return result;
}

async function runSuggestDomain(params: VerifyEmailParams): Promise<DomainSuggestion | null> {
  const [, emailDomain] = params.emailAddress.split('@');
  if (!emailDomain) return null;
  if (params.domainSuggestionMethod) return params.domainSuggestionMethod(emailDomain);
  return suggestEmailDomain(params.emailAddress, params.commonDomains);
}

async function runWhoisChecks(
  domain: string,
  params: VerifyEmailParams,
  result: VerificationResult,
  skipWhois: boolean,
  log: Logger,
  collector: TranscriptCollector
): Promise<void> {
  if (!params.checkDomainAge && !params.checkDomainRegistration) return;
  if (skipWhois) {
    log(`[verifyEmail] WHOIS checks skipped for disposable: ${domain}`);
    return;
  }
  const whoisTimeout = params.whoisTimeout ?? 5000;
  const debug = params.debug ?? false;

  if (params.checkDomainAge) {
    try {
      result.domainAge = await collector.record(
        'whois-age',
        () => getDomainAge(domain, whoisTimeout, debug, params.cache),
        (info) => ({
          domain,
          found: info !== null,
          ageInDays: info?.ageInDays ?? null,
          ageInYears: info?.ageInYears ?? null,
          creationDate: info?.creationDate?.toISOString() ?? null,
          expirationDate: info?.expirationDate?.toISOString() ?? null,
        })
      );
      log(`[verifyEmail] domain age:`, result.domainAge ? `${result.domainAge.ageInDays} days` : 'null');
    } catch (error) {
      log('[verifyEmail] domain age lookup failed', error);
      result.domainAge = null;
    }
  }

  if (params.checkDomainRegistration) {
    try {
      result.domainRegistration = await collector.record(
        'whois-registration',
        () => getDomainRegistrationStatus(domain, whoisTimeout, debug, params.cache),
        (info) => ({
          domain,
          found: info !== null,
          isRegistered: info?.isRegistered ?? null,
          isExpired: info?.isExpired ?? null,
          isLocked: info?.isLocked ?? null,
          isPendingDelete: info?.isPendingDelete ?? null,
          daysUntilExpiration: info?.daysUntilExpiration ?? null,
          status: info?.status ?? [],
        })
      );
      log(`[verifyEmail] registered:`, result.domainRegistration?.isRegistered ?? false);
    } catch (error) {
      log('[verifyEmail] domain registration lookup failed', error);
      result.domainRegistration = null;
    }
  }
}

async function runMxAndSmtp(
  local: string,
  domain: string,
  params: VerifyEmailParams,
  result: VerificationResult,
  log: Logger,
  collector: TranscriptCollector
): Promise<void> {
  let mxRecords: string[];
  try {
    mxRecords = await collector.record(
      'mx-lookup',
      () => resolveMxRecords({ domain, cache: params.cache, logger: log }),
      (records) => ({ domain, records, count: records.length })
    );
  } catch (error) {
    log('[verifyEmail] MX lookup failed', error);
    result.validMx = false;
    result.mxRecords = null;
    result.metadata.error = VerificationErrorCode.noMxRecords;
    return;
  }

  result.mxRecords = mxRecords;
  result.validMx = mxRecords.length > 0;
  if (!result.validMx) {
    result.metadata.error = VerificationErrorCode.noMxRecords;
    return;
  }

  if (!(params.verifySmtp ?? false)) return;

  await runSmtp(local, domain, mxRecords, params, result, log, collector);
}

async function runSmtp(
  local: string,
  domain: string,
  mxRecords: string[],
  params: VerifyEmailParams,
  result: VerificationResult,
  log: Logger,
  collector: TranscriptCollector
): Promise<void> {
  const cacheKey = `${params.emailAddress}:smtp`;
  const smtpCache = getCacheStore<SmtpVerificationResult>(params.cache, 'smtp');
  const cached = await smtpCache.get(cacheKey);

  if (cached) {
    applySmtpResult(result, cached);
    result.metadata.cached = true;
    log(`[verifyEmail] SMTP cache hit: ${result.validSmtp} for ${params.emailAddress}`);
    collector.push({
      kind: 'smtp-probe',
      startedAt: Date.now(),
      durationMs: 0,
      ok: true,
      details: {
        cacheHit: true,
        verdict: smtpVerdictFor(result.validSmtp),
        canConnectSmtp: cached.canConnectSmtp,
      },
    });
  } else {
    await collector.record(
      'smtp-probe',
      async () => {
        const probe = await verifyMailboxSMTP({
          local,
          domain,
          mxRecords,
          options: {
            cache: params.cache,
            ports: resolveSmtpPorts(params.smtpPort, mxRecords[0]),
            timeout: params.timeout ?? 4000,
            debug: params.debug ?? false,
            // Forward transcript capture so the SMTP step's details include
            // the full per-port transcript when the caller asked for it.
            captureTranscript: params.captureTranscript ?? false,
          },
        });
        await smtpCache.set(cacheKey, probe.smtpResult);
        applySmtpResult(result, probe.smtpResult);
        result.metadata.cached = probe.cached;
        return probe;
      },
      ({ smtpResult, port, cached: probedFromCache }) => ({
        cacheHit: false,
        port,
        cached: probedFromCache,
        verdict: smtpVerdictFor(result.validSmtp),
        canConnectSmtp: smtpResult.canConnectSmtp,
        error: smtpResult.error ?? null,
        // Only present if captureTranscript was set on params.
        transcript: smtpResult.transcript ?? null,
        commands: smtpResult.commands ?? null,
      })
    );
    log(`[verifyEmail] SMTP probed: ${result.validSmtp} for ${params.emailAddress}`);
  }

  if (result.validSmtp === false) result.metadata.error = VerificationErrorCode.mailboxNotFound;
  else if (result.validSmtp === null) result.metadata.error = VerificationErrorCode.smtpConnectionFailed;
}

function smtpVerdictFor(validSmtp: boolean | null | undefined): 'deliverable' | 'undeliverable' | 'indeterminate' {
  if (validSmtp === true) return 'deliverable';
  if (validSmtp === false) return 'undeliverable';
  return 'indeterminate';
}
