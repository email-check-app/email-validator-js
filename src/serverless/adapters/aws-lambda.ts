/**
 * AWS Lambda adapter — three handler shapes for three deploy modes:
 *
 *   - `handler`           — routed (recommended) — `/health`, `/validate`,
 *                           `/validate/batch`. Wire to API Gateway with
 *                           `{proxy+}` so all three paths land on one Lambda.
 *   - `apiGatewayHandler` — single-route — accepts API Gateway proxy events
 *                           but never inspects `event.path`. Pick this when
 *                           you want one Lambda per URL.
 *   - `lambdaHandler`     — direct invocation — no API Gateway envelope.
 *                           Pick this when calling from another AWS service
 *                           (Step Functions, EventBridge, …).
 *
 * Shared validation rules + CORS headers come from `../_shared/` so all three
 * agree on what's accepted.
 */
import type { ValidateEmailOptions } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody, validateBatchEmailsField } from '../_shared/validation';
import { clearCache, validateEmailCore } from '../verifier';

/**
 * Loose API-Gateway event/result/context shapes — `headers` and similar maps
 * intentionally widen to `string | undefined` so they line up with the
 * official `@types/aws-lambda` definitions used by callers/tests.
 */
export interface APIGatewayProxyEvent {
  body: string | null;
  headers: { [key: string]: string | undefined };
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string | undefined } | null;
  pathParameters: { [key: string]: string | undefined } | null;
  isBase64Encoded?: boolean;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;
}

export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  awsRequestId: string;
  remainingTimeInMillis: number;
}

interface ValidateResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, OPTIONS'));
const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function jsonResponse(statusCode: number, body: unknown, headers: Record<string, string>): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// Single-route API Gateway handler — accepts proxy events but doesn't inspect `event.path`.
export async function apiGatewayHandler(
  event: APIGatewayProxyEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders('POST, OPTIONS'), body: '' };
  }

  try {
    const request: ValidationRequestBody = event.body ? JSON.parse(event.body) : {};
    const classified = classifyRequest(request);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message }, POST_HEADERS);
    }
    const data = await executeValidation(classified);
    return jsonResponse(200, { success: true, data }, POST_HEADERS);
  } catch (error) {
    console.error('Lambda error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message }, POST_HEADERS);
  }
}

// Direct Lambda handler (no API Gateway envelope).
export async function lambdaHandler(event: ValidationRequestBody, _context: LambdaContext): Promise<ValidateResponse> {
  try {
    const classified = classifyRequest(event);
    if (classified.kind === 'invalid') {
      return { success: false, error: classified.message };
    }
    return { success: true, data: await executeValidation(classified) };
  } catch (error) {
    console.error('Lambda error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

// Cache management handler.
export async function cacheHandler(
  event: { action: 'clear' | 'stats' },
  _context: LambdaContext
): Promise<{ success: boolean; message?: string; stats?: unknown }> {
  switch (event.action) {
    case 'clear':
      clearCache();
      return { success: true, message: 'Cache cleared' };
    case 'stats':
      return { success: true, message: 'Cache stats not implemented' };
    default:
      return { success: false, message: 'Invalid action' };
  }
}

/** Decode the API Gateway body, supporting base64-encoded payloads. */
function decodeBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
  return JSON.parse(raw);
}

// Routed handler — supports /health, /validate, /validate/batch. The context
// argument is intentionally `unknown` so callers can pass either our minimal
// LambdaContext or the official `aws-lambda#Context` without a cast.
export async function handler(event: APIGatewayProxyEvent, _context?: unknown): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.path === '/health' && event.httpMethod === 'GET') {
    return jsonResponse(200, { status: 'healthy', timestamp: new Date().toISOString() }, ROUTED_HEADERS);
  }

  const isValidatePath = event.path === '/validate' || event.path === '/validate/batch';
  if (isValidatePath && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, ROUTED_HEADERS);
  }

  if (event.path === '/validate' && event.httpMethod === 'POST') {
    try {
      const body = decodeBody(event) as { email?: string };
      if (!body.email) return jsonResponse(400, { error: 'Email is required' }, ROUTED_HEADERS);

      const options = parseValidateOptions(event.queryStringParameters);
      const result = await validateEmailCore(body.email, options);
      return jsonResponse(200, result, ROUTED_HEADERS);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return jsonResponse(400, { error: 'Invalid request body' }, ROUTED_HEADERS);
      }
      console.error('Validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
    }
  }

  if (event.path === '/validate/batch' && event.httpMethod === 'POST') {
    try {
      const body = decodeBody(event) as ValidationRequestBody;
      const validated = validateBatchEmailsField(body.emails);
      if (!validated.ok) return jsonResponse(validated.status, { error: validated.message }, ROUTED_HEADERS);
      const results = await executeValidation({ kind: 'batch', emails: validated.emails });
      return jsonResponse(200, { results }, ROUTED_HEADERS);
    } catch (error) {
      console.error('Batch validation error:', error);
      return jsonResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
    }
  }

  return jsonResponse(404, { error: 'Not found' }, ROUTED_HEADERS);
}

function parseValidateOptions(query: { [key: string]: string | undefined } | null): Partial<ValidateEmailOptions> {
  if (!query) return {};
  const options: Partial<ValidateEmailOptions> = {};
  if (query.skipCache === 'true') options.skipCache = true;
  if (query.validateTypo === 'false') options.validateTypo = false;
  return options;
}

export default {
  apiGatewayHandler,
  lambdaHandler,
  cacheHandler,
  handler,
};
