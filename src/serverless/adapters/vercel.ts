/**
 * Vercel Edge Function adapter for email validation.
 *
 * Three handler shapes are exported for backward compatibility:
 *   - `edgeHandler`: Web-API style, no path routing.
 *   - `nodeHandler`: Express-style req/res for the Node.js runtime.
 *   - `handler`: routed Web-API handler with `/api/health`, `/api/validate`,
 *     `/api/validate/batch`.
 *
 * Shared validation/CORS logic comes from `../_shared/`.
 */
import type { ValidateEmailOptions } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody, validateBatchEmailsField } from '../_shared/validation';
import { validateEmailBatch, validateEmailCore } from '../verifier';

export interface VercelRequest {
  method: string;
  url: string;
  headers: Headers;
  body?: unknown;
  query?: { [key: string]: string | string[] };
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  send: (data: unknown) => void;
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, GET, OPTIONS'));
const ROUTED_HEADERS = jsonHeaders({
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0',
  'X-Powered-By': 'Vercel Edge Functions',
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = POST_HEADERS): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function parseGetParams(url: URL): ValidationRequestBody {
  const email = url.searchParams.get('email');
  const emails = url.searchParams.get('emails');
  return {
    email: email || undefined,
    emails: emails ? emails.split(',') : undefined,
    options: {
      validateMx: url.searchParams.get('validateMx') === 'true',
      validateSMTP: url.searchParams.get('validateSMTP') === 'true',
      validateTypo: url.searchParams.get('validateTypo') !== 'false',
      validateDisposable: url.searchParams.get('validateDisposable') !== 'false',
      validateFree: url.searchParams.get('validateFree') !== 'false',
    },
  };
}

// Edge Runtime handler — no path routing, `email`/`emails` from body or query.
export async function edgeHandler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders('POST, GET, OPTIONS') });
  }

  try {
    let body: ValidationRequestBody;
    if (request.method === 'GET') {
      body = parseGetParams(new URL(request.url));
    } else if (request.method === 'POST') {
      body = await request.json();
    } else {
      return jsonResponse(405, { success: false, error: 'Method not allowed' });
    }

    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message });
    }

    const data = await executeValidation(classified);
    return jsonResponse(
      200,
      { success: true, data },
      jsonHeaders({ ...corsHeaders('POST, GET, OPTIONS'), 'Cache-Control': 'public, max-age=3600' })
    );
  } catch (error) {
    console.error('Vercel Edge error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message });
  }
}

// Node.js runtime handler (Express-style).
export async function nodeHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  try {
    let body: ValidationRequestBody;
    if (req.method === 'GET') {
      const fakeUrl = new URL(req.url, 'http://localhost');
      body = parseGetParams(fakeUrl);
      // Fall back to the parsed query map if the URL was relative without params.
      if (!body.email && !body.emails && req.query) {
        body.email = req.query.email as string | undefined;
        body.emails = req.query.emails ? (req.query.emails as string).split(',') : undefined;
      }
    } else if (req.method === 'POST') {
      body = req.body as ValidationRequestBody;
    } else {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      res.status(classified.status).json({ success: false, error: classified.message });
      return;
    }
    const data = await executeValidation(classified);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel Node error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
};

function requireJsonContentType(request: Request): Response | null {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return jsonResponse(400, { error: 'Content-Type must be application/json' }, ROUTED_HEADERS);
  }
  return null;
}

async function readJsonBody(request: Request): Promise<{ body: unknown } | { error: Response }> {
  try {
    return { body: await request.json() };
  } catch {
    return { error: jsonResponse(400, { error: 'Invalid request body' }, ROUTED_HEADERS) };
  }
}

// Routed handler used by the test suite — `/api/health`, `/api/validate`,
// `/api/validate/batch`.
export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse(
        200,
        { status: 'healthy', platform: 'vercel', timestamp: new Date().toISOString() },
        ROUTED_HEADERS
      );
    }

    const isValidatePath = pathname === '/api/validate' || pathname === '/api/validate/batch';
    if (isValidatePath && request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' }, ROUTED_HEADERS);
    }

    if (pathname === '/api/validate' && request.method === 'POST') {
      const ct = requireJsonContentType(request);
      if (ct) return ct;
      const parsed = await readJsonBody(request);
      if ('error' in parsed) return parsed.error;
      const body = parsed.body as { email?: string };
      if (!body.email) return jsonResponse(400, { error: 'Email is required' }, ROUTED_HEADERS);

      const options: Partial<ValidateEmailOptions> = {};
      if (url.searchParams.has('skipCache')) options.skipCache = url.searchParams.get('skipCache') === 'true';
      if (url.searchParams.has('validateTypo')) options.validateTypo = url.searchParams.get('validateTypo') === 'true';

      const result = await validateEmailCore(body.email, options);
      return jsonResponse(200, result, ROUTED_HEADERS);
    }

    if (pathname === '/api/validate/batch' && request.method === 'POST') {
      const ct = requireJsonContentType(request);
      if (ct) return ct;
      const parsed = await readJsonBody(request);
      if ('error' in parsed) return parsed.error;
      const body = parsed.body as ValidationRequestBody;
      const error = validateBatchEmailsField(body.emails);
      if (error) return jsonResponse(error.status, { error: error.message }, ROUTED_HEADERS);

      const options: { batchSize?: number } = {};
      const batchSizeParam = url.searchParams.get('batchSize');
      if (batchSizeParam) options.batchSize = parseInt(batchSizeParam, 10);

      const results = await validateEmailBatch(body.emails!, options);
      return jsonResponse(200, { results }, ROUTED_HEADERS);
    }

    return jsonResponse(404, { error: 'Not found' }, ROUTED_HEADERS);
  } catch (error) {
    console.error('Handler error:', error);
    return jsonResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

export default {
  edgeHandler,
  nodeHandler,
  handler,
};
