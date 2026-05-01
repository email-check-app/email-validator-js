/**
 * Azure Functions adapter for email validation.
 *
 * Targets the v4 programming model:
 *   `(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>`
 *
 * The HttpRequest is a Web-API-aligned shape (`request.json()`, `request.method`,
 * `request.query`, `request.headers`), so the adapter reads the body via the
 * Web API. Routes:
 *   - GET  /api/health
 *   - POST /api/validate
 *   - POST /api/validate/batch
 *
 * Two handler shapes are exported:
 *   - `azureHandler`: routed (recommended).
 *   - `azureFunction`: single-route convenience that infers single vs. batch
 *     from the body — for one-function-per-URL setups.
 *
 * The interfaces below are minimal subsets of the official `@azure/functions`
 * types so callers can pass real Azure types without an extra cast.
 */
import type { ValidateEmailOptions } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody, validateBatchEmailsField } from '../_shared/validation';
import { validateEmailCore } from '../verifier';

export interface AzureHttpRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null } | Record<string, string | undefined>;
  query: { get(name: string): string | null } | Record<string, string | undefined>;
  json(): Promise<unknown>;
  text?: () => Promise<string>;
}

export interface AzureInvocationContext {
  invocationId?: string;
  functionName?: string;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface AzureHttpResponseInit {
  status: number;
  headers: Record<string, string>;
  jsonBody?: unknown;
  body?: string;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = ROUTED_HEADERS
): AzureHttpResponseInit {
  return { status, headers, jsonBody: body };
}

function pathOf(req: AzureHttpRequest): string {
  try {
    return new URL(req.url).pathname || '/';
  } catch {
    // Some test harnesses pass a bare path. Treat it as the pathname.
    const idx = req.url.indexOf('?');
    return idx === -1 ? req.url : req.url.slice(0, idx);
  }
}

function readQuery(query: AzureHttpRequest['query'], key: string): string | undefined {
  if (typeof (query as { get?: unknown }).get === 'function') {
    const v = (query as { get: (k: string) => string | null }).get(key);
    return v ?? undefined;
  }
  const value = (query as Record<string, string | undefined>)[key];
  return value;
}

function parseValidateOptions(query: AzureHttpRequest['query']): Partial<ValidateEmailOptions> {
  const options: Partial<ValidateEmailOptions> = {};
  if (readQuery(query, 'skipCache') === 'true') options.skipCache = true;
  if (readQuery(query, 'validateTypo') === 'false') options.validateTypo = false;
  return options;
}

async function readJsonBody(req: AzureHttpRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

/** Routed Azure Functions v4 handler. */
export async function azureHandler(
  req: AzureHttpRequest,
  _context?: AzureInvocationContext
): Promise<AzureHttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders() };
  }

  const path = pathOf(req);

  if (path === '/api/health' && req.method === 'GET') {
    return jsonResponse(200, { status: 'healthy', platform: 'azure', timestamp: new Date().toISOString() });
  }

  const isValidatePath = path === '/api/validate' || path === '/api/validate/batch';
  if (isValidatePath && req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (path === '/api/validate' && req.method === 'POST') {
    try {
      const body = (await readJsonBody(req)) as { email?: string };
      if (!body.email) return jsonResponse(400, { error: 'Email is required' });
      const options = parseValidateOptions(req.query);
      const result = await validateEmailCore(body.email, options);
      return jsonResponse(200, result);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
      console.error('Azure validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  }

  if (path === '/api/validate/batch' && req.method === 'POST') {
    try {
      const body = (await readJsonBody(req)) as ValidationRequestBody;
      const validated = validateBatchEmailsField(body.emails);
      if (!validated.ok) return jsonResponse(validated.status, { error: validated.message });
      const results = await executeValidation({ kind: 'batch', emails: validated.emails });
      return jsonResponse(200, { results });
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
      console.error('Azure batch validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  }

  return jsonResponse(404, { error: 'Not found' });
}

/** Single-route convenience — infers single vs. batch from the body. */
export async function azureFunction(
  req: AzureHttpRequest,
  _context?: AzureInvocationContext
): Promise<AzureHttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders('POST, OPTIONS') };
  }
  if (req.method !== 'POST') return jsonResponse(405, { success: false, error: 'Method not allowed' });

  try {
    const body = (await readJsonBody(req)) as ValidationRequestBody;
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message });
    }
    const data = await executeValidation(classified);
    return jsonResponse(200, { success: true, data });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse(400, { success: false, error: 'Invalid request body' });
    console.error('Azure function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message });
  }
}

export default {
  azureHandler,
  azureFunction,
};
