/**
 * Cloudflare Workers adapter for email validation.
 * Supports Workers, Pages Functions, and Durable Objects.
 *
 * Shared validation/CORS logic comes from `../_shared/`.
 */
import type { EmailValidationResult } from '../../types';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody } from '../_shared/validation';
import { EdgeCache, validateEmailBatch, validateEmailCore } from '../verifier';

interface KVNamespace {
  get<T = unknown>(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<T | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CloudflareRequest extends Request {
  cf?: {
    country?: string;
    colo?: string;
    timezone?: string;
  };
}

export interface CloudflareEnv {
  EMAIL_CACHE?: KVNamespace;
  EMAIL_VALIDATOR?: DurableObjectNamespace;
  [key: string]: unknown;
}

export interface CloudflareContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

class KVCache<T> {
  constructor(
    private kv: KVNamespace,
    private ttl: number = 3600
  ) {}

  async get(key: string): Promise<T | undefined> {
    const value = await this.kv.get(key, 'json');
    return value as T | undefined;
  }

  async set(key: string, value: T): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: this.ttl });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, GET, OPTIONS'));

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

async function workerHandler(
  request: CloudflareRequest,
  env: CloudflareEnv,
  ctx: CloudflareContext
): Promise<Response> {
  const kvCache = env.EMAIL_CACHE ? new KVCache<EmailValidationResult>(env.EMAIL_CACHE) : undefined;

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

    // Per-email KV cache short-circuit (single-email path only).
    if (classified.kind === 'single' && kvCache && !classified.options?.skipCache) {
      const cached = await kvCache.get(`email:${classified.email}`);
      if (cached) {
        return new Response(JSON.stringify({ success: true, data: cached, cached: true }), {
          status: 200,
          headers: jsonHeaders({
            ...corsHeaders('POST, GET, OPTIONS'),
            'Cache-Control': 'public, max-age=3600',
            'CF-Cache-Status': 'HIT',
          }),
        });
      }
    }

    const data = await executeValidation(classified);

    // Write-through to KV when the request didn't ask to skip the cache.
    if (kvCache && !classified.options?.skipCache) {
      if (classified.kind === 'single') {
        ctx.waitUntil(kvCache.set(`email:${classified.email}`, data as EmailValidationResult));
      } else {
        const writes = (data as EmailValidationResult[]).map((result, i) =>
          kvCache.set(`email:${classified.emails[i]}`, result)
        );
        ctx.waitUntil(Promise.all(writes));
      }
    }

    const headers = jsonHeaders({
      ...corsHeaders('POST, GET, OPTIONS'),
      'Cache-Control': 'public, max-age=3600',
      ...(classified.kind === 'single' ? { 'CF-Cache-Status': 'MISS' } : {}),
    });
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers });
  } catch (error) {
    console.error('Cloudflare Workers error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message });
  }
}

// Durable Object for stateful validation. The `state` and `env` arguments are
// part of the Durable Object constructor contract but unused here — the cache
// lives entirely in process memory; persisting to `state.storage` is a future
// enhancement, not the current behavior.
export class EmailValidatorDO {
  private readonly cache: EdgeCache<EmailValidationResult>;

  constructor(_state: DurableObjectState, _env: CloudflareEnv) {
    this.cache = new EdgeCache(1000, 3600000);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/validate':
        return this.handleValidation(request);
      case '/cache/clear':
        return this.handleCacheClear();
      case '/cache/stats':
        return this.handleCacheStats();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleValidation(request: Request): Promise<Response> {
    try {
      const requestData: ValidationRequestBody = await request.json();
      const classified = classifyRequest(requestData);
      if (classified.kind === 'invalid') {
        return new Response(JSON.stringify({ success: false, error: classified.message }), {
          status: classified.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const data =
        classified.kind === 'single'
          ? await validateEmailCore(classified.email, classified.options)
          : await validateEmailBatch(classified.emails, classified.options);
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleCacheClear(): Promise<Response> {
    this.cache.clear();
    return new Response(JSON.stringify({ success: true, message: 'Cache cleared' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleCacheStats(): Promise<Response> {
    return new Response(JSON.stringify({ success: true, stats: { size: this.cache.size() } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default {
  fetch: workerHandler,
  workerHandler,
  EmailValidatorDO,
};

export { workerHandler };
