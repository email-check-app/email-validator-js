/**
 * Netlify Functions — routed handler with /health, /validate, /validate/batch.
 *
 * The adapter strips Netlify's `/.netlify/functions/<name>` prefix and the
 * common `/api/*` redirect prefix automatically — so the same handler works
 * whether the request hits the raw function URL or comes through a redirect.
 *
 * Pair with the netlify.toml at the repo root for clean `/api/*` URLs.
 */

// Production:
// import { netlifyHandler } from '@emailcheck/email-validator-js/serverless/netlify';

// Local development against the source:
import { netlifyHandler } from '../../../../../src/serverless/adapters/netlify';

export const handler = netlifyHandler;
