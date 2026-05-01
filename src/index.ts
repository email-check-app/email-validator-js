import { parse } from 'psl';
import { getCacheStore } from './cache';
import disposableProviders from './disposable-email-providers.json';
import { suggestEmailDomain } from './domain-suggester';
import { isValidEmail, isValidEmailDomain } from './email-validator';
import freeProviders from './free-email-providers.json';
import { resolveMxRecords } from './mx-resolver';
import { detectNameFromEmail } from './name-detector';
import { verifyMailboxSMTP } from './smtp-verifier';
import {
  type DisposableEmailCheckParams,
  type DisposableEmailResult,
  type DomainSuggestion,
  type FreeEmailCheckParams,
  type FreeEmailResult,
  type SmtpVerificationResult,
  VerificationErrorCode,
  type VerificationResult,
  type VerifyEmailParams,
} from './types';
import { getDomainAge, getDomainRegistrationStatus } from './whois';

export * from './adapters/lru-adapter';
export * from './adapters/redis-adapter';
export { verifyEmailBatch } from './batch-verifier';
export * from './cache';
export * from './cache-interface';
export {
  commonEmailDomains,
  defaultDomainSuggestionMethod,
  getDomainSimilarity,
  isCommonDomain,
  suggestDomain,
  suggestEmailDomain,
} from './domain-suggester';
export { isValidEmail, isValidEmailDomain } from './email-validator';
export { isSpamEmail } from './is-spam-email';
export { isSpamName } from './is-spam-name';
export {
  cleanNameForAlgorithm,
  defaultNameDetectionMethod,
  detectName,
  detectNameForAlgorithm,
  detectNameFromEmail,
} from './name-detector';
// Re-export types
export * from './types';
export { getDomainAge, getDomainRegistrationStatus } from './whois';

// Provider lists are JSON-imported at module load. ~10k entries each, parsed
// once into a Set for O(1) lookups. Avoids the lazy `require()` shim that the
// previous code used to delay this work — the cost is small and the code is
// simpler without the lazy load.
const disposableEmailProviders: Set<string> = new Set(disposableProviders as string[]);
const freeEmailProviders: Set<string> = new Set(freeProviders as string[]);

export async function isDisposableEmail(params: DisposableEmailCheckParams): Promise<boolean> {
  const { emailOrDomain, cache, logger } = params;
  const log = logger || (() => {});

  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) {
    return false;
  }

  // Check cache first - now uses rich DisposableEmailResult
  const cacheStore = getCacheStore<DisposableEmailResult>(cache, 'disposable');
  let cached: DisposableEmailResult | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch (ignoredError) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isDisposableEmail] Cache hit for ${emailDomain}: ${cached.isDisposable}`);
    return cached.isDisposable;
  }

  const isDisposable = disposableEmailProviders.has(emailDomain);

  // Store rich result in cache
  const richResult: DisposableEmailResult = {
    isDisposable,
    source: 'disposable-email-providers.json',
    category: isDisposable ? 'disposable' : undefined,
    checkedAt: Date.now(),
  };

  try {
    await cacheStore.set(emailDomain, richResult);
    log(`[isDisposableEmail] Cached result for ${emailDomain}: ${isDisposable}`);
  } catch (ignoredError) {
    // Cache error, ignore it
    log(`[isDisposableEmail] Cache write error for ${emailDomain}`);
  }
  log(`[isDisposableEmail] Check result for ${emailDomain}: ${isDisposable}`);
  return isDisposable;
}

export async function isFreeEmail(params: FreeEmailCheckParams): Promise<boolean> {
  const { emailOrDomain, cache, logger } = params;
  const log = logger || (() => {});

  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) {
    return false;
  }

  // Check cache first - now uses rich FreeEmailResult
  const cacheStore = getCacheStore<FreeEmailResult>(cache, 'free');
  let cached: FreeEmailResult | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch (ignoredError) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isFreeEmail] Cache hit for ${emailDomain}: ${cached.isFree}`);
    return cached.isFree;
  }

  const isFree = freeEmailProviders.has(emailDomain);

  // Store rich result in cache
  const richResult: FreeEmailResult = {
    isFree,
    provider: isFree ? emailDomain : undefined,
    checkedAt: Date.now(),
  };

  try {
    await cacheStore.set(emailDomain, richResult);
    log(`[isFreeEmail] Cached result for ${emailDomain}: ${isFree}`);
  } catch (ignoredError) {
    // Cache error, ignore it
    log(`[isFreeEmail] Cache write error for ${emailDomain}`);
  }
  log(`[isFreeEmail] Check result for ${emailDomain}: ${isFree}`);
  return isFree;
}

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

type Logger = (...args: unknown[]) => void;

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

  // 1. Format check — bail fast.
  if (!isValidEmail(params.emailAddress)) {
    return finalize(result, VerificationErrorCode.invalidFormat, startTime);
  }
  result.validFormat = true;

  // 2. Name detection (cheap, runs on local part only).
  if (params.detectName) {
    result.detectedName = detectNameFromEmail({
      email: params.emailAddress,
      customMethod: params.nameDetectionMethod,
    });
  }

  // 3. Domain suggestion (cheap, runs on domain only).
  if (params.suggestDomain ?? true) {
    result.domainSuggestion = await runSuggestDomain(params);
  }

  const [local, domain] = params.emailAddress.split('@');
  if (!domain || !local) {
    return finalize(result, VerificationErrorCode.invalidFormat, startTime);
  }
  if (!(await isValidEmailDomain(domain, params.cache))) {
    return finalize(result, VerificationErrorCode.invalidDomain, startTime);
  }

  // 4. Disposable + free provider checks.
  if (params.checkDisposable ?? true) {
    result.isDisposable = await isDisposableEmail({
      emailOrDomain: params.emailAddress,
      cache: params.cache,
      logger: log,
    });
    log(`[verifyEmail] disposable: ${result.isDisposable}`);
    if (result.isDisposable) result.metadata.error = VerificationErrorCode.disposableEmail;
  }
  if (params.checkFree ?? true) {
    result.isFree = await isFreeEmail({ emailOrDomain: params.emailAddress, cache: params.cache, logger: log });
    log(`[verifyEmail] free: ${result.isFree}`);
  }

  const skipMx = (params.skipMxForDisposable ?? false) && result.isDisposable;
  const skipWhois = (params.skipDomainWhoisForDisposable ?? false) && result.isDisposable;

  // 5. WHOIS-driven domain age + registration (skipped for disposable when configured).
  await runWhoisChecks(domain, params, result, skipWhois, log);

  // 6. MX + SMTP (skipped for disposable when configured).
  if ((params.verifyMx ?? true) || (params.verifySmtp ?? false)) {
    if (skipMx) {
      log(`[verifyEmail] skipping MX/SMTP for disposable: ${params.emailAddress}`);
    } else {
      await runMxAndSmtp(local, domain, params, result, log);
    }
  }

  result.metadata.verificationTime = Date.now() - startTime;
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

function finalize(result: VerificationResult, error: VerificationErrorCode, startTime: number): VerificationResult {
  result.metadata.error = error;
  result.metadata.verificationTime = Date.now() - startTime;
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
  log: Logger
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
      result.domainAge = await getDomainAge(domain, whoisTimeout, debug, params.cache);
      log(`[verifyEmail] domain age:`, result.domainAge ? `${result.domainAge.ageInDays} days` : 'null');
    } catch (error) {
      log('[verifyEmail] domain age lookup failed', error);
      result.domainAge = null;
    }
  }

  if (params.checkDomainRegistration) {
    try {
      result.domainRegistration = await getDomainRegistrationStatus(domain, whoisTimeout, debug, params.cache);
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
  log: Logger
): Promise<void> {
  let mxRecords: string[];
  try {
    mxRecords = await resolveMxRecords({ domain, cache: params.cache, logger: log });
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

  await runSmtp(local, domain, mxRecords, params, result, log);
}

async function runSmtp(
  local: string,
  domain: string,
  mxRecords: string[],
  params: VerifyEmailParams,
  result: VerificationResult,
  log: Logger
): Promise<void> {
  const cacheKey = `${params.emailAddress}:smtp`;
  const smtpCache = getCacheStore<SmtpVerificationResult>(params.cache, 'smtp');
  const cached = await smtpCache.get(cacheKey);

  if (cached) {
    applySmtpResult(result, cached);
    result.metadata.cached = true;
    log(`[verifyEmail] SMTP cache hit: ${result.validSmtp} for ${params.emailAddress}`);
  } else {
    const { smtpResult, cached: probedFromCache } = await verifyMailboxSMTP({
      local,
      domain,
      mxRecords,
      options: {
        cache: params.cache,
        ports: resolveSmtpPorts(params.smtpPort, mxRecords[0]),
        timeout: params.timeout ?? 4000,
        debug: params.debug ?? false,
      },
    });
    await smtpCache.set(cacheKey, smtpResult);
    applySmtpResult(result, smtpResult);
    result.metadata.cached = probedFromCache;
    log(`[verifyEmail] SMTP probed: ${result.validSmtp} for ${params.emailAddress}`);
  }

  if (result.validSmtp === false) result.metadata.error = VerificationErrorCode.mailboxNotFound;
  else if (result.validSmtp === null) result.metadata.error = VerificationErrorCode.smtpConnectionFailed;
}
