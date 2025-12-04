import { parse } from 'psl';
import { disposableCacheStore, freeCacheStore, smtpCacheStore } from './cache';
import type { ICache } from './cache-interface';
import { resolveMxRecords } from './dns';
import { suggestEmailDomain } from './domain-suggester';
import { detectNameFromEmail } from './name-detector';
import { verifyMailboxSMTP } from './smtp';
import { type DetailedVerificationResult, type IVerifyEmailParams, VerificationErrorCode } from './types';
import { isValidEmail, isValidEmailDomain } from './validator';
import { getDomainAge, getDomainRegistrationStatus } from './whois';

export { verifyEmailBatch } from './batch';
export { clearAllCaches } from './cache';
export {
  COMMON_EMAIL_DOMAINS,
  defaultDomainSuggestionMethod,
  getDomainSimilarity,
  isCommonDomain,
  suggestDomain,
  suggestEmailDomain,
} from './domain-suggester';
export { defaultNameDetectionMethod, detectName, detectNameFromEmail } from './name-detector';
// Re-export types
export * from './types';
export { isValidEmail, isValidEmailDomain } from './validator';
export { getDomainAge, getDomainRegistrationStatus } from './whois';

let disposableEmailProviders: Set<string>;
let freeEmailProviders: Set<string>;

export async function isDisposableEmail(emailOrDomain: string, cache?: ICache | null): Promise<boolean> {
  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) {
    return false;
  }

  // Check cache first
  const cacheStore = disposableCacheStore(cache);
  let cached: boolean | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch (_error) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  if (!disposableEmailProviders) {
    disposableEmailProviders = new Set(require('./disposable-email-providers.json'));
  }

  const result = disposableEmailProviders.has(emailDomain);
  try {
    await cacheStore.set(emailDomain, result);
  } catch (_error) {
    // Cache error, ignore it
  }
  return result;
}

export async function isFreeEmail(emailOrDomain: string, cache?: ICache | null): Promise<boolean> {
  const parts = emailOrDomain.split('@');
  const emailDomain = parts.length > 1 ? parts[1] : parts[0];
  if (!emailDomain) {
    return false;
  }

  // Check cache first
  const cacheStore = freeCacheStore(cache);
  let cached: boolean | null | undefined;
  try {
    cached = await cacheStore.get(emailDomain);
  } catch (_error) {
    // Cache error, continue with processing
    cached = null;
  }
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  if (!freeEmailProviders) {
    freeEmailProviders = new Set(require('./free-email-providers.json'));
  }

  const result = freeEmailProviders.has(emailDomain);
  try {
    await cacheStore.set(emailDomain, result);
  } catch (_error) {
    // Cache error, ignore it
  }
  return result;
}

export const domainPorts: Record<string, number> = {
  // 465 or 587
  // https://help.ovhcloud.com/csm/en-ca-web-paas-development-email?id=kb_article_view&sysparm_article=KB0053893
  'ovh.net': 465,
};

/**
 * Verify email address
 */
export async function verifyEmail(params: IVerifyEmailParams): Promise<DetailedVerificationResult> {
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
  } = params;

  const startTime = Date.now();
  const log = debug ? console.debug : (..._args: unknown[]) => {};

  const result: DetailedVerificationResult = {
    valid: false,
    email: emailAddress,
    format: { valid: false },
    domain: { valid: null },
    smtp: { valid: null },
    disposable: false,
    freeProvider: false,
    metadata: {
      verificationTime: 0,
      cached: false,
    },
  };

  // Format validation
  if (!isValidEmail(emailAddress)) {
    result.format.error = VerificationErrorCode.INVALID_FORMAT;
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
    }
    return result;
  }
  result.format.valid = true;

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
      result.domainSuggestion = domainSuggestionMethod
        ? domainSuggestionMethod(emailDomain)
        : await suggestEmailDomain(emailAddress, commonDomains);
    }
  }

  const [local, domain] = emailAddress.split('@');
  if (!domain || !local) {
    result.format.error = VerificationErrorCode.INVALID_FORMAT;
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
    }
    return result;
  }

  // Domain validation
  if (!(await isValidEmailDomain(domain, params.cache))) {
    result.domain.error = VerificationErrorCode.INVALID_DOMAIN;
    if (result.metadata) {
      result.metadata.verificationTime = Date.now() - startTime;
    }
    return result;
  }

  // Check disposable
  if (checkDisposable) {
    result.disposable = await isDisposableEmail(emailAddress, params.cache);
    if (result.disposable) {
      result.valid = false;
      result.domain.error = VerificationErrorCode.DISPOSABLE_EMAIL;
    }
  }

  // Check free provider
  if (checkFree) {
    result.freeProvider = await isFreeEmail(emailAddress, params.cache);
  }

  // Check domain age if requested
  if (checkDomainAge) {
    try {
      result.domainAge = await getDomainAge(domain, whoisTimeout);
    } catch (err) {
      log('[verifyEmailDetailed] Failed to get domain age', err);
      result.domainAge = null;
    }
  }

  // Check domain registration if requested
  if (checkDomainRegistration) {
    try {
      result.domainRegistration = await getDomainRegistrationStatus(domain, whoisTimeout);
    } catch (err) {
      log('[verifyEmailDetailed] Failed to get domain registration status', err);
      result.domainRegistration = null;
    }
  }

  // MX Records verification
  if (verifyMx || verifySmtp) {
    try {
      const mxRecords = await resolveMxRecords(domain, params.cache);
      result.domain.mxRecords = mxRecords;
      result.domain.valid = mxRecords.length > 0;

      if (!result.domain.valid) {
        result.domain.error = VerificationErrorCode.NO_MX_RECORDS;
      }

      // SMTP verification
      if (verifySmtp && mxRecords.length > 0) {
        const cacheKey = `${emailAddress}:smtp`;
        const smtpCacheInstance = smtpCacheStore(params.cache);
        const cachedSmtp = await smtpCacheInstance.get(cacheKey);

        if (cachedSmtp !== null && cachedSmtp !== undefined) {
          result.smtp.valid = cachedSmtp;
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
          let domainPort = params.smtpPort;
          if (!domainPort) {
            const mxDomain = parse(mxRecords[0]);
            if ('domain' in mxDomain && mxDomain.domain) {
              domainPort = domainPorts[mxDomain.domain];
            }
          }

          const smtpResult = await verifyMailboxSMTP({
            local,
            domain,
            mxRecords,
            timeout,
            debug,
            port: domainPort,
            retryAttempts: params.retryAttempts,
          });

          await smtpCacheInstance.set(cacheKey, smtpResult);
          result.smtp.valid = smtpResult;
        }

        if (result.smtp.valid === false) {
          result.smtp.error = VerificationErrorCode.MAILBOX_NOT_FOUND;
        } else if (result.smtp.valid === null) {
          result.smtp.error = VerificationErrorCode.SMTP_CONNECTION_FAILED;
        }
      }
    } catch (err) {
      log('[verifyEmailDetailed] Failed to resolve MX records', err);
      result.domain.valid = false;
      result.domain.error = VerificationErrorCode.NO_MX_RECORDS;
    }
  }

  // Determine overall validity
  result.valid =
    result.format.valid && result.domain.valid !== false && result.smtp.valid !== false && !result.disposable;

  if (result.metadata) {
    result.metadata.verificationTime = Date.now() - startTime;
  }
  return result;
}
