import type { EmailValidationResult } from '../../types';
import { validateEmailBatch, validateEmailCore } from '../verifier';
import type { ValidationDispatch } from './validation';

/**
 * Execute a classified request against the core validator. Single-email
 * requests yield one result; batch requests yield an array.
 */
export async function executeValidation(
  dispatch: ValidationDispatch
): Promise<EmailValidationResult | EmailValidationResult[]> {
  if (dispatch.kind === 'single') {
    return validateEmailCore(dispatch.email, dispatch.options);
  }
  return validateEmailBatch(dispatch.emails, dispatch.options);
}
