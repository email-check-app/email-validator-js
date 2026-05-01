/**
 * Direct unit tests for the CORS / JSON header helpers. These ride along on
 * every adapter response, so even a one-character drift here ripples to every
 * platform.
 */
import { describe, expect, it } from 'bun:test';
import { corsHeaders, jsonHeaders } from '../../src/serverless/_shared/cors';

describe('0511 _shared/cors — corsHeaders', () => {
  it('includes the canonical Access-Control-* triplet', () => {
    const h = corsHeaders();
    expect(h['Access-Control-Allow-Origin']).toBe('*');
    expect(h['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(h['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
  });

  it('uses the caller-provided methods string verbatim', () => {
    expect(corsHeaders('POST, OPTIONS')['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });

  it('returns a fresh object each call (callers may mutate)', () => {
    const a = corsHeaders();
    const b = corsHeaders();
    expect(a).not.toBe(b);
    a['X-Test' as string] = 'mutated';
    expect(b['X-Test' as string]).toBeUndefined();
  });
});

describe('0511 _shared/cors — jsonHeaders', () => {
  it('always includes Content-Type: application/json', () => {
    expect(jsonHeaders()['Content-Type']).toBe('application/json');
  });

  it('layers extra headers on top without dropping Content-Type', () => {
    const h = jsonHeaders({ 'X-Powered-By': 'unit-test' });
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-Powered-By']).toBe('unit-test');
  });

  it('lets extra headers override Content-Type when caller insists', () => {
    // Edge case: a caller explicitly setting a different Content-Type.
    // The current contract spreads `extra` after Content-Type, so extra wins.
    const h = jsonHeaders({ 'Content-Type': 'text/plain' });
    expect(h['Content-Type']).toBe('text/plain');
  });

  it('composes cleanly with corsHeaders()', () => {
    const h = jsonHeaders(corsHeaders('POST, OPTIONS'));
    expect(h['Content-Type']).toBe('application/json');
    expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });
});
