/**
 * Netlify Functions adapter for email validation.
 *
 * Netlify Functions run on AWS Lambda under the hood, so the event/result
 * shape is structurally identical to API Gateway proxy events. The adapter
 * surfaces the same routed paths and CORS handling as the AWS adapter:
 *
 *   GET  /.netlify/functions/<name>/health
 *   POST /.netlify/functions/<name>/validate
 *   POST /.netlify/functions/<name>/validate/batch
 *
 * Netlify also supports redirects via `_redirects` / `netlify.toml` so users
 * commonly map `/api/*` → `/.netlify/functions/<name>/:splat` to keep URLs
 * clean. The handler accepts both forms.
 *
 * Two handler shapes are exported:
 *   - `netlifyHandler`: routed; recommended.
 *   - `netlifyFunction`: single-route convenience that infers single vs. batch
 *     from the body, useful when one function = one URL.
 */
import type { ValidateEmailOptions } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody, validateBatchEmailsField } from '../_shared/validation';
import { validateEmailCore } from '../verifier';

/** Netlify event — structurally compatible with API Gateway proxy events. */
export interface NetlifyEvent {
  body: string | null;
  headers: { [key: string]: string | undefined };
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string | undefined } | null;
  isBase64Encoded?: boolean;
  rawUrl?: string;
}

export interface NetlifyResult {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;
}

/** Function context — Netlify mirrors a subset of the Lambda context. */
export interface NetlifyContext {
  functionName?: string;
  awsRequestId?: string;
  identity?: unknown;
  clientContext?: unknown;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = ROUTED_HEADERS
): NetlifyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function decodeBody(event: NetlifyEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

/**
 * Strip Netlify's function-prefix from the incoming path so route matching
 * works regardless of whether the user hits the raw function URL or a
 * `/api/*` redirect.
 */
function normalizePath(rawPath: string): string {
  // Common forms:
  //   /.netlify/functions/<name>/health
  //   /api/health   (with redirect)
  //   /health       (custom config)
  const stripped = rawPath.replace(/^\/.netlify\/functions\/[^/]+/, '').replace(/^\/api/, '');
  return stripped || '/';
}

function parseValidateOptions(query: NetlifyEvent['queryStringParameters']): Partial<ValidateEmailOptions> {
  if (!query) return {};
  const options: Partial<ValidateEmailOptions> = {};
  if (query.skipCache === 'true') options.skipCache = true;
  if (query.validateTypo === 'false') options.validateTypo = false;
  return options;
}

/** Routed Netlify handler. */
export async function netlifyHandler(event: NetlifyEvent, _context?: NetlifyContext): Promise<NetlifyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const path = normalizePath(event.path);

  if (path === '/health' && event.httpMethod === 'GET') {
    return jsonResponse(200, { status: 'healthy', platform: 'netlify', timestamp: new Date().toISOString() });
  }

  const isValidatePath = path === '/validate' || path === '/validate/batch';
  if (isValidatePath && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (path === '/validate' && event.httpMethod === 'POST') {
    try {
      const body = decodeBody(event) as { email?: string };
      if (!body.email) return jsonResponse(400, { error: 'Email is required' });

      const options = parseValidateOptions(event.queryStringParameters);
      const result = await validateEmailCore(body.email, options);
      return jsonResponse(200, result);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
      console.error('Netlify validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  }

  if (path === '/validate/batch' && event.httpMethod === 'POST') {
    try {
      const body = decodeBody(event) as ValidationRequestBody;
      const validated = validateBatchEmailsField(body.emails);
      if (!validated.ok) return jsonResponse(validated.status, { error: validated.message });
      const results = await executeValidation({ kind: 'batch', emails: validated.emails });
      return jsonResponse(200, { results });
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
      console.error('Netlify batch validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  }

  return jsonResponse(404, { error: 'Not found' });
}

/**
 * Single-route convenience — infers single vs. batch from the body. Useful
 * when each function is mapped to a distinct URL and you don't need internal
 * routing.
 */
export async function netlifyFunction(event: NetlifyEvent, _context?: NetlifyContext): Promise<NetlifyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders('POST, OPTIONS'), body: '' };
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { success: false, error: 'Method not allowed' });

  try {
    const body = decodeBody(event) as ValidationRequestBody;
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message });
    }
    const data = await executeValidation(classified);
    return jsonResponse(200, { success: true, data });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse(400, { success: false, error: 'Invalid request body' });
    console.error('Netlify function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message });
  }
}

export default {
  netlifyHandler,
  netlifyFunction,
};
