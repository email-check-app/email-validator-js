import { parse } from 'psl';
import { getCacheStore } from './cache';
import { resolveMxRecords } from './dns';
import { suggestEmailDomain } from './domain-suggester';
import { detectNameFromEmail } from './name-detector';
import { verifyMailboxSMTP } from './smtp';
import {
  type DisposableEmailResult,
  type EmailProvider,
  type FreeEmailResult,
  type IDisposableEmailParams,
  type IFreeEmailParams,
  type IVerifyEmailParams,
  type SmtpVerificationResult,
  VerificationErrorCode,
  type VerificationResult,
} from './types';

import { isValidEmail, isValidEmailDomain } from './validator';
import { getDomainAge, getDomainRegistrationStatus } from './whois';

export * from './adapters/lru-adapter';
export * from './adapters/redis-adapter';
export { verifyEmailBatch } from './batch';
export * from './cache';
export * from './cache-interface';
// Export check-if-email-exists types
export type {
  CheckIfEmailExistsCoreResult,
  EmailProvider as EmailProviderType,
  ICheckIfEmailExistsCoreParams,
  MxLookupResult,
  SmtpVerificationResult,
} from './check-if-email-exists';
// Export check-if-email-exists functionality
export {
  CHECK_IF_EMAIL_EXISTS_CONSTANTS,
  checkIfEmailExistsCore,
  EmailProvider,
  getProviderFromMxHost,
  getProviderType,
  isGmail,
  isHotmailB2B,
  isHotmailB2C,
  isMimecast,
  isProofpoint,
  isYahoo,
  queryMxRecords,
  SmtpErrorParser,
  validateEmailSyntax,
  verifySmtpConnection,
} from './check-if-email-exists';
export {
  COMMON_EMAIL_DOMAINS,
  defaultDomainSuggestionMethod,
  getDomainSimilarity,
  isCommonDomain,
  suggestDomain,
  suggestEmailDomain,
} from './domain-suggester';
export {
  cleanNameForAlgrothin,
  defaultNameDetectionMethod,
  detectName,
  detectNameForAlgrothin,
  detectNameFromEmail,
} from './name-detector';
// Re-export types
export * from './types';
export { isValidEmail, isValidEmailDomain } from './validator';
export { getDomainAge, getDomainRegistrationStatus } from './whois';

let disposableEmailProviders: Set<string>;
let freeEmailProviders: Set<string>;

export async function isDisposableEmail(params: IDisposableEmailParams): Promise<boolean> {
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
  } catch (_error) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isDisposableEmail] Cache hit for ${emailDomain}: ${cached.isDisposable}`);
    return cached.isDisposable;
  }

  if (!disposableEmailProviders) {
    disposableEmailProviders = new Set(require('./disposable-email-providers.json'));
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
  } catch (_error) {
    // Cache error, ignore it
    log(`[isDisposableEmail] Cache write error for ${emailDomain}`);
  }
  log(`[isDisposableEmail] Check result for ${emailDomain}: ${isDisposable}`);
  return isDisposable;
}

export async function isFreeEmail(params: IFreeEmailParams): Promise<boolean> {
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
  } catch (_error) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    log(`[isFreeEmail] Cache hit for ${emailDomain}: ${cached.isFree}`);
    return cached.isFree;
  }

  if (!freeEmailProviders) {
    freeEmailProviders = new Set(require('./free-email-providers.json'));
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
  } catch (_error) {
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
 * Verify email address
 */
export async function verifyEmail(params: IVerifyEmailParams): Promise<VerificationResult> {
  const {
    emailAddress,
    timeout = 4000,
    verifyMx = true,
    verifySmtp = false,
    debug = false,
    checkDisposable = true,
    checkFree = true,
    detectName = false,
    nameDetectionMethod,
    suggestDomain = true,
    domainSuggestionMethod,
    commonDomains,
    checkDomainAge = false,
    checkDomainRegistration = false,
    whoisTimeout = 5000,
    skipMxForDisposable = false,
    skipDomainWhoisForDisposable = false,
  } = params;

  const startTime = Date.now();
  const log = debug ? console.debug : (..._args: unknown[]) => {};

  // Initialize result with flat structure
  const result: VerificationResult = {
    email: emailAddress,
    validFormat: false,
    validMx: null,
    validSmtp: null,
    isDisposable: false,
    isFree: false,
    metadata: {
      verificationTime: 0,
      cached: false,
    },
  };

  // Format validation
  if (!isValidEmail(emailAddress)) {
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
      result.metadata.error = VerificationErrorCode.INVALID_FORMAT;
    }
    return result;
  }
  result.validFormat = true;

  // Detect name if requested
  if (detectName) {
    result.detectedName = detectNameFromEmail({
      email: emailAddress,
      customMethod: nameDetectionMethod,
    });
  }

  // Suggest domain if requested
  if (suggestDomain) {
    const [, emailDomain] = emailAddress.split('@');
    if (emailDomain) {
      const suggestion = domainSuggestionMethod
        ? domainSuggestionMethod(emailDomain)
        : await suggestEmailDomain(emailAddress, commonDomains);
      if (suggestion) {
        result.domainSuggestion = suggestion;
      } else {
        result.domainSuggestion = null;
      }
    }
  }

  const [local, domain] = emailAddress.split('@');
  if (!domain || !local) {
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
      result.metadata.error = VerificationErrorCode.INVALID_FORMAT;
    }
    return result;
  }

  // Domain validation
  if (!(await isValidEmailDomain(domain, params.cache))) {
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
      result.metadata.error = VerificationErrorCode.INVALID_DOMAIN;
    }
    return result;
  }

  // Check disposable first (to potentially skip expensive operations)
  if (checkDisposable) {
    log(`[verifyEmail] Checking if ${emailAddress} is disposable email`);
    result.isDisposable = await isDisposableEmail({ emailOrDomain: emailAddress, cache: params.cache, logger: log });
    log(`[verifyEmail] Disposable check result: ${result.isDisposable}`);
    if (result.isDisposable && result.metadata) {
      result.metadata.error = VerificationErrorCode.DISPOSABLE_EMAIL;
    }
  }

  // Check free provider
  if (checkFree) {
    log(`[verifyEmail] Checking if ${emailAddress} is free email provider`);
    result.isFree = await isFreeEmail({ emailOrDomain: emailAddress, cache: params.cache, logger: log });
    log(`[verifyEmail] Free email check result: ${result.isFree}`);
  }

  // Skip MX and WHOIS checks if disposable and skip options are enabled
  const shouldSkipMx = skipMxForDisposable && result.isDisposable;
  const shouldSkipDomainWhois = skipDomainWhoisForDisposable && result.isDisposable;

  if (shouldSkipMx) {
    log(`[verifyEmail] Skipping MX record check for disposable email: ${emailAddress}`);
  }
  if (shouldSkipDomainWhois) {
    log(`[verifyEmail] Skipping domain WHOIS checks for disposable email: ${emailAddress}`);
  }

  // Check domain age if requested (skip if disposable email and option is enabled)
  if (checkDomainAge && !shouldSkipDomainWhois) {
    log(`[verifyEmail] Checking domain age for ${domain}`);
    try {
      result.domainAge = await getDomainAge(domain, whoisTimeout, debug, params.cache);
      log(`[verifyEmail] Domain age result:`, result.domainAge ? `${result.domainAge.ageInDays} days` : 'null');
    } catch (err) {
      log('[verifyEmail] Failed to get domain age', err);
      result.domainAge = null;
    }
  } else if (checkDomainAge && shouldSkipDomainWhois) {
    log(`[verifyEmail] Domain age check skipped due to disposable email and skipDomainWhoisForDisposable=true`);
  }

  // Check domain registration if requested (skip if disposable email and option is enabled)
  if (checkDomainRegistration && !shouldSkipDomainWhois) {
    log(`[verifyEmail] Checking domain registration status for ${domain}`);
    try {
      result.domainRegistration = await getDomainRegistrationStatus(domain, whoisTimeout, debug, params.cache);
      log(
        `[verifyEmail] Domain registration result:`,
        result.domainRegistration?.isRegistered ? 'registered' : 'not registered'
      );
    } catch (err) {
      log('[verifyEmail] Failed to get domain registration status', err);
      result.domainRegistration = null;
    }
  } else if (checkDomainRegistration && shouldSkipDomainWhois) {
    log(
      `[verifyEmail] Domain registration check skipped due to disposable email and skipDomainWhoisForDisposable=true`
    );
  }

  // MX Records verification (skip if disposable email and option is enabled)
  if ((verifyMx || verifySmtp) && !shouldSkipMx) {
    log(`[verifyEmail] Checking MX records for ${domain}`);
    try {
      const mxRecords = await resolveMxRecords({ domain, cache: params.cache, logger: log });
      result.validMx = mxRecords.length > 0;
      log(`[verifyEmail] MX records found: ${mxRecords.length}, valid: ${result.validMx}`);

      if (!result.validMx && result.metadata) {
        result.metadata.error = VerificationErrorCode.NO_MX_RECORDS;
      }

      // SMTP verification
      if (verifySmtp && mxRecords.length > 0) {
        const cacheKey = `${emailAddress}:smtp`;
        const smtpCacheInstance = getCacheStore<SmtpVerificationResult>(params.cache, 'smtp');
        const cachedSmtp = await smtpCacheInstance.get(cacheKey);

        if (cachedSmtp !== null && cachedSmtp !== undefined) {
          // Extract isDeliverable from rich cache result for backwards compatibility
          result.validSmtp = cachedSmtp.isDeliverable ?? null;
          log(`[verifyEmail] SMTP result from cache: ${result.validSmtp} for ${emailAddress}`);
          if (result.metadata) {
            result.metadata.cached = true;
          }
          // Still need to detect name if requested and not done yet
          if (detectName && !result.detectedName) {
            result.detectedName = detectNameFromEmail({
              email: emailAddress,
              customMethod: nameDetectionMethod,
            });
          }
        } else {
          log(`[verifyEmail] Performing SMTP verification for ${emailAddress}`);
          let domainPort = params.smtpPort;
          if (!domainPort) {
            const mxDomain = parse(mxRecords[0]);
            if ('domain' in mxDomain && mxDomain.domain) {
              domainPort = domainPorts[mxDomain.domain];
            }
          }

          const { smtpResult, cached, port } = await verifyMailboxSMTP({
            local,
            domain,
            mxRecords,
            options: {
              cache: params.cache,
              ports: domainPort ? [domainPort] : undefined,
              timeout,
              debug,
              maxRetries: params.retryAttempts,
            },
          });

          // Cache the rich SmtpVerificationResult
          await smtpCacheInstance.set(cacheKey, smtpResult);

          // If we couldn't connect to SMTP, return null (unable to verify)
          // If we connected but verification failed, return false (verified as invalid)
          if (!smtpResult.canConnectSmtp) {
            result.validSmtp = null;
          } else {
            result.validSmtp = smtpResult.isDeliverable;
          }

          if (result.metadata) result.metadata.cached = cached;

          log(
            `[verifyEmail] SMTP verification result: ${result.validSmtp} for ${emailAddress} (cached for future use)`
          );
        }

        if (result.validSmtp === false && result.metadata) {
          result.metadata.error = VerificationErrorCode.MAILBOX_NOT_FOUND;
        } else if (result.validSmtp === null && result.metadata) {
          result.metadata.error = VerificationErrorCode.SMTP_CONNECTION_FAILED;
        }
      }
    } catch (err) {
      log('[verifyEmail] Failed to resolve MX records', err);
      result.validMx = false;
      if (result.metadata) {
        result.metadata.error = VerificationErrorCode.NO_MX_RECORDS;
      }
    }
  } else if ((verifyMx || verifySmtp) && shouldSkipMx) {
    log(`[verifyEmail] MX/SMTP checks skipped due to disposable email and skipMxForDisposable=true`);
  }

  if (result.metadata) {
    result.metadata.verificationTime = Date.now() - startTime;
  }

  return result;
}
