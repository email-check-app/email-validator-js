/**
 * Google Cloud Functions (2nd gen) adapter for email validation.
 *
 * 2nd-gen Cloud Functions run on Cloud Run and use the Functions Framework's
 * Express-style `(req, res)` signature. The routed handler exposes:
 *   - GET  /health
 *   - POST /validate
 *   - POST /validate/batch
 *
 * Two handler shapes are exported:
 *   - `gcpHandler`: routed (recommended).
 *   - `gcpFunction`: single-route convenience that infers single vs. batch
 *     from the body, useful when you've already configured your function
 *     URL with one path.
 *
 * The interfaces below intentionally mirror the relevant subset of
 * `express-serve-static-core`'s Request / Response so callers can pass the
 * Functions Framework's req/res without an extra cast.
 */
import type { ValidateEmailOptions } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody, validateBatchEmailsField } from '../_shared/validation';
import { validateEmailCore } from '../verifier';

/**
 * Express-shaped request. We only consume the fields the Functions Framework
 * guarantees: method, path (the URL path inside the function), query, body,
 * and the lowercase headers map.
 */
export interface GcpRequest {
  method: string;
  path?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface GcpResponse {
  status(code: number): GcpResponse;
  set(headers: Record<string, string>): GcpResponse;
  json(body: unknown): GcpResponse;
  send(body?: unknown): GcpResponse;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function pathOf(req: GcpRequest): string {
  if (req.path) return req.path;
  if (req.url) {
    const idx = req.url.indexOf('?');
    return idx === -1 ? req.url : req.url.slice(0, idx);
  }
  return '/';
}

function readJsonBody(req: GcpRequest): ValidationRequestBody {
  // Functions Framework parses application/json automatically. Tests may pass
  // a string body to mimic edge cases; tolerate both forms.
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as ValidationRequestBody;
    } catch {
      return {};
    }
  }
  return (req.body as ValidationRequestBody | undefined) ?? {};
}

function parseValidateOptions(query: GcpRequest['query']): Partial<ValidateEmailOptions> {
  if (!query) return {};
  const options: Partial<ValidateEmailOptions> = {};
  const skip = query.skipCache;
  const typo = query.validateTypo;
  if (skip === 'true') options.skipCache = true;
  if (typo === 'false') options.validateTypo = false;
  return options;
}

/**
 * Routed Cloud Functions handler. Wire it as the function entry point:
 *
 *   import { gcpHandler } from '@emailcheck/email-validator-js/serverless/gcp';
 *   export const validateEmail = gcpHandler;
 */
export async function gcpHandler(req: GcpRequest, res: GcpResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).set(corsHeaders()).send();
    return;
  }

  const path = pathOf(req);

  if (path === '/health' && req.method === 'GET') {
    res
      .status(200)
      .set(ROUTED_HEADERS)
      .json({ status: 'healthy', platform: 'gcp', timestamp: new Date().toISOString() });
    return;
  }

  const isValidatePath = path === '/validate' || path === '/validate/batch';
  if (isValidatePath && req.method !== 'POST') {
    res.status(405).set(ROUTED_HEADERS).json({ error: 'Method not allowed' });
    return;
  }

  if (path === '/validate' && req.method === 'POST') {
    try {
      const body = readJsonBody(req);
      if (!body.email) {
        res.status(400).set(ROUTED_HEADERS).json({ error: 'Email is required' });
        return;
      }
      const options = parseValidateOptions(req.query);
      const result = await validateEmailCore(body.email, options);
      res.status(200).set(ROUTED_HEADERS).json(result);
      return;
    } catch (error) {
      console.error('GCP validation error:', error);
      res.status(500).set(ROUTED_HEADERS).json({ error: 'Internal server error' });
      return;
    }
  }

  if (path === '/validate/batch' && req.method === 'POST') {
    try {
      const body = readJsonBody(req);
      const validated = validateBatchEmailsField(body.emails);
      if (!validated.ok) {
        res.status(validated.status).set(ROUTED_HEADERS).json({ error: validated.message });
        return;
      }
      const results = await executeValidation({ kind: 'batch', emails: validated.emails });
      res.status(200).set(ROUTED_HEADERS).json({ results });
      return;
    } catch (error) {
      console.error('GCP batch validation error:', error);
      res.status(500).set(ROUTED_HEADERS).json({ error: 'Internal server error' });
      return;
    }
  }

  res.status(404).set(ROUTED_HEADERS).json({ error: 'Not found' });
}

/**
 * Single-route convenience handler — infers single-vs-batch from the body
 * and ignores the request path. Use this when the function's URL itself
 * is the entry point and you don't need internal routing.
 */
export async function gcpFunction(req: GcpRequest, res: GcpResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).set(corsHeaders('POST, OPTIONS')).send();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).set(ROUTED_HEADERS).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = readJsonBody(req);
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      res.status(classified.status).set(ROUTED_HEADERS).json({ success: false, error: classified.message });
      return;
    }
    const data = await executeValidation(classified);
    res.status(200).set(ROUTED_HEADERS).json({ success: true, data });
  } catch (error) {
    console.error('GCP function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).set(ROUTED_HEADERS).json({ success: false, error: message });
  }
}

export default {
  gcpHandler,
  gcpFunction,
};
