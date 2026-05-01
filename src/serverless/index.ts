/**
 * Serverless Email Validator - Main Export
 * Platform-agnostic email validation for serverless environments
 */

// Re-export types
export type {
  DomainSuggesterOptions,
  EmailValidationResult,
  ValidateEmailOptions,
  ValidatorResult,
  VerifyMailboxSMTPParams,
} from '../types';

// Platform adapters
export { default as awsLambda } from './adapters/aws-lambda';
export { default as azure } from './adapters/azure';
export { default as cloudflare, EmailValidatorDO } from './adapters/cloudflare';
export { default as gcp } from './adapters/gcp';
export { default as netlify } from './adapters/netlify';
export { default as vercel } from './adapters/vercel';
// Core functionality
export {
  COMMON_DOMAINS,
  clearCache,
  type DNSResolver,
  DoHResolver,
  type DoHResolverOptions,
  EdgeCache,
  StubDNSResolver,
  suggestDomain,
  validateEmailBatch,
  validateEmailCore,
  validateEmailCore as validateEmail,
} from './verifier';
