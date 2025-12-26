import { verifyEmail } from './index';
import type { BatchVerificationResult, IBatchVerifyParams, VerificationResult } from './types';
import { VerificationErrorCode } from './types';

/**
 * Verify multiple email addresses in parallel with concurrency control
 */
export async function verifyEmailBatch(params: IBatchVerifyParams): Promise<BatchVerificationResult> {
  const {
    emailAddresses,
    concurrency = 5,
    timeout = 4000,
    verifyMx = true,
    verifySmtp = false,
    checkDisposable = true,
    checkFree = true,
    detectName = false,
    nameDetectionMethod,
    suggestDomain = false,
    domainSuggestionMethod,
    commonDomains,
    skipMxForDisposable = false,
    skipDomainWhoisForDisposable = false,
    cache,
  } = params;

  const startTime = Date.now();
  const results = new Map<string, VerificationResult>();

  // Process emails in batches
  const batches = [];
  for (let i = 0; i < emailAddresses.length; i += concurrency) {
    batches.push(emailAddresses.slice(i, i + concurrency));
  }

  let totalValid = 0;
  let totalInvalid = 0;
  let totalErrors = 0;

  for (const batch of batches) {
    const batchPromises = batch.map(async (email) => {
      try {
        const result = await verifyEmail({
          emailAddress: email,
          timeout,
          verifyMx,
          verifySmtp,
          checkDisposable,
          checkFree,
          detectName,
          nameDetectionMethod,
          suggestDomain,
          domainSuggestionMethod,
          commonDomains,
          skipMxForDisposable,
          skipDomainWhoisForDisposable,
          cache,
        });

        if (result.validFormat) {
          totalValid++;
        } else {
          totalInvalid++;
        }

        return { email, result };
      } catch (error) {
        totalErrors++;
        return {
          email,
          result: createErrorResult(email, error),
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const { email, result } of batchResults) {
      results.set(email, result);
    }
  }

  return {
    results,
    summary: {
      total: emailAddresses.length,
      valid: totalValid,
      invalid: totalInvalid,
      errors: totalErrors,
      processingTime: Date.now() - startTime,
    },
  };
}

function createErrorResult(email: string, _error: unknown): VerificationResult {
  return {
    email,
    validFormat: false,
    validMx: null,
    validSmtp: null,
    isDisposable: false,
    isFree: false,
    metadata: {
      verificationTime: 0,
      cached: false,
      error: VerificationErrorCode.smtpConnectionFailed,
    },
  };
}
